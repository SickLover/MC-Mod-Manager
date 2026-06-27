use serde::{Deserialize, Serialize};
use tauri::{command, State};
use crate::AppState;
use chrono::Utc;

// ==================== 类型定义 ====================

/// Mod 清单文件格式
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub version: u32,
    pub exported_at: String,
    pub collection_name: String,
    pub mods: Vec<ManifestMod>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestMod {
    pub name: String,
    pub loader: String,
}

/// 前端传入的导出项（仅 name + loader）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestExportItem {
    pub name: String,
    pub loader: String,
}

/// 导入结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub added: u32,
    pub skipped: u32,
    pub errors: Vec<String>,
}

// ==================== 文件对话框 (rfd) ====================

#[command]
pub async fn pick_save_file(default_name: String) -> Result<String, String> {
    rfd::AsyncFileDialog::new()
        .set_file_name(&default_name)
        .add_filter("Mod 清单", &["json"])
        .save_file()
        .await
        .map(|handle| handle.path().to_string_lossy().to_string())
        .ok_or_else(|| "取消选择".to_string())
}

#[command]
pub async fn pick_open_file() -> Result<String, String> {
    rfd::AsyncFileDialog::new()
        .add_filter("Mod 清单", &["json", "mcmodlist.json"])
        .pick_file()
        .await
        .map(|handle| handle.path().to_string_lossy().to_string())
        .ok_or_else(|| "取消选择".to_string())
}

// ==================== 导出 ====================

#[command]
pub async fn export_manifest(
    _state: State<'_, AppState>,
    items: Vec<ManifestExportItem>,
    collection_name: String,
    save_path: String,
) -> Result<(), String> {
    let manifest = Manifest {
        version: 1,
        exported_at: Utc::now().to_rfc3339(),
        collection_name,
        mods: items.into_iter().map(|i| ManifestMod {
            name: i.name,
            loader: standardize_loader(&i.loader),
        }).collect(),
    };

    let json = serde_json::to_string_pretty(&manifest)
        .map_err(|e| format!("JSON 序列化失败: {}", e))?;

    std::fs::write(&save_path, json)
        .map_err(|e| format!("写入文件失败: {}", e))?;

    Ok(())
}

// ==================== 导入 ====================

#[command]
pub async fn import_manifest(
    state: State<'_, AppState>,
    collection_id: String,
    file_path: String,
) -> Result<ImportResult, String> {
    let json = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("读取文件失败: {}", e))?;

    let manifest: Manifest = serde_json::from_str(&json)
        .map_err(|e| format!("JSON 解析失败: {}. 请检查文件格式是否为有效的 Mod 清单。", e))?;

    if manifest.version != 1 {
        return Err(format!("不支持的清单版本: {}. 当前仅支持 version 1。", manifest.version));
    }

    if manifest.mods.is_empty() {
        return Err("清单为空，没有可导入的 Mod。".into());
    }

    let mut added = 0u32;
    let mut skipped = 0u32;
    let mut errors: Vec<String> = Vec::new();

    // 获取已有 items（用于去重）
    let existing = state.db.list_items(&collection_id)?;

    for mod_entry in &manifest.mods {
        let normalized_loader = standardize_loader(&mod_entry.loader);

        // 去重检查：同一 collection 内 name + loader 相同
        let is_dup = existing.iter().any(|item| {
            item.name.eq_ignore_ascii_case(&mod_entry.name)
                && item.resource_type.eq_ignore_ascii_case(&normalized_loader)
        });

        if is_dup {
            skipped += 1;
            continue;
        }

        // 插入（minimal item）
        // 用 "mod" 作为 resource_type 以通过收藏夹类型校验
        // 加载器信息存入 categories 字段
        let input = crate::types::CollectionItemInput {
            resource_id: uuid::Uuid::new_v4().to_string(),
            source: "imported".into(),
            name: mod_entry.name.clone(),
            summary: String::new(),
            icon_url: None,
            download_count: 0,
            author: String::new(),
            resource_type: "mod".into(),
            categories: serde_json::to_string(&[&normalized_loader]).unwrap_or_default(),
            game_versions: "[]".into(),
        };

        match state.db.add_item(&collection_id, &input) {
            Ok(_) => added += 1,
            Err(e) => errors.push(format!("{}: {}", mod_entry.name, e)),
        }
    }

    Ok(ImportResult {
        added,
        skipped,
        errors,
    })
}

// ==================== 工具函数 ====================

/// 加载器名称标准化
fn standardize_loader(loader: &str) -> String {
    match loader.to_lowercase().as_str() {
        "forge" => "Forge".into(),
        "fabric" => "Fabric".into(),
        "neoforge" => "NeoForge".into(),
        "quilt" => "Quilt".into(),
        "rift" => "Rift".into(),
        "liteloader" => "LiteLoader".into(),
        other => {
            // 首字母大写
            let mut c = other.chars();
            match c.next() {
                Some(first) => first.to_uppercase().collect::<String>() + c.as_str(),
                None => String::new(),
            }
        }
    }
}
