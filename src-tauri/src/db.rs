use rusqlite::{Connection, Result as SqliteResult, params};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

use crate::types::{CollectionItemInput, CollectionItemRow, CollectionRow, ResourceItem};

/// 获取数据库文件路径
/// 生产环境: Tauri app_data_dir()/data/app.db
/// 开发环境: 如果 app_data_dir 不可用则 fallback 到 data/app.db
pub fn get_db_path(app_handle: &tauri::AppHandle) -> PathBuf {
    if let Ok(mut path) = app_handle.path().app_data_dir() {
        path.push("data");
        std::fs::create_dir_all(&path).ok();
        path.push("app.db");
        path
    } else {
        PathBuf::from("data/app.db")
    }
}

/// 初始化数据库连接并建表
pub fn init_connection(db_path: &PathBuf) -> SqliteResult<Connection> {
    let conn = Connection::open(db_path)?;

    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;

    // 3 张表结构照搬 MC-Mod-Hub src/lib/db.ts 的 initTables()
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS collections (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            collection_type TEXT NOT NULL DEFAULT 'mod',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS collection_items (
            id TEXT PRIMARY KEY,
            collection_id TEXT NOT NULL,
            resource_id TEXT NOT NULL,
            source TEXT NOT NULL,
            name TEXT NOT NULL,
            summary TEXT DEFAULT '',
            icon_url TEXT,
            download_count INTEGER DEFAULT 0,
            author TEXT DEFAULT '',
            resource_type TEXT DEFAULT 'mod',
            categories TEXT DEFAULT '[]',
            game_versions TEXT DEFAULT '[]',
            added_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS recently_viewed (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            resource_id TEXT NOT NULL,
            source TEXT NOT NULL,
            name TEXT NOT NULL,
            summary TEXT DEFAULT '',
            icon_url TEXT,
            resource_type TEXT DEFAULT 'mod',
            viewed_at TEXT NOT NULL DEFAULT (datetime('now'))
        );"
    )?;

    // 兼容旧表：尝试添加 collection_type 列（已有则忽略）
    conn.execute_batch(
        "ALTER TABLE collections ADD COLUMN collection_type TEXT NOT NULL DEFAULT 'mod';"
    ).ok();

    Ok(conn)
}

/// 数据库操作封装
/// 所有公开方法通过这个 struct 暴露给 commands 使用
pub struct Database {
    pub conn: Mutex<Connection>,
}

impl Database {
    pub fn new(db_path: &PathBuf) -> SqliteResult<Self> {
        let conn = init_connection(db_path)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    // ==================== Collections ====================

    /// 获取所有收藏夹列表
    pub fn list_collections(&self) -> Result<Vec<CollectionRow>, String> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = conn.prepare(
            "SELECT id, name, description, collection_type, created_at, updated_at,
                    (SELECT COUNT(*) FROM collection_items WHERE collection_id = c.id) as item_count
             FROM collections c ORDER BY updated_at DESC"
        ).map_err(|e| format!("查询收藏夹失败: {}", e))?;

        let rows = stmt.query_map([], |row| {
            Ok(CollectionRow {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get::<_, String>(2).unwrap_or_default(),
                collection_type: row.get::<_, String>(3).unwrap_or_else(|_| "mod".into()),
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
                item_count: row.get::<_, i64>(6).unwrap_or(0) as u32,
            })
        }).map_err(|e| format!("映射收藏夹行失败: {}", e))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("收集收藏夹失败: {}", e))
    }

    /// 创建收藏夹
    pub fn create_collection(&self, name: &str, description: &str, collection_type: &str) -> Result<CollectionRow, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "INSERT INTO collections (id, name, description, collection_type) VALUES (?1, ?2, ?3, ?4)",
            params![id, name, description, collection_type],
        ).map_err(|e| format!("创建收藏夹失败: {}", e))?;
        Ok(CollectionRow {
            id,
            name: name.to_string(),
            description: description.to_string(),
            collection_type: collection_type.to_string(),
            created_at: String::new(),
            updated_at: String::new(),
            item_count: 0,
        })
    }

    /// 重命名收藏夹
    pub fn update_collection(&self, id: &str, name: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let affected = conn.execute(
            "UPDATE collections SET name = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![name, id],
        ).map_err(|e| format!("更新收藏夹失败: {}", e))?;
        if affected == 0 {
            return Err("收藏夹不存在".into());
        }
        Ok(())
    }

    /// 删除收藏夹（级联删除其下所有 items）
    pub fn delete_collection(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute("DELETE FROM collection_items WHERE collection_id = ?1", params![id])
            .map_err(|e| format!("删除收藏夹项目失败: {}", e))?;
        let affected = conn.execute("DELETE FROM collections WHERE id = ?1", params![id])
            .map_err(|e| format!("删除收藏夹失败: {}", e))?;
        if affected == 0 {
            return Err("收藏夹不存在".into());
        }
        Ok(())
    }

    // ==================== Collection Items ====================

    /// 添加资源到收藏夹（含类型校验）
    pub fn add_item(&self, collection_id: &str, item: &CollectionItemInput) -> Result<(), String> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());

        // 查询收藏夹类型
        let collection_type: String = conn.query_row(
            "SELECT collection_type FROM collections WHERE id = ?1",
            params![collection_id],
            |row| row.get(0),
        ).map_err(|_| "收藏夹不存在".to_string())?;

        // 类型校验：mod 收藏夹只能收 mod，shader 只能收 shader，以此类推
        if collection_type != item.resource_type {
            let type_label = match collection_type.as_str() {
                "mod" => "Mod",
                "shader" => "光影",
                "resourcepack" => "资源包",
                _ => &collection_type,
            };
            return Err(format!("该收藏夹仅能收藏 {} 类型的资源", type_label));
        }

        let id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO collection_items (id, collection_id, resource_id, source, name, summary, icon_url, download_count, author, resource_type, categories, game_versions)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                id, collection_id,
                item.resource_id, item.source, item.name, item.summary,
                item.icon_url, item.download_count, item.author,
                item.resource_type, item.categories, item.game_versions,
            ],
        ).map_err(|e| format!("添加收藏失败: {}", e))?;

        // 同时更新 collection 的 updated_at
        conn.execute(
            "UPDATE collections SET updated_at = datetime('now') WHERE id = ?1",
            params![collection_id],
        ).ok();

        Ok(())
    }

    /// 从收藏夹移除资源
    pub fn remove_item(&self, collection_id: &str, item_id: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let affected = conn.execute(
            "DELETE FROM collection_items WHERE collection_id = ?1 AND id = ?2",
            params![collection_id, item_id],
        ).map_err(|e| format!("移除收藏失败: {}", e))?;
        if affected == 0 {
            return Err("未找到该收藏项目".into());
        }
        Ok(())
    }

    /// 获取收藏夹内所有资源
    pub fn list_items(&self, collection_id: &str) -> Result<Vec<CollectionItemRow>, String> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = conn.prepare(
            "SELECT id, collection_id, resource_id, source, name, summary, icon_url,
                    download_count, author, resource_type, categories, game_versions, added_at
             FROM collection_items WHERE collection_id = ?1 ORDER BY added_at DESC"
        ).map_err(|e| format!("查询收藏夹项目失败: {}", e))?;

        let rows = stmt.query_map(params![collection_id], |row| {
            Ok(CollectionItemRow {
                id: row.get(0)?,
                collection_id: row.get(1)?,
                resource_id: row.get(2)?,
                source: row.get(3)?,
                name: row.get(4)?,
                summary: row.get::<_, String>(5).unwrap_or_default(),
                icon_url: row.get(6)?,
                download_count: row.get::<_, i64>(7).unwrap_or(0) as u64,
                author: row.get::<_, String>(8).unwrap_or_default(),
                resource_type: row.get::<_, String>(9).unwrap_or_else(|_| "mod".into()),
                categories: row.get::<_, String>(10).unwrap_or_else(|_| "[]".into()),
                game_versions: row.get::<_, String>(11).unwrap_or_else(|_| "[]".into()),
                added_at: row.get(12)?,
            })
        }).map_err(|e| format!("映射收藏项目行失败: {}", e))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("收集收藏项目失败: {}", e))
    }

    // ==================== Recently Viewed ====================

    /// 记录最近浏览（如已存在则更新 viewed_at）
    pub fn record_recently_viewed(&self, resource: &ResourceItem) -> Result<(), String> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        // 先删重复记录（同一 resource_id + source）
        conn.execute(
            "DELETE FROM recently_viewed WHERE resource_id = ?1 AND source = ?2",
            params![resource.id, resource.source],
        ).ok();
        // 插入新记录（viewed_at 自动为当前时间）
        conn.execute(
            "INSERT INTO recently_viewed (resource_id, source, name, summary, icon_url, resource_type)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                resource.id, resource.source, resource.name,
                resource.summary, resource.icon_url, resource.resource_type,
            ],
        ).map_err(|e| format!("记录最近浏览失败: {}", e))?;

        // 保持最多 50 条
        conn.execute(
            "DELETE FROM recently_viewed WHERE id NOT IN (
                SELECT id FROM recently_viewed ORDER BY viewed_at DESC LIMIT 50
            )",
            params![],
        ).ok();

        Ok(())
    }

    /// 获取最近浏览列表
    pub fn list_recently_viewed(&self, limit: u32) -> Result<Vec<ResourceItem>, String> {
        let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = conn.prepare(
            "SELECT resource_id, source, name, summary, icon_url, resource_type
             FROM recently_viewed ORDER BY viewed_at DESC LIMIT ?1"
        ).map_err(|e| format!("查询最近浏览失败: {}", e))?;

        let rows = stmt.query_map(params![limit], |row| {
            Ok(ResourceItem {
                id: row.get(0)?,
                source: row.get(1)?,
                name: row.get::<_, String>(2).unwrap_or_default(),
                summary: row.get::<_, String>(3).unwrap_or_default(),
                icon_url: row.get(4)?,
                resource_type: row.get::<_, String>(5).unwrap_or_else(|_| "mod".into()),
                download_count: 0,
                author: String::new(),
                categories: vec![],
                game_versions: vec![],
                created_at: String::new(),
                updated_at: String::new(),
            })
        }).map_err(|e| format!("映射最近浏览行失败: {}", e))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("收集最近浏览失败: {}", e))
    }
}
