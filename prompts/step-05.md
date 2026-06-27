# 开发执行 Prompt — MC Mod Hub 轻量化版 Step 5

> 具体产品需求请参考 `D:\vibe coding\projects\MC-Mod-Hub\requirements.md`，技术方案参考本目录 `technical-design.md`，迁移方案参考本目录 `migration-plan.md`，开发规则参考本目录 `AGENTS.md`。

---

## 项目背景

MC Mod Hub 轻量化版，基于 Tauri + Vite + React SPA。

- Step 1：项目骨架 + 搜索链路
- Step 2：数据库层（SQLite 3 张表）+ Navbar + 7 个占位页
- Step 3：首页完成（HotSection + popular command + ContextMenu）
- Step 4：资源详情页 + 单文件下载（ResourceHeader / VersionSelector / DownloadButton）
- **当前**：收藏夹页面仍是占位状态，右键菜单「添加到收藏夹」只弹 Toast 占位

## 第五步目标

**收藏夹管理 CRUD 完整实现 + ContextMenu「添加到收藏夹」打通。**

具体产出：
1. Rust 端：`commands/collections.rs` — 7 个 CRUD command（list / create / update / delete / add_item / remove_item / list_items）
2. Rust 端：`db.rs` 扩展 — 对应的数据库查询方法
3. 前端：`CollectionCard` 组件（从 MC-Mod-Hub 复制，适配路由）
4. 前端：`CollectionsPage` 完整实现 — 列表 + 新建表单 + 重命名 Modal + 删除确认
5. 前端：ContextMenu「添加到收藏夹」→ 弹出收藏夹选择 Modal → 确认添加
6. `CollectionDetailPage` 暂时保持占位状态（Step 7 实现）

> Step 5 完成后，用户可以从搜索结果/热门板块的右键菜单，把资源添加到收藏夹。**但收藏夹详情页（资源列表、批量下载）留给 Step 7。**

---

## 需要创建/修改的文件

### 新建文件

```
src-tauri/src/commands/collections.rs   — 7 个 CRUD command
src/components/collection/CollectionCard.tsx — 收藏夹卡片（从 MC-Mod-Hub 复制）
src/components/collection/CollectionSelectModal.tsx — 选择收藏夹弹窗（从 ContextMenu 触发）
```

### 修改文件

```
src-tauri/src/db.rs                     — 加 CRUD 查询方法
src-tauri/src/commands/mod.rs           — 加 pub mod collections
src-tauri/src/lib.rs                    — 注册 7 个 collections command
src/pages/CollectionsPage.tsx           — 替换占位为完整 CRUD 页面
src/components/home/ContextMenu.tsx     — 「添加到收藏夹」onClick 改为打开选择弹窗
src/components/home/ResourceCard.tsx    — 传递 ContextMenu 的 source+id 给 Modal
```

> 如有需要，`src/types/index.ts` 追加 `Collection` / `CollectionItem` 类型。

---

## 开发步骤

### Step 5.1 — 数据库查询方法扩展

`src-tauri/src/db.rs` — 在 `Database` struct 上追加以下方法：

```rust
use rusqlite::params;

impl Database {
    // ==================== Collections ====================

    /// 获取所有收藏夹列表
    pub fn list_collections(&self) -> Result<Vec<CollectionRow>, String> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, description, created_at, updated_at,
                    (SELECT COUNT(*) FROM collection_items WHERE collection_id = c.id) as item_count
             FROM collections c ORDER BY updated_at DESC"
        ).map_err(|e| format!("查询收藏夹失败: {}", e))?;

        let rows = stmt.query_map([], |row| {
            Ok(CollectionRow {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get::<_, String>(2).unwrap_or_default(),
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
                item_count: row.get(5)?,
            })
        }).map_err(|e| format!("映射收藏夹行失败: {}", e))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("收集收藏夹失败: {}", e))
    }

    /// 创建收藏夹
    pub fn create_collection(&self, name: &str, description: &str) -> Result<CollectionRow, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO collections (id, name, description) VALUES (?1, ?2, ?3)",
            params![id, name, description],
        ).map_err(|e| format!("创建收藏夹失败: {}", e))?;
        Ok(CollectionRow {
            id,
            name: name.to_string(),
            description: description.to_string(),
            created_at: String::new(),
            updated_at: String::new(),
            item_count: 0,
        })
    }

    /// 重命名收藏夹
    pub fn update_collection(&self, id: &str, name: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE collections SET name = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![name, id],
        ).map_err(|e| format!("更新收藏夹失败: {}", e))?;
        Ok(())
    }

    /// 删除收藏夹（级联删除其下所有 items）
    pub fn delete_collection(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM collection_items WHERE collection_id = ?1", params![id])
            .map_err(|e| format!("删除收藏夹项目失败: {}", e))?;
        conn.execute("DELETE FROM collections WHERE id = ?1", params![id])
            .map_err(|e| format!("删除收藏夹失败: {}", e))?;
        Ok(())
    }

    // ==================== Collection Items ====================

    /// 添加资源到收藏夹
    pub fn add_item(&self, collection_id: &str, item: &CollectionItemInput) -> Result<(), String> {
        let id = uuid::Uuid::new_v4().to_string();
        let conn = self.conn.lock().unwrap();
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
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "DELETE FROM collection_items WHERE collection_id = ?1 AND id = ?2",
            params![collection_id, item_id],
        ).map_err(|e| format!("移除收藏失败: {}", e))?;
        Ok(())
    }

    /// 获取收藏夹内所有资源
    pub fn list_items(&self, collection_id: &str) -> Result<Vec<CollectionItemRow>, String> {
        let conn = self.conn.lock().unwrap();
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
}
```

所需 Rust struct（追加到 `types.rs`）：

```rust
/// 收藏夹行（从数据库读出）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionRow {
    pub id: String,
    pub name: String,
    pub description: String,
    pub created_at: String,
    pub updated_at: String,
    pub item_count: u32,
}

/// 收藏项目行（从数据库读出）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionItemRow {
    pub id: String,
    pub collection_id: String,
    pub resource_id: String,
    pub source: String,
    pub name: String,
    pub summary: String,
    pub icon_url: Option<String>,
    pub download_count: u64,
    pub author: String,
    pub resource_type: String,
    pub categories: String,       // JSON 字符串
    pub game_versions: String,    // JSON 字符串
    pub added_at: String,
}

/// 添加收藏的输入
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionItemInput {
    pub resource_id: String,
    pub source: String,
    pub name: String,
    pub summary: String,
    pub icon_url: Option<String>,
    pub download_count: u64,
    pub author: String,
    pub resource_type: String,
    pub categories: String,       // JSON 字符串
    pub game_versions: String,    // JSON 字符串
}
```

**Cargo.toml 加依赖**：

```toml
uuid = { version = "1", features = ["v4"] }
```

### Step 5.2 — collections commands

`src-tauri/src/commands/collections.rs` — 7 个 command：

```rust
use tauri::State;
use crate::AppState;
use crate::types::{CollectionRow, CollectionItemRow, CollectionItemInput};

#[tauri::command]
pub async fn list_collections(state: State<'_, AppState>) -> Result<Vec<CollectionRow>, String> {
    state.db.list_collections()
}

#[tauri::command]
pub async fn create_collection(
    name: String,
    description: Option<String>,
    state: State<'_, AppState>,
) -> Result<CollectionRow, String> {
    state.db.create_collection(&name, &description.unwrap_or_default())
}

#[tauri::command]
pub async fn update_collection(
    id: String,
    name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.db.update_collection(&id, &name)
}

#[tauri::command]
pub async fn delete_collection(
    id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.db.delete_collection(&id)
}

#[tauri::command]
pub async fn add_item_to_collection(
    collection_id: String,
    item: CollectionItemInput,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.db.add_item(&collection_id, &item)
}

#[tauri::command]
pub async fn remove_item_from_collection(
    collection_id: String,
    item_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.db.remove_item(&collection_id, &item_id)
}

#[tauri::command]
pub async fn list_collection_items(
    collection_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<CollectionItemRow>, String> {
    state.db.list_items(&collection_id)
}
```

### Step 5.3 — 注册 command

`commands/mod.rs` — 追加 `pub mod collections;`

`lib.rs` — `invoke_handler` 中追加全部 7 个 command：

```rust
.invoke_handler(tauri::generate_handler![
    commands::search::search,
    commands::popular::popular,
    commands::resource::get_resource_detail,
    commands::download::download_file,
    commands::collections::list_collections,
    commands::collections::create_collection,
    commands::collections::update_collection,
    commands::collections::delete_collection,
    commands::collections::add_item_to_collection,
    commands::collections::remove_item_from_collection,
    commands::collections::list_collection_items,
])
```

### Step 5.4 — 前端类型更新

`src/types/index.ts` — 追加（与 Rust struct 对等）：

```typescript
export interface Collection {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
}

export interface CollectionItem {
  id: string;
  collectionId: string;
  resourceId: string;
  source: string;
  name: string;
  summary: string;
  iconUrl: string | null;
  downloadCount: number;
  author: string;
  resourceType: string;
  categories: string;      // JSON string
  gameVersions: string;    // JSON string
  addedAt: string;
}
```

### Step 5.5 — CollectionCard 组件

`src/components/collection/CollectionCard.tsx` — 从 MC-Mod-Hub 直接复制，仅做适配：

| 原代码 | 改为 |
|--------|------|
| `next/link` → `Link` | `react-router-dom` → `Link` |
| 路由 `href="/collections/${id}"` | `to={"/collections/" + id}` |
| `'use client'` | 删除 |

组件结构（从 MC-Mod-Hub 照搬）：
- 卡片显示：收藏夹名称 + 项目数量 tag + 创建日期
- 点击跳转到 `/collections/:id`（占位页，Step 7 实现）
- 右键或操作按钮：重命名 / 删除

### Step 5.6 — CollectionsPage 完整实现

`src/pages/CollectionsPage.tsx` — 替换占位内容：

核心功能：
- **列表**：`invoke('list_collections')` → 渲染 `CollectionCard` 网格
- **新建**：底部输入框或顶部按钮 → 弹出输入 → `invoke('create_collection', { name })` → 刷新列表
- **重命名**：点击重命名按钮 → 弹出 Modal 输入新名称 → `invoke('update_collection', { id, name })`
- **删除**：点击删除 → 弹出确认对话框 → `invoke('delete_collection', { id })`
- 空状态：使用 `Empty` 组件（"还没有收藏夹，创建一个吧"）

```tsx
import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import type { Collection } from '@/types';
import CollectionCard from '@/components/collection/CollectionCard';
import Loading from '@/components/common/Loading';
import Empty from '@/components/common/Empty';
import { useToast } from '@/components/common/ToastProvider';

export default function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const { showToast } = useToast();

  const loadCollections = useCallback(async () => {
    try {
      const data = await invoke<Collection[]>('list_collections');
      setCollections(data);
    } catch (err) {
      showToast(`加载失败: ${String(err)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadCollections(); }, [loadCollections]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await invoke('create_collection', { name: newName.trim() });
      setNewName('');
      setShowCreate(false);
      showToast('收藏夹已创建', 'success');
      loadCollections();
    } catch (err) {
      showToast(`创建失败: ${String(err)}`, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此收藏夹？')) return;
    try {
      await invoke('delete_collection', { id });
      showToast('已删除', 'success');
      loadCollections();
    } catch (err) {
      showToast(`删除失败: ${String(err)}`, 'error');
    }
  };

  // ... 重命名 Modal、新建表单等
  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* 标题 + 新建按钮 */}
      {/* 列表 / Empty / Loading */}
    </div>
  );
}
```

### Step 5.7 — ContextMenu「添加到收藏夹」打通

**流程**：右键 ResourceCard → 点击「添加到收藏夹」→ 弹出 `CollectionSelectModal` → 选一个收藏夹 → `invoke('add_item_to_collection', ...)` → Toast 成功。

**`CollectionSelectModal` 组件**（`src/components/collection/CollectionSelectModal.tsx`）：

```tsx
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { createPortal } from 'react-dom';
import type { Collection, ResourceItem } from '@/types';
import { useToast } from '@/components/common/ToastProvider';

interface Props {
  resource: ResourceItem;
  onClose: () => void;
}

export default function CollectionSelectModal({ resource, onClose }: Props) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    invoke<Collection[]>('list_collections')
      .then(setCollections)
      .catch(() => showToast('加载收藏夹失败', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const handleSelect = async (collectionId: string) => {
    try {
      await invoke('add_item_to_collection', {
        collectionId,
        item: {
          resourceId: resource.id,
          source: resource.source,
          name: resource.name,
          summary: resource.summary || '',
          iconUrl: resource.iconUrl || null,
          downloadCount: resource.downloadCount,
          author: resource.author || '',
          resourceType: resource.type,
          categories: JSON.stringify(resource.categories || []),
          gameVersions: JSON.stringify(resource.gameVersions || []),
        },
      });
      showToast(`已添加到收藏夹`, 'success');
      onClose();
    } catch (err) {
      showToast(`添加失败: ${String(err)}`, 'error');
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50"
         onClick={onClose}>
      <div className="bg-mc-card rounded-mc border border-mc-border p-6 w-96 max-h-96 overflow-y-auto"
           onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-mc-text mb-4">添加到收藏夹</h3>
        {loading ? (
          <p className="text-mc-muted text-sm">加载中...</p>
        ) : collections.length === 0 ? (
          <p className="text-mc-muted text-sm">暂无收藏夹，请先创建</p>
        ) : (
          <div className="space-y-1">
            {collections.map(c => (
              <button
                key={c.id}
                onClick={() => handleSelect(c.id)}
                className="w-full text-left px-3 py-2 rounded-md hover:bg-mc-card-hover
                           transition-colors duration-200 text-mc-text text-sm"
              >
                📁 {c.name}
                <span className="text-mc-muted ml-2">({c.itemCount})</span>
              </button>
            ))}
          </div>
        )}
        <button onClick={onClose}
          className="mt-4 w-full py-2 text-mc-muted text-sm hover:text-mc-text transition-colors">
          取消
        </button>
      </div>
    </div>,
    document.body,
  );
}
```

**ResourceCard 改动**：在 ContextMenu 的 items 中，「添加到收藏夹」的 `onClick` 改为设置 state 打开 `CollectionSelectModal`。

需要把 `resource` 对象传给 Modal。最简单的方式：在 ResourceCard 加一个 state 控制 Modal 显示，ContextMenu 的 onClick close 后打开它。

### Step 5.8 — 验证步骤

```bash
# 1. Rust 编译检查
cd src-tauri
cargo check
# 预期：uuid + 7 个 collections command 编译通过

# 2. 前端 TypeScript 检查
npx tsc --noEmit

# 3. Tauri 启动验证
npm run tauri dev
```

**验证清单**：
- [ ] 导航到 `/collections` → 看到收藏夹列表（空列表 + Empty 组件）
- [ ] 新建收藏夹 → 输入名称 → 确认 → 列表出现新卡片
- [ ] 重命名收藏夹 → Modal 输入 → 确认 → 名称更新
- [ ] 删除收藏夹 → 确认框 → 卡片消失
- [ ] 首页右键资源卡片 → 「添加到收藏夹」→ 弹出选择 Modal
- [ ] Modal 列出所有收藏夹 → 选择一个 → Toast "已添加"
- [ ] 重复添加同一资源到同一收藏夹——检查是否去重（可选，非必需）

---

## 约束条件

- ❌ **不要**实现收藏夹详情页（CollectionDetailPage 保持占位）——Step 7 做
- ❌ **不要**做批量下载——Step 7 做
- ❌ **不要**改动已有的搜索/热门/资源详情/下载逻辑
- ❌ **不要**改动数据库表结构——3 张表已在 Step 2 建立
- ✅ `CollectionSelectModal` 用 `createPortal` 到 body（与 ContextMenu 一致）
- ✅ 所有数据库操作通过 Rust command → `invoke()`，前端不直接操作 SQLite
- ✅ 添加资源时 `categories` / `gameVersions` 存为 JSON 字符串（与表结构一致）

---

## MC-Mod-Hub 源码参考

| 目标文件 | 来源 |
|---------|------|
| `CollectionCard.tsx` | MC-Mod-Hub `src/components/collection/CollectionCard.tsx` |
| `CollectionsPage.tsx` 逻辑 | MC-Mod-Hub `src/app/collections/page.tsx` |
| `db.rs` CRUD 逻辑 | MC-Mod-Hub `src/lib/db.ts`（`execAndSave` / `queryAll` / `queryOne` 模式） |

---

## 完成后

完成后告诉我：
1. `cargo check` 是否通过
2. 收藏夹 CRUD 是否正常（新建/重命名/删除）
3. 右键菜单「添加到收藏夹」→ 选择 Modal → 是否成功添加
4. 收藏夹详情页是否仍为占位状态（确保没越界实现）
5. 实际执行中做了什么与计划不同的改动

---

## 应急方案说明

> 如需插入新功能：先读 `migration-plan.md` §12。B/C/D 级功能从 Step 2 后即可安全插入。
> 新功能铁律：新文件 + 注册文件末尾加行，不改已有类型和表。

**本对话只做 Step 5 的收藏夹 CRUD + ContextMenu 添加打通，不做收藏夹详情和批量下载。**
