# 开发执行 Prompt — MC Mod Hub 轻量化版 Step 7

> 具体产品需求请参考 `D:\vibe coding\projects\MC-Mod-Hub\requirements.md`，技术方案参考本目录 `technical-design.md`，迁移方案参考本目录 `migration-plan.md`，开发规则参考本目录 `AGENTS.md`。

---

## 项目背景

MC Mod Hub 轻量化版，基于 Tauri + Vite + React SPA。

- Step 1–3：骨架 + 搜索 + 首页热门 + 右键菜单
- Step 4：资源详情 + 单文件下载
- Step 5–6：收藏夹 CRUD + 详情页 + 批量下载
- **当前**：分类浏览 / 更新提醒页面仍是占位，首页无最近浏览板块，最近浏览无数据记录

## 第七步目标

**分类浏览分页 + 最近浏览记录 + 更新提醒页面完整实现。**

具体产出：
1. Rust 端：`recently_viewed` 记录写入（资源详情页打开时自动记录）
2. Rust 端：`list_recently_viewed` command — 查询最近浏览
3. Rust 端：`category` command — 按类型分页浏览（调 CF+MR 的 search + facets）
4. 前端：`CategoryPage` 完整实现 — 分页（PAGE_SIZE=20）+ 页码按钮 + 跳页输入
5. 前端：`RecentlyViewed` 组件 — 首页展示最近浏览的缩略卡
6. 前端：`UpdateAlerts` 组件 — 首页提醒有新版本资源
7. 前端：`UpdatesPage` 完整实现 — 按类型分组显示更新提醒列表

> Step 7 完成后，所有 8 个页面全部可用。仅剩设置页（Step 8）和打包（Step 9–10）。

---

## 需要创建/修改的文件

### 新建文件

```
src-tauri/src/commands/category.rs        — 分类浏览 command（调 CF+MR 分页）
src-tauri/src/commands/recently_viewed.rs — 最近浏览相关 command
src-tauri/src/commands/updates.rs         — 更新提醒 command
src/components/home/RecentlyViewed.tsx     — 最近浏览组件（从 MC-Mod-Hub 复制）
src/components/home/UpdateAlerts.tsx       — 更新提醒入口组件（从 MC-Mod-Hub 复制）
```

### 修改文件

```
src-tauri/src/db.rs                       — 加 recently_viewed CRUD
src-tauri/src/commands/mod.rs             — 加 3 个新模块
src-tauri/src/lib.rs                      — 注册新 command
src/pages/CategoryPage.tsx                — 替换占位为完整实现
src/pages/UpdatesPage.tsx                 — 替换占位为完整实现
src/pages/HomePage.tsx                    — 加 RecentlyViewed + UpdateAlerts 板块
src/pages/ResourcePage.tsx               — 资源详情页打开时记录 to recently_viewed
src/types/index.ts                        — 追加分页/更新提醒等类型（如需）
```

---

## 开发步骤

### Step 7.1 — db.rs 扩展：recently_viewed CRUD

`src-tauri/src/db.rs` — 追加方法：

```rust
impl Database {
    /// 记录最近浏览（如已存在则更新 viewed_at）
    pub fn record_recently_viewed(&self, resource: &ResourceItem) -> Result<(), String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "DELETE FROM recently_viewed WHERE resource_id = ?1 AND source = ?2",
            params![resource.id, resource.source],
        ).ok();
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
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT resource_id, source, name, summary, icon_url, resource_type, download_count, author,
                    categories, game_versions, created_at, updated_at
             FROM recently_viewed ORDER BY viewed_at DESC LIMIT ?1"
        ).map_err(|e| format!("查询最近浏览失败: {}", e))?;

        let rows = stmt.query_map(params![limit], |row| {
            Ok(ResourceItem {
                id: row.get(0)?,
                source: row.get(1)?,
                resource_type: row.get::<_, String>(5).unwrap_or_else(|_| "mod".into()),
                name: row.get(2)?,
                summary: row.get::<_, String>(3).unwrap_or_default(),
                icon_url: row.get(4)?,
                download_count: row.get::<_, i64>(6).unwrap_or(0) as u64,
                author: row.get::<_, String>(7).unwrap_or_default(),
                categories: row.get::<_, String>(8)
                    .and_then(|s: String| serde_json::from_str(&s).ok())
                    .unwrap_or_default(),
                game_versions: row.get::<_, String>(9)
                    .and_then(|s: String| serde_json::from_str(&s).ok())
                    .unwrap_or_default(),
                created_at: row.get::<_, String>(10).unwrap_or_default(),
                updated_at: row.get::<_, String>(11).unwrap_or_default(),
            })
        }).map_err(|e| format!("映射最近浏览行失败: {}", e))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("收集最近浏览失败: {}", e))
    }
}
```

> ⚠️ 注意：`ResourceItem` struct 需要实现正确的 `from_row` 或通过手动字段映射。如果 `ResourceItem` 不匹配表结构，可定义内部 `RecentlyViewedRow` struct 再转换。

### Step 7.2 — recently_viewed command + ResourcePage 记录

`src-tauri/src/commands/recently_viewed.rs`：

```rust
use tauri::State;
use crate::AppState;
use crate::types::ResourceItem;

#[tauri::command]
pub async fn list_recently_viewed(
    state: State<'_, AppState>,
) -> Result<Vec<ResourceItem>, String> {
    state.db.list_recently_viewed(12)
}
```

然后修改 `ResourcePage.tsx`：在成功获取详情后，调用一个新 command 记录浏览。最简单方式：在 `get_resource_detail` command 中自动记录（Rust 端一站式）。修改 `commands/resource.rs`：

```rust
// 在 get_resource_detail 返回前：
state.db.record_recently_viewed(&detail.to_resource_item()).ok();
```

或者在 Rust 端 types 中给 `ResourceDetail` 加 `to_resource_item()` 方法。

### Step 7.3 — category command（分页浏览）

`src-tauri/src/commands/category.rs`：

```rust
use tauri::State;
use crate::AppState;
use crate::types::ResourceItem;

const PAGE_SIZE: u32 = 20;

#[tauri::command]
pub async fn browse_category(
    resource_type: String,
    page: u32,
    state: State<'_, AppState>,
) -> Result<(Vec<ResourceItem>, u32), String> {
    let api_key = {
        let settings = state.settings.lock().unwrap();
        settings.curseforge_api_key.clone()
    };

    let offset = (page - 1) * PAGE_SIZE;

    // 并行调 CF + MR 的搜索（不带 keyword，按 resource_type 筛选 + 热门排序）
    let (cf, mr) = tokio::join!(
        crate::curseforge::fetch_popular(&state.http_client, &api_key, &resource_type, PAGE_SIZE),
        crate::modrinth::fetch_popular(&state.http_client, &resource_type, PAGE_SIZE),
    );

    let cf_results = cf.unwrap_or_default();
    let mr_results = mr.unwrap_or_default();
    let merged = crate::merger::merge_results(&cf_results, &mr_results);

    // 简单分页：从合并结果中切片
    let total = merged.len() as u32;
    let paged: Vec<ResourceItem> = merged
        .into_iter()
        .skip(offset as usize)
        .take(PAGE_SIZE as usize)
        .collect();

    Ok((paged, total))
}
```

> 简化版分页：取 CF+MR 热门合并后在前端切片。真实分页需要各平台 API 支持 offset，本版用客户端分页，总页数上限约 1-2 页即可。

### Step 7.4 — CategoryPage 完整实现

`src/pages/CategoryPage.tsx` — 替换占位：

```tsx
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/tauri';
import type { ResourceItem } from '@/types';
import ResourceCard from '@/components/home/ResourceCard';
import Loading from '@/components/common/Loading';
import Empty from '@/components/common/Empty';

const PAGE_SIZE = 20;

export default function CategoryPage() {
  const { type } = useParams<{ type: string }>();
  const [items, setItems] = useState<ResourceItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [jumpPage, setJumpPage] = useState('');

  useEffect(() => {
    if (!type) return;
    setLoading(true);
    invoke<[ResourceItem[], number]>('browse_category', { resourceType: type, page })
      .then(([data, totalCount]) => {
        setItems(data);
        setTotal(totalCount);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [type, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-mc-text mb-6">
        分类浏览 · {TYPE_LABELS[type || 'mod'] || type}
      </h1>

      {loading ? <Loading /> : items.length === 0 ? <Empty message="该分类暂无内容" /> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
            {items.map(r => <ResourceCard key={`${r.source}-${r.id}`} resource={r} />)}
          </div>

          {/* 分页 */}
          <div className="flex items-center justify-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 rounded-md text-sm bg-mc-card hover:bg-mc-card-hover
                         disabled:opacity-30 transition-colors">
              上一页
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
              .map((p, i, arr) => (
                <span key={p}>
                  {i > 0 && arr[i-1] !== p-1 && <span className="text-mc-muted mx-0.5">...</span>}
                  <button
                    onClick={() => setPage(p)}
                    className={`w-8 h-8 rounded-md text-sm transition-colors
                      ${p === page ? 'bg-mc-green text-white' : 'bg-mc-card hover:bg-mc-card-hover text-mc-text'}`}
                  >{p}</button>
                </span>
              ))}

            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 rounded-md text-sm bg-mc-card hover:bg-mc-card-hover
                         disabled:opacity-30 transition-colors">
              下一页
            </button>

            {/* 跳页 */}
            <form onSubmit={e => { e.preventDefault(); const n = parseInt(jumpPage); if (n >= 1 && n <= totalPages) { setPage(n); setJumpPage(''); } }}
              className="flex items-center gap-1 ml-4">
              <span className="text-xs text-mc-muted">跳至</span>
              <input value={jumpPage} onChange={e => setJumpPage(e.target.value)}
                className="w-10 h-7 rounded text-xs text-center bg-mc-card border border-mc-border text-mc-text"
                placeholder={`${page}`} />
              <span className="text-xs text-mc-muted">/ {totalPages} 页</span>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

const TYPE_LABELS: Record<string, string> = {
  mod: 'Mod',
  modpack: '整合包',
  resourcepack: '资源包',
  shader: '光影',
  world: '世界',
  datapack: '数据包',
};
```

> 如 Navbar 中 `/category/:type` 的链接目前是 `/category/mod`，确保正确触发 CategoryPage。

### Step 7.5 — RecentlyViewed 组件

`src/components/home/RecentlyViewed.tsx` — 从 MC-Mod-Hub 直接复制，仅做适配：

| 原代码 | 改为 |
|--------|------|
| `fetch('/api/recently-viewed')` | `invoke('list_recently_viewed')` |
| `next/link` → `Link` | `react-router-dom` → `Link` |
| `'use client'` | 删除 |

组件结构（从 MC-Mod-Hub 照搬）：
- 水平滚动条或网格显示最近 12 个浏览过的资源
- 每个显示缩略图 + 名称
- 点击跳转到资源详情页
- 空状态：不显示板块

如果 MC-Mod-Hub 不可访问，按以下结构：

```tsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/tauri';
import type { ResourceItem } from '@/types';

export default function RecentlyViewed() {
  const [items, setItems] = useState<ResourceItem[]>([]);

  useEffect(() => {
    invoke<ResourceItem[]>('list_recently_viewed')
      .then(setItems)
      .catch(() => {});
  }, []);

  if (items.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-mc-text mb-3">最近浏览</h2>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
        {items.map(r => (
          <Link
            key={`${r.source}-${r.id}`}
            to={`/resource/${r.source}/${r.id}`}
            className="flex-shrink-0 w-32 p-2 rounded-mc bg-mc-card hover:bg-mc-card-hover
                       transition-all duration-200 hover:-translate-y-1 text-center"
          >
            <img src={r.iconUrl || '/placeholder.svg'} alt={r.name}
              className="w-12 h-12 mx-auto rounded-lg mb-1 object-cover" />
            <p className="text-xs text-mc-text truncate">{r.name}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
```

### Step 7.6 — HomePage 集成 RecentlyViewed + UpdateAlerts

`src/pages/HomePage.tsx` — 在 HotSection 下方加入 RecentlyViewed + UpdateAlerts：

```tsx
// 在 HotSection 下方（默认热门模式时）：
{results === null && !searching && !error && (
  <>
    <UpdateAlerts />
    <RecentlyViewed />
  </>
)}
```

### Step 7.7 — UpdateAlerts 组件 + UpdatesPage

**UpdateAlerts 组件**（`src/components/home/UpdateAlerts.tsx`）— 从 MC-Mod-Hub 直接复制：

这是一个小的提醒条组件。如果有关注的资源有新版本，在首页 HotSection 上方显示一条提醒：「N 个资源有更新 → 查看」。

本步可用简化实现：无后端检查时显示占位（始终为空），留到未来版本实现真正的版本对比。

```tsx
// 最简占位版（后续可扩展为真实的版本检查）
export default function UpdateAlerts() {
  return null; // 无后端检查时隐藏
}
```

如果 MC-Mod-Hub 有完整的检查逻辑，直接复制改造。

**UpdatesPage**（`src/pages/UpdatesPage.tsx`）— 替换占位：

```tsx
import Empty from '@/components/common/Empty';

export default function UpdatesPage() {
  // 更新提醒列表 — 本步用最简版
  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-mc-text mb-6">更新提醒</h1>
      <Empty message="暂无更新提醒" icon="🎉" />
    </div>
  );
}
```

> 更新提醒的完整实现需要：遍历收藏夹中所有资源 → 逐个查 CF/MR API 检测最新文件版本 → 对比本地记录的版本。工作量大且消耗 API 配额。本步只搭骨架页面，具体检查逻辑留给用户后续按需扩展。

### Step 7.8 — 注册新 command

`commands/mod.rs` — 追加：
```rust
pub mod category;
pub mod recently_viewed;
// pub mod updates;  // 如需
```

`lib.rs` — invoke_handler 追加：
```rust
commands::category::browse_category,
commands::recently_viewed::list_recently_viewed,
```

### Step 7.9 — 验证步骤

```bash
cargo check
npx tsc --noEmit
npm run tauri dev
```

**验证清单**：
- [ ] 导航到 `/category/mod` → 看到 Mod 分类的分页列表
- [ ] 点击页码按钮 / 跳页 → 列表更新
- [ ] 点击资源卡片 → 进入详情页 → 返回首页 → 最近浏览出现该资源
- [ ] 最近浏览板块水平滚动，点击跳回详情页
- [ ] 导航到 `/updates` → 显示更新提醒占位页
- [ ] 首页在热门下方有「最近浏览」板块（如有浏览记录）
- [ ] 所有已有功能不受影响（搜索/热门/收藏夹/下载）

---

## 约束条件

- ❌ **不要**做真实的版本对比更新检查（费 API 配额，留给后续扩展）
- ❌ **不要**改动已有的收藏夹/下载逻辑
- ❌ **不要**做设置页实现——Step 8 做
- ✅ 分类浏览分页用客户端分页（合并 CF+MR 后切片）即可
- ✅ 最近浏览最多 50 条，首页展示 12 条
- ✅ `UpdateAlerts` 组件可用最简占位（返回 null）

---

## 完成后

完成后告诉我：
1. `cargo check` 是否通过
2. 分类浏览分页是否正常（页码/跳页）
3. 最近浏览是否记录并在首页展示
4. 更新提醒占位页是否显示
5. 实际执行中做了什么与计划不同的改动

---

## 应急方案说明

> 如需插入新功能：先读 `migration-plan.md` §12。B/C/D 级功能从 Step 2 后即可安全插入。

**本对话只做 Step 7 的分类浏览 + 最近浏览 + 更新提醒骨架，不做设置页和打包。**
