# 开发执行 Prompt — MC Mod Hub 轻量化版 Step 2

> 具体产品需求请参考 `D:\vibe coding\projects\MC-Mod-Hub\requirements.md`，技术方案参考本目录 `technical-design.md`，迁移方案参考本目录 `migration-plan.md`，开发规则参考本目录 `AGENTS.md`。

---

## 项目背景

MC Mod Hub 轻量化版，基于 Tauri + Vite + React SPA。Step 1 已完成：项目骨架 + 搜索链路可跑（`cargo tauri dev` 启动 → 输入关键词 → Rust 调 CurseForge/Modrinth → 前端渲染卡片）。

## 当前状态（Step 1 完成后）

```
mc-mod-hub-light/
├── package.json / vite.config.ts / tsconfig.json / tailwind.config.ts / postcss.config.js
├── index.html / .gitignore
├── src/
│   ├── main.tsx              — React 入口（BrowserRouter）
│   ├── App.tsx               — 路由（仅 "/" → HomePage）+ ToastProvider
│   ├── globals.css           — 暗色主题（MC-Mod-Hub 照搬）
│   ├── vite-env.d.ts
│   ├── types/index.ts        — 前端类型（MC-Mod-Hub 照搬）
│   ├── lib/
│   │   ├── format.ts         — 格式化工具（照搬）
│   │   └── tauri.ts          — invoke 封装
│   ├── components/
│   │   ├── common/
│   │   │   ├── Loading.tsx   — 加载状态
│   │   │   ├── Toast.tsx     — 消息提示
│   │   │   └── ToastProvider.tsx
│   │   └── home/
│   │       ├── SearchBar.tsx — 搜索栏
│   │       └── ResourceCard.tsx — 资源卡片（react-router-dom Link 已适配）
│   └── pages/
│       └── HomePage.tsx      — 首页（仅搜索功能）
└── src-tauri/
    ├── Cargo.toml            — tauri + reqwest + serde + tokio
    ├── tauri.conf.json       — 窗口 1280×800，CSP 允许外部图片
    ├── build.rs
    └── src/
        ├── main.rs           — Tauri 入口（AppState: http_client + settings）
        ├── lib.rs            — 模块声明
        ├── types.rs          — Rust 数据结构（ResourceItem 等）
        ├── curseforge.rs     — CurseForge API（search_mods）
        ├── modrinth.rs       — Modrinth API（search_projects）
        ├── merger.rs         — 合并去重
        └── commands/
            ├── mod.rs
            └── search.rs     — search command ✅
```

**⚠️ 当前缺失**：数据库层（SQLite）、Navbar 导航、所有页面（除首页外）只有路由占位。

---

## 第二步目标

**建立数据库层 + 导航框架，让整个应用骨架可浏览。**

具体产出：
1. 数据库层：`db.rs`（rusqlite bundled feature），包含 3 张表的建表 + 基础 CRUD
2. 更新 AppState：加入 `rusqlite::Connection`（Mutex 包裹）
3. Navbar 组件：从 MC-Mod-Hub 复制，适配 react-router-dom
4. Empty 组件：从 MC-Mod-Hub 复制
5. 7 个占位页：每个页面显示标题，路由全部连通
6. 首页加入 Navbar（搜索功能保持不变）
7. `cargo check` 通过 + Tauri 窗口可启动、可导航

> ⚠️ **第二步只做骨架**。不做收藏夹逻辑、不做资源详情、不做下载。页面只显示标题 + 最简占位内容。

---

## 需要创建/修改的文件

### 新建文件

```
src-tauri/src/db.rs                      — SQLite 数据库封装
src/components/layout/Navbar.tsx          — 导航栏（从 MC-Mod-Hub 复制，适配）
src/components/common/Empty.tsx           — 空状态组件（从 MC-Mod-Hub 复制）
src/pages/ResourcePage.tsx                — 资源详情页（占位）
src/pages/CategoryPage.tsx                — 分类浏览页（占位）
src/pages/CollectionsPage.tsx             — 收藏夹列表页（占位）
src/pages/CollectionDetailPage.tsx        — 收藏夹详情页（占位）
src/pages/UpdatesPage.tsx                 — 更新提醒页（占位）
src/pages/SettingsPage.tsx                — 设置页（占位）
```

### 修改文件

```
src-tauri/Cargo.toml                      — 加 rusqlite 依赖（bundled feature）
src-tauri/src/main.rs                     — AppState 加 db 字段 + 注册 init_db command
src-tauri/src/lib.rs                      — 加 mod db
src/App.tsx                              — 加 Navbar + 全部 8 条路由
```

---

## 开发步骤

### Step 2.1 — 数据库层：db.rs

`src-tauri/src/db.rs` — 照搬 MC-Mod-Hub `src/lib/db.ts` 的**表结构**，用 rusqlite 实现：

```rust
use rusqlite::{Connection, Result as SqliteResult};
use std::path::PathBuf;
use std::sync::Mutex;

/// 获取数据库文件路径
/// 开发环境: data/app.db（相对于项目根目录）
/// 生产环境: Tauri app_data_dir()/data/app.db
pub fn get_db_path(app_handle: &tauri::AppHandle) -> PathBuf {
    // 优先使用 app_data_dir，fallback 到开发环境相对路径
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
}
```

**关键规则**：
- 表结构**一字不改**照搬 MC-Mod-Hub 的 `initTables()` SQL
- `collection_items` 的字段必须包含 `resource_type` / `categories` / `game_versions`（JSON 字符串存储）
- `recently_viewed` 使用 `INTEGER PRIMARY KEY AUTOINCREMENT`
- 数据库文件路径：`data/app.db`（需确保 `data/` 目录存在）

### Step 2.2 — 更新 Cargo.toml

在现有依赖基础上，加 rusqlite：

```toml
[dependencies]
rusqlite = { version = "0.31", features = ["bundled"] }
```

`bundled` feature 会在编译时自动编译 SQLite，无需系统安装。

### Step 2.3 — 更新 AppState + main.rs

```rust
// src-tauri/src/main.rs — 更新后的结构

mod commands;
mod curseforge;
mod modrinth;
mod merger;
mod types;
mod db;  // ← 新增

use std::sync::Mutex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Settings {
    #[serde(default)]
    pub curseforge_api_key: String,
    #[serde(default)]
    pub default_download_dir: String,
    #[serde(default = "default_true")]
    pub check_updates_on_startup: bool,
}

fn default_true() -> bool { true }

pub struct AppState {
    pub http_client: reqwest::Client,
    pub settings: Mutex<Settings>,
    pub db: db::Database,  // ← 新增
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let db_path = db::get_db_path(&app.handle());
            let database = db::Database::new(&db_path)
                .expect("初始化数据库失败");

            let app_state = AppState {
                http_client: reqwest::Client::new(),
                settings: Mutex::new(Settings::default()),
                db: database,
            };

            app.manage(app_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::search::search,
        ])
        .run(tauri::generate_context!())
        .expect("启动 Tauri 失败");
}
```

**注意**：AppState 初始化从 `main()` 函数体移到 `.setup()` 闭包内，以便获取 `app.handle()` 用于 `app_data_dir()`。

### Step 2.4 — lib.rs 更新

```rust
// src-tauri/src/lib.rs
pub mod commands;
pub mod curseforge;
pub mod modrinth;
pub mod merger;
pub mod types;
pub mod db;  // ← 新增
```

### Step 2.5 — Navbar 组件

`src/components/layout/Navbar.tsx` — 从 MC-Mod-Hub 对应的 `src/components/layout/Navbar.tsx` **直接复制**，做以下适配：

| 原代码 | 改为 |
|--------|------|
| `import Link from 'next/link'` | `import { Link, useLocation } from 'react-router-dom'` |
| `usePathname()` | `useLocation().pathname` |
| `className={pathname === '/' ? 'active' : ''}` | `className={location.pathname === '/' ? 'active' : ''}` |

Navbar 结构（从 MC-Mod-Hub 照搬，包含以下链接）：
- 首页 `/`
- 分类 `/category/mod`（或 MC-Mod-Hub 已有的路径）
- 收藏夹 `/collections`
- 更新提醒 `/updates`
- 设置 `/settings`

**如果 MC-Mod-Hub 的 Navbar 文件无法读取**（源目录不可访问），则按以下结构手写：

```tsx
import { Link, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
  { path: '/', label: '首页' },
  { path: '/category/mod', label: '分类' },
  { path: '/collections', label: '收藏夹' },
  { path: '/updates', label: '更新提醒' },
  { path: '/settings', label: '设置' },
];

export default function Navbar() {
  const location = useLocation();

  return (
    <nav className="sticky top-0 z-50 bg-mc-bg/95 backdrop-blur border-b border-mc-border">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center gap-1">
        <Link to="/" className="text-mc-green font-bold text-lg mr-4 tracking-wide
          hover:text-mc-green-light transition-colors duration-200">
          MC Mod Hub
        </Link>
        <div className="flex items-center gap-0.5 ml-2">
          {NAV_ITEMS.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`px-3 py-1.5 rounded-md text-sm transition-all duration-200
                ${location.pathname === item.path
                  ? 'bg-mc-green/15 text-mc-green-light'
                  : 'text-mc-muted hover:text-mc-text hover:bg-mc-card'
                }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
```

颜色 class 沿用已有的 Tailwind 配置（`mc-bg` / `mc-text` / `mc-green` / `mc-muted` / `mc-card` / `mc-border` 等）。

### Step 2.6 — Empty 组件

`src/components/common/Empty.tsx` — 从 MC-Mod-Hub **直接复制**（纯 UI 组件，无需适配）。

如果无法读取源文件，按以下最简版：

```tsx
interface EmptyProps {
  message?: string;
  icon?: string;
}

export default function Empty({ message = '暂无数据', icon = '📭' }: EmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-mc-muted">
      <span className="text-4xl mb-3">{icon}</span>
      <p className="text-sm">{message}</p>
    </div>
  );
}
```

### Step 2.7 — 7 个占位页

每个页面**只做标题 + 最简占位内容**。业务逻辑留到后续 Step。

#### `src/pages/ResourcePage.tsx`
```tsx
import { useParams } from 'react-router-dom';

export default function ResourcePage() {
  const { source, id } = useParams();
  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-mc-text mb-4">资源详情</h1>
      <p className="text-mc-muted">source: {source}, id: {id}</p>
    </div>
  );
}
```

#### `src/pages/CategoryPage.tsx`
```tsx
import { useParams } from 'react-router-dom';

export default function CategoryPage() {
  const { type } = useParams();
  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-mc-text mb-4">分类浏览</h1>
      <p className="text-mc-muted">类型: {type}</p>
    </div>
  );
}
```

#### `src/pages/CollectionsPage.tsx`
```tsx
export default function CollectionsPage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-mc-text mb-4">收藏夹</h1>
      <p className="text-mc-muted">收藏夹列表（Step 6 实现）</p>
    </div>
  );
}
```

#### `src/pages/CollectionDetailPage.tsx`
```tsx
import { useParams } from 'react-router-dom';

export default function CollectionDetailPage() {
  const { id } = useParams();
  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-mc-text mb-4">收藏夹详情</h1>
      <p className="text-mc-muted">收藏夹 ID: {id}（Step 7 实现）</p>
    </div>
  );
}
```

#### `src/pages/UpdatesPage.tsx`
```tsx
export default function UpdatesPage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-mc-text mb-4">更新提醒</h1>
      <p className="text-mc-muted">更新提醒列表（Step 8 实现）</p>
    </div>
  );
}
```

#### `src/pages/SettingsPage.tsx`
```tsx
export default function SettingsPage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-mc-text mb-4">设置</h1>
      <p className="text-mc-muted">设置页（Step 9 实现）</p>
    </div>
  );
}
```

> Step 1 已有的 `HomePage` **不需要改动**，但下面 Step 2.8 会在 App.tsx 中包裹 Navbar。

### Step 2.8 — 更新 App.tsx（加 Navbar + 全部路由）

```tsx
import { Routes, Route } from 'react-router-dom';
import { ToastProvider } from '@/components/common/ToastProvider';
import Navbar from '@/components/layout/Navbar';
import HomePage from '@/pages/HomePage';
import ResourcePage from '@/pages/ResourcePage';
import CategoryPage from '@/pages/CategoryPage';
import CollectionsPage from '@/pages/CollectionsPage';
import CollectionDetailPage from '@/pages/CollectionDetailPage';
import UpdatesPage from '@/pages/UpdatesPage';
import SettingsPage from '@/pages/SettingsPage';

export default function App() {
  return (
    <ToastProvider>
      <div className="min-h-screen bg-mc-bg text-mc-text">
        <Navbar />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/resource/:source/:id" element={<ResourcePage />} />
          <Route path="/category/:type" element={<CategoryPage />} />
          <Route path="/collections" element={<CollectionsPage />} />
          <Route path="/collections/:id" element={<CollectionDetailPage />} />
          <Route path="/updates" element={<UpdatesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </div>
    </ToastProvider>
  );
}
```

### Step 2.9 — 验证步骤

```bash
# 1. Rust 编译检查（验证 db.rs + AppState 改动）
cd src-tauri
cargo check
# 预期：Compiling rusqlite → Finished，无错误

# 2. 前端编译检查
npm run dev
# 预期：Vite 启动成功，无 TS 编译错误

# 3. Tauri 完整启动
npm run tauri dev
# 预期：窗口出现，Navbar 可见，点击各链接跳转到对应占位页
#       搜索功能仍可用，data/app.db 文件已生成

# 4. 验证数据库
# 关闭应用，检查 data/app.db 文件存在
# 可用 SQLite 工具查看 3 张表已创建
```

---

## 约束条件

- ❌ **不要**在 `db.rs` 中添加 MC-Mod-Hub 没有的表或字段——3 张表原样迁移
- ❌ **不要**在占位页写业务逻辑——只显示标题和占位文字
- ❌ **不要**改动 Step 1 已有的组件（SearchBar / ResourceCard / Loading / Toast / ToastProvider）
- ❌ **不要**改 HomePage 的业务逻辑（搜索功能保持可用）
- ✅ Navbar 必须使用 react-router-dom 的 `Link` + `useLocation`
- ✅ 数据库使用 `rusqlite` bundled feature——**不引入** `tauri-plugin-sql`
- ✅ CSP 配置保持不变（已在 Step 1 的 tauri.conf.json 中设置好）

---

## 完成后

完成后告诉我：
1. `cargo check` 是否通过
2. `npm run tauri dev` 能否启动、Navbar 是否可见、点击各链接是否跳转到正确占位页
3. `data/app.db` 是否生成（关闭应用后检查）
4. 搜索功能是否仍然可用（不受本步改动影响）
5. 实际执行中做了什么与计划不同的改动

---

## 应急方案说明

> 如果在开发过程中需要插入新功能，请先阅读 `migration-plan.md` 第 12 节的完整应急方案，然后在我为你生成的新对话中写明：
> - 当前进度（Step 2 是否已完成）
> - 新功能类型（A/B/C/D/E 级）
> - 需要改的挂接点
> - 受影响需同步更新的文档

**本对话只做 Step 2 的数据库 + 导航框架，不做任何其他功能。**
