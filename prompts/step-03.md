# 开发执行 Prompt — MC Mod Hub 轻量化版 Step 3

> 具体产品需求请参考 `D:\vibe coding\projects\MC-Mod-Hub\requirements.md`，技术方案参考本目录 `technical-design.md`，迁移方案参考本目录 `migration-plan.md`，开发规则参考本目录 `AGENTS.md`。

---

## 项目背景

MC Mod Hub 轻量化版，基于 Tauri + Vite + React SPA。

- Step 1：项目骨架 + 搜索链路（SearchBar / ResourceCard / search command）
- Step 2：数据库层（SQLite 3 张表）+ Navbar + Empty + 7 个占位页 + 8 条路由
- **当前**：首页只做了搜索，缺少热门板块和右键菜单

## 第三步目标

**完成首页全部功能 — 热门三板块 + 右键菜单 + 搜索/热门切换，MVP 可完整演示。**

具体产出：
1. Rust 端：`popular` command（调 CurseForge + Modrinth 热门内容 → 合并去重）
2. 前端：`HotSection` 组件（Mod / Modpack / Resource Packs 三板块，每板块前 6 张缩略卡）
3. 前端：`ContextMenu` 组件（Portal 右键菜单，在 ResourceCard 上右键弹出）
4. 首页完整布局：默认显示热门板块 → 搜索时切换为搜索结果

> Step 3 完成后，首页就是完整的样子：打开看到三板块热门缩略卡 + 搜索栏 → 输入关键词搜出结果。这是 **MVP 的"脸面"**。

---

## 需要创建/修改的文件

### 新建文件

```
src-tauri/src/commands/popular.rs       — popular command（CF+MR 热门 → 合并）
src/components/home/HotSection.tsx       — 热门三板块（从 MC-Mod-Hub 复制，适配）
src/components/home/ContextMenu.tsx      — 右键菜单（从 MC-Mod-Hub 复制，createPortal）
```

### 修改文件

```
src-tauri/src/curseforge.rs             — 加 fetch_popular / fetch_popular_list 函数
src-tauri/src/modrinth.rs               — 加 fetch_popular / fetch_popular_list 函数
src-tauri/src/commands/mod.rs           — 加 pub mod popular
src-tauri/src/lib.rs                    — 加 commands/popular 注册
src/pages/HomePage.tsx                  — 加热门板块 + 搜索/热门切换逻辑
src/components/home/ResourceCard.tsx    — 加 ContextMenu 集成
```

---

## 开发步骤

### Step 3.1 — Rust 端：CurseForge 热门 API

`src-tauri/src/curseforge.rs` — 在现有 `search_mods` 函数基础上，新增热门内容获取：

```rust
/// CurseForge 热门内容
/// resource_type: "mod" | "modpack" | "resourcepack" | "shader" 等
/// 对应 MC-Mod-Hub src/lib/curseforge.ts 的 fetchPopular / fetchPopularList
pub async fn fetch_popular(
    client: &Client,
    api_key: &str,
    resource_type: &str,
    limit: u32,
) -> Result<Vec<ResourceItem>, String> {
    // 将 resource_type 映射为 CurseForge classId / categoryId
    // mod=6, modpack=4471, resourcepack=12, shader=...
    // 调 GET /v1/mods/search?gameId=432&classId=xxx&sortBy=1&sortOrder=desc&pageSize=limit
    todo!("实现 fetch_popular")
}

/// 批量获取多个类型的 popular，一次调用返回三个 Vec
pub async fn fetch_popular_list(
    client: &Client,
    api_key: &str,
    types: &[&str],
    limit: u32,
) -> Result<Vec<(String, Vec<ResourceItem>)>, String> {
    // 对每个 type 调 fetch_popular，收集结果
    todo!("实现 fetch_popular_list")
}
```

**关键照搬规则**：
- 打开 MC-Mod-Hub `src/lib/curseforge.ts` 的 `fetchPopular()` 和 `fetchPopularList()` 函数
- 将其 JS 逻辑逐行翻译为 Rust
- URL 参数、header、响应 JSON 结构不变
- 已有的 `ResourceItem` + `CfMod` / `CfSearchResponse` 等内部 struct 可复用

如果 MC-Mod-Hub 不可访问，参考以下 CurseForge API 映射：

| resource_type | CurseForge classId |
|--------------|-------------------|
| mod | 6 |
| modpack | 4471 |
| resourcepack | 12 |
| shader | 6552 |
| world | 17 |
| datapack | 4546 |

热门排序参数：`sortBy=1`（Popularity）、`sortOrder=desc`。

### Step 3.2 — Rust 端：Modrinth 热门 API

`src-tauri/src/modrinth.rs` — 在现有 `search_projects` 基础上，新增热门内容获取：

```rust
/// Modrinth 热门内容
/// 对应 MC-Mod-Hub src/lib/modrinth.ts 的 fetchPopular / fetchPopularList
pub async fn fetch_popular(
    client: &Client,
    resource_type: &str,
    limit: u32,
) -> Result<Vec<ResourceItem>, String> {
    // GET /v2/search?limit=limit&facets=[["project_type:mod"]]&index=relevance
    // Modrinth project_type 映射: mod, modpack, resourcepack, shader
    todo!("实现 fetch_popular")
}

pub async fn fetch_popular_list(
    client: &Client,
    types: &[&str],
    limit: u32,
) -> Result<Vec<(String, Vec<ResourceItem>)>, String> {
    todo!("实现 fetch_popular_list")
}
```

**关键照搬规则**：
- Modrinth 无需 API Key
- 使用 facets 参数筛选 project_type：`[["project_type:mod"]]`
- `index=relevance`（按热门度排序）
- 照搬 MC-Mod-Hub `src/lib/modrinth.ts` 的 `fetchPopular()` 和 `fetchPopularList()` 逻辑

### Step 3.3 — Rust 端：popular command

`src-tauri/src/commands/popular.rs`：

```rust
use tauri::State;
use crate::AppState;
use crate::types::ResourceItem;

#[tauri::command]
pub async fn popular(
    state: State<'_, AppState>,
) -> Result<Vec<(String, Vec<ResourceItem>)>, String> {
    let api_key = {
        let settings = state.settings.lock().unwrap();
        settings.curseforge_api_key.clone()
    };

    let types = vec!["mod", "modpack", "resourcepack"];

    let (cf_result, mr_result) = tokio::join!(
        crate::curseforge::fetch_popular_list(&state.http_client, &api_key, &types, 6),
        crate::modrinth::fetch_popular_list(&state.http_client, &types, 6),
    );

    let cf_list = cf_result.unwrap_or_default();
    let mr_list = mr_result.unwrap_or_default();

    // 对每个 type 合并 CF + MR 结果
    let merged: Vec<(String, Vec<ResourceItem>)> = types
        .iter()
        .map(|t| {
            let cf_items = cf_list.iter()
                .find(|(tp, _)| tp == t)
                .map(|(_, items)| items.clone())
                .unwrap_or_default();
            let mr_items = mr_list.iter()
                .find(|(tp, _)| tp == t)
                .map(|(_, items)| items.clone())
                .unwrap_or_default();
            let merged_items = crate::merger::merge_results(&cf_items, &mr_items);
            (t.to_string(), merged_items)
        })
        .collect();

    Ok(merged)
}
```

### Step 3.4 — 注册 popular command

`src-tauri/src/commands/mod.rs` 已有 `pub mod search;`，追加一行：

```rust
pub mod popular;
```

`src-tauri/src/lib.rs` — 找到 `invoke_handler` 注册处，在 `commands::search::search` 后追加：

```rust
.invoke_handler(tauri::generate_handler![
    commands::search::search,
    commands::popular::popular,  // ← 新增
])
```

### Step 3.5 — HotSection 组件

`src/components/home/HotSection.tsx` — 从 MC-Mod-Hub `src/components/home/HotSection.tsx` **直接复制**，仅做以下适配：

| 原代码 | 改为 |
|--------|------|
| `fetch('/api/popular')` | `invoke('popular')` 或 `tauriInvoke('popular')` |
| `next/link` → `Link` | `react-router-dom` → `Link` |
| `'use client'` | **删除** |

组件核心结构（从 MC-Mod-Hub 照搬）：
- 三个 Tab 按钮：Mod / Modpack / 资源包
- 选中 Tab 下显示 6 张缩略资源卡片（复用 `ResourceCard`）
- Tab 切换时如果已有该类型数据则缓存不重复请求

如果 MC-Mod-Hub 不可访问，按以下结构手写：

```tsx
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import type { ResourceItem } from '@/types';
import ResourceCard from './ResourceCard';
import Loading from '@/components/common/Loading';
import Empty from '@/components/common/Empty';

const TABS = [
  { key: 'mod', label: 'Mod' },
  { key: 'modpack', label: '整合包' },
  { key: 'resourcepack', label: '资源包' },
] as const;

export default function HotSection() {
  const [activeTab, setActiveTab] = useState<string>('mod');
  const [data, setData] = useState<Record<string, ResourceItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await invoke<[string, ResourceItem[]][]>('popular');
        const map: Record<string, ResourceItem[]> = {};
        for (const [key, items] of result) {
          map[key] = items;
        }
        setData(map);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const currentItems = data[activeTab] || [];

  return (
    <section className="mt-6">
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-4 border-b border-mc-border">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-all duration-200 border-b-2 -mb-px
              ${activeTab === tab.key
                ? 'border-mc-green text-mc-green-light'
                : 'border-transparent text-mc-muted hover:text-mc-text'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <Loading />
      ) : error ? (
        <div className="text-center py-8 text-red-400 text-sm">{error}</div>
      ) : currentItems.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {currentItems.map(r => (
            <ResourceCard key={`${r.source}-${r.id}`} resource={r} compact />
          ))}
        </div>
      ) : (
        <Empty message="暂无热门内容" />
      )}
    </section>
  );
}
```

> **compact 属性**（可选）：如果 MC-Mod-Hub 的 HotSection 使用了缩略版 ResourceCard，在 ResourceCard 中加 `compact?: boolean` prop，compact 模式下隐藏 summary、用更小的图标。

### Step 3.6 — ContextMenu 组件

`src/components/home/ContextMenu.tsx` — 从 MC-Mod-Hub `src/components/home/ContextMenu.tsx` **直接复制**。使用 `createPortal` 渲染到 `document.body`。

适配点：
- 无需路由适配（纯 UI + Portal）
- 无需数据获取适配（菜单项由父组件传入）
- 删除 `'use client'`

核心结构（从 MC-Mod-Hub 照搬）：
```tsx
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ContextMenuItem {
  label: string;
  icon?: string;
  onClick: () => void;
  danger?: boolean;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
}

export default function ContextMenu({ items, position, onClose }: ContextMenuProps) {
  // createPortal → <div className="fixed z-[100]" style={{ left: x, top: y }}>
  // 点击外部关闭（useEffect + mousedown listener）
  // 每个 item: <button onClick={item.onClick}>
  // ...
}
```

如果 MC-Mod-Hub 不可访问，按上述结构手写。关键点：
- Portal 到 body，z-index 足够高（z-[100] 或以上）
- 位置用 `position: fixed` + `left` / `top`
- 边界检测（菜单不能超出视口）
- 点击菜单外部自动关闭

### Step 3.7 — ResourceCard 接入 ContextMenu

`src/components/home/ResourceCard.tsx` — 在现有卡片上添加右键菜单支持：

```tsx
// 1. import ContextMenu, { ContextMenuItem } from './ContextMenu';
// 2. 加一个 onContextMenu 处理
// 3. state: contextMenu 位置/显示

// 示例改动：
const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

const handleContextMenu = (e: React.MouseEvent) => {
  e.preventDefault();
  setContextMenu({ x: e.clientX, y: e.clientY });
};

const menuItems: ContextMenuItem[] = [
  {
    label: '查看详情',
    icon: '📋',
    onClick: () => { /* navigate to /resource/:source/:id */ },
  },
  {
    label: '添加到收藏夹',
    icon: '📁',
    onClick: () => { /* TODO: Step 6 实现 */ },
  },
];

// 在卡片最外层 div 上：
<div onContextMenu={handleContextMenu} className="...">
  {/* 原有卡片内容 */}
  {contextMenu && (
    <ContextMenu
      items={menuItems}
      position={contextMenu}
      onClose={() => setContextMenu(null)}
    />
  )}
</div>
```

> "添加到收藏夹" 的 onClick 留空或显示 Toast "收藏夹功能即将上线" —— Step 6 再补。

### Step 3.8 — 首页完整布局

`src/pages/HomePage.tsx` — 改造为搜索/热门双状态：

```tsx
import { useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import type { ResourceItem } from '@/types';
import SearchBar from '@/components/home/SearchBar';
import ResourceCard from '@/components/home/ResourceCard';
import HotSection from '@/components/home/HotSection';
import Loading from '@/components/common/Loading';

export default function HomePage() {
  const [results, setResults] = useState<ResourceItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (query: string) => {
    setSearching(true);
    setError(null);
    try {
      const data = await invoke<ResourceItem[]>('search', { query });
      setResults(data);
    } catch (err) {
      setError(String(err));
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  // 清除搜索，回到热门视图
  const handleClear = () => {
    setResults(null);
    setError(null);
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* 搜索栏 — 始终显示 */}
      <div className="mb-6 pt-2">
        <SearchBar onSearch={handleSearch} onClear={handleClear} />
      </div>

      {/* 搜索结果模式 */}
      {results !== null || searching || error ? (
        <>
          {searching ? (
            <Loading />
          ) : error ? (
            <div className="text-center py-16 text-red-400 text-sm">{error}</div>
          ) : results && results.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {results.map((r) => (
                <ResourceCard key={`${r.source}-${r.id}`} resource={r} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 text-mc-muted text-sm">
              未找到相关资源，试试其他关键词
            </div>
          )}
        </>
      ) : (
        /* 默认热门模式 */
        <HotSection />
      )}
    </div>
  );
}
```

> 如果 SearchBar 不支持 `onClear`，可以加一个 prop（或通过 `onSearch('')` 清除）。确保搜索栏的 X 按钮或清空操作能回到热门视图。

### Step 3.9 — 验证步骤

```bash
# 1. Rust 编译检查
cd src-tauri
cargo check
# 预期：popular command + fetch_popular 编译通过，无错误

# 2. 前端 TypeScript 检查
npx tsc --noEmit
# 预期：无 TS 错误

# 3. Tauri 启动验证
npm run tauri dev
```

**验证清单**：
- [ ] 窗口打开，首页默认显示热门三板块（Mod / 整合包 / 资源包）
- [ ] 三个 Tab 可切换，每个 Tab 展示 6 张资源卡片
- [ ] 搜索栏可用：输入关键词 → 显示搜索结果
- [ ] 清除搜索 → 回到热门视图
- [ ] 在资源卡片上右键 → 弹出 ContextMenu（查看详情 + 添加到收藏夹）
- [ ] 点击"查看详情" → 跳转到资源详情占位页（`/resource/:source/:id`）
- [ ] Navbar 仍然可用，点击各链接跳转正确

---

## 约束条件

- ❌ **不要**改动已有的 `search` command 或搜索链路
- ❌ **不要**改动 Step 2 的数据库层（db.rs）
- ❌ **不要**实现收藏夹功能——ContextMenu 中的「添加到收藏夹」只放占位 Toast
- ❌ **不要**做资源详情页的实现——ResourcePage 保持占位状态
- ❌ **不要**引入新的 npm 或 Cargo 依赖
- ✅ HotSection 的 Tab 标签和名称 **照搬** MC-Mod-Hub
- ✅ ContextMenu 使用 `createPortal` 到 body（与 MC-Mod-Hub 一致）
- ✅ 所有数据获取通过 `invoke()` 走 Rust 端，不做前端 fetch

---

## MC-Mod-Hub 源码参考路径

如果 MC-Mod-Hub 源目录可访问，优先直接复制以下文件：

| 目标文件 | 来源 |
|---------|------|
| `src/components/home/HotSection.tsx` | MC-Mod-Hub `src/components/home/HotSection.tsx` |
| `src/components/home/ContextMenu.tsx` | MC-Mod-Hub `src/components/home/ContextMenu.tsx` |
| `src-tauri/src/curseforge.rs` 新函数 | MC-Mod-Hub `src/lib/curseforge.ts` → `fetchPopular` / `fetchPopularList` |
| `src-tauri/src/modrinth.rs` 新函数 | MC-Mod-Hub `src/lib/modrinth.ts` → `fetchPopular` / `fetchPopularList` |

---

## 完成后

完成后告诉我：
1. `cargo check` 是否通过
2. 首页 HotSection 三个 Tab 是否正常显示数据
3. 右键菜单是否弹出、点击"查看详情"是否跳转
4. 搜索功能是否仍可用、清除搜索是否回到热门视图
5. 实际执行中做了什么与计划不同的改动

---

## 应急方案说明

> 如果在开发过程中需要插入新功能，请先阅读 `migration-plan.md` 第 12 节的完整应急方案。
> - B/C/D 级功能（需 Rust 端支持的读/写/新 API）从 Step 2 后即可安全插入
> - 新功能只追加新文件 + 在注册文件（mod.rs / lib.rs / App.tsx）末尾加行

**本对话只做 Step 3 的首页热门 + 右键菜单，不做任何其他功能。**
