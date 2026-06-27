# 技术方案文档 — MC Mod Hub 轻量化版（Tauri + React SPA）

> 从 MC Mod Hub（Electron + Next.js 14）迁移为 Tauri + Vite + React SPA，所有功能对等照搬

---

## 1. 推荐技术栈

| 层级 | 技术 | 版本 | 为什么这么选 |
|------|------|------|-------------|
| 桌面框架 | **Tauri** | 2.x | 系统 WebView2，启动<2s，内存<80MB，打包<15MB |
| 前端构建 | **Vite** | 5.x | 毫秒级 HMR，零配置 React/TypeScript |
| 前端框架 | **React** | 18.x | SPA 纯客户端渲染，砍掉 Next.js SSR 负担 |
| 路由 | **react-router-dom** | v6 | 声明式路由，模仿 Next.js App Router 结构 |
| 语言(前端) | **TypeScript** | strict | 类型安全，直接从 MC-Mod-Hub 复制 types |
| 语言(后端) | **Rust** | 2021 edition | Tauri 原生语言，高性能 HTTP 客户端 + SQLite |
| 样式 | **Tailwind CSS** | 3.x | 照搬 MC-Mod-Hub 的 tailwind.config.ts 色板 |
| 数据库 | **SQLite (rusqlite)** | 0.31 | Tauri Rust 端原生 SQLite，替代 sql.js WASM |
| HTTP 客户端 | **reqwest** | 0.11 | Rust 端异步 HTTP，调 CurseForge/Modrinth API |
| ZIP 打包 | **zip crate** | 0.6 | Rust 端高性能 zip 打包 |
| 序列化 | **serde + serde_json** | 1.x | Rust struct ↔ JSON，与前端类型对等 |
| 打包工具 | **Tauri bundler** | 内置 | 输出 .msi/.exe，<15MB |
| CI/CD | **GitHub Actions** | windows-latest | 推 tag 自动构建发布 |

### 为什么选 Tauri 而不是 Electron

| 对比项 | Electron (原版) | Tauri (轻量版) |
|--------|----------------|----------------|
| 启动时间 | 6-10 秒 | **< 2 秒**（WebView2 已预热） |
| 内存占用 | 150-300MB | **< 80MB**（无 Chromium） |
| 打包大小 | ~150MB | **< 15MB**（无内置浏览器） |
| 首次渲染到可交互 | 3-5 秒 | **< 1 秒**（CSR 无 SSR 等待） |
| 开发体验 | JS 全栈，热重载 | Rust 编译 + Vite HMR |
| 生态成熟度 | 非常成熟 | 快速成长，已足够 |

---

## 2. 完整目录结构

```
mc-mod-hub-light/
├── package.json                    # Vite + React + TypeScript 依赖
├── vite.config.ts                  # Vite 配置 + react plugin + @tauri-apps/api
├── tsconfig.json                   # TypeScript 严格模式
├── tsconfig.node.json              # Vite Node 端 TypeScript 配置
├── tailwind.config.ts              # Tailwind（照搬 MC-Mod-Hub）: creeper/surface/border/mc-*
├── postcss.config.js               # PostCSS + tailwindcss + autoprefixer
├── index.html                      # Vite SPA 入口 HTML
├── .gitignore                      # Git 忽略规则
│
├── src-tauri/                      # ═══ Tauri Rust 后端 ═══
│   ├── Cargo.toml                  # Rust 依赖：tauri, reqwest, rusqlite, zip, serde, tokio
│   ├── tauri.conf.json             # Tauri 窗口/打包/安全策略
│   ├── icons/                      # 应用图标（各尺寸，从 icon.png 自动生成）
│   ├── build.rs                    # Tauri 构建脚本
│   └── src/
│       ├── main.rs                 # Tauri 入口：注册所有 commands + 管理 AppState
│       ├── lib.rs                  # 模块声明
│       ├── types.rs                # Rust 数据结构（对应前端 src/types/index.ts）
│       ├── commands/               # Tauri Commands（对应原 Next.js API Routes）
│       │   ├── mod.rs              # 模块声明
│       │   ├── search.rs           # search() → CF+MR 合并搜索
│       │   ├── popular.rs          # get_popular() → 三类型热门
│       │   ├── list.rs             # list_resources() → 分页列表
│       │   ├── resource.rs         # get_resource_detail() → 详情+版本
│       │   ├── download.rs         # download_file() → 单文件下载
│       │   ├── batch_download.rs   # batch_download() → zip/folder
│       │   ├── collections.rs      # CRUD: list/create/update/delete + add/remove items
│       │   ├── updates.rs          # check_updates() → 更新提醒
│       │   ├── recently_viewed.rs  # get/add recently viewed
│       │   └── settings.rs         # get/save settings
│       ├── curseforge.rs           # CurseForge API 客户端 (reqwest)
│       ├── modrinth.rs             # Modrinth API 客户端 (reqwest)
│       ├── merger.rs               # 两平台结果合并去重（照搬 merger.ts 逻辑）
│       ├── db.rs                   # SQLite 操作：init/query/exec/save (rusqlite)
│       ├── format.rs               # 格式化：downloads/fileSize（照搬 format.ts）
│       └── game_versions.rs        # 游戏版本获取 + FALLBACK_VERSIONS
│
├── src/                            # ═══ Vite React 前端 ═══
│   ├── main.tsx                    # React 入口 + BrowserRouter
│   ├── App.tsx                     # 路由表 + ToastProvider + Layout
│   ├── globals.css                 # 全局样式（照搬 MC-Mod-Hub/src/app/globals.css）
│   ├── vite-env.d.ts              # Vite 类型声明
│   ├── types/
│   │   └── index.ts               # 类型定义（照搬 MC-Mod-Hub/src/types/index.ts）
│   ├── lib/                        # 前端工具（大部分逻辑已迁到 Rust）
│   │   ├── tauri.ts                # Tauri invoke 封装（统一错误处理）
│   │   ├── game-versions.ts        # 游戏版本获取（调 Rust command + FALLBACK）
│   │   └── format.ts               # 格式化工具（照搬 MC-Mod-Hub/src/lib/format.ts）
│   ├── components/                 # 组件（照搬 MC-Mod-Hub/src/components/）
│   │   ├── layout/
│   │   │   └── Navbar.tsx          # 导航栏（next/link → react-router-dom Link）
│   │   ├── home/
│   │   │   ├── SearchBar.tsx       # 搜索栏
│   │   │   ├── HotSection.tsx      # 热门板块
│   │   │   ├── ResourceCard.tsx    # 资源卡片
│   │   │   ├── ContextMenu.tsx     # 右键菜单（Portal）
│   │   │   ├── RecentlyViewed.tsx  # 最近浏览
│   │   │   └── UpdateAlerts.tsx    # 更新提醒
│   │   ├── resource/
│   │   │   ├── ResourceHeader.tsx  # 资源头部
│   │   │   ├── VersionSelector.tsx # 版本选择器
│   │   │   └── DownloadButton.tsx  # 下载按钮（fetch → invoke）
│   │   ├── collection/
│   │   │   ├── CollectionCard.tsx  # 收藏夹卡片
│   │   │   ├── ItemRow.tsx         # 资源行
│   │   │   └── CompatibilityCheck.tsx # 兼容性检测
│   │   └── common/
│   │       ├── Loading.tsx         # 加载动画
│   │       ├── Empty.tsx           # 空状态
│   │       ├── Toast.tsx           # 消息提示
│   │       └── ToastProvider.tsx   # Toast Context Provider
│   └── pages/                      # 页面组件
│       ├── HomePage.tsx            # 首页
│       ├── ResourcePage.tsx        # 资源详情
│       ├── CategoryPage.tsx        # 分类浏览
│       ├── CollectionsPage.tsx     # 收藏夹列表
│       ├── CollectionDetailPage.tsx # 收藏夹详情
│       ├── UpdatesPage.tsx         # 更新提醒
│       └── SettingsPage.tsx        # 设置页
│
├── public/
│   └── icon.png                    # 应用图标（1000×1000，Tauri 自动缩放）
│
├── .github/workflows/
│   └── release.yml                 # GitHub Actions 自动构建发布
│
├── migration-plan.md               # 迁移方案文档（本文件所在目录）
├── technical-design.md             # 本文件
├── AGENTS.md                       # AI 编程规则
└── prompt.md                       # 第一阶段开发执行 Prompt
```

---

## 3. Rust 端架构

### 3.1 Tauri AppState 设计

```rust
// src-tauri/src/main.rs
use std::sync::Mutex;

pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,      // SQLite 连接
    pub settings: Mutex<Settings>,             // 用户设置缓存
    pub http_client: reqwest::Client,          // HTTP 客户端（连接池复用）
}

fn main() {
    let app_state = AppState {
        db: Mutex::new(db::init_connection()),
        settings: Mutex::new(settings::load()),
        http_client: reqwest::Client::new(),
    };

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::search::search,
            commands::popular::get_popular,
            commands::list::list_resources,
            commands::resource::get_resource_detail,
            commands::download::download_file,
            commands::batch_download::batch_download,
            commands::collections::list_collections,
            commands::collections::create_collection,
            commands::collections::update_collection,
            commands::collections::delete_collection,
            commands::collections::add_item_to_collection,
            commands::collections::remove_item_from_collection,
            commands::collections::get_favorited_items,
            commands::updates::check_updates,
            commands::recently_viewed::get_recently_viewed,
            commands::recently_viewed::add_recently_viewed,
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::settings::get_game_versions,
            commands::settings::resolve_names,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### 3.2 src-tauri/src/ 结构

```
src-tauri/src/
├── main.rs              # Tauri 入口 + AppState + command 注册
├── lib.rs               # pub mod 声明
├── types.rs             # 共享数据结构（Serialize/Deserialize）
├── commands/
│   ├── mod.rs
│   ├── search.rs        # 1 个 command
│   ├── popular.rs       # 1 个 command
│   ├── list.rs          # 1 个 command
│   ├── resource.rs      # 1 个 command
│   ├── download.rs      # 1 个 command
│   ├── batch_download.rs # 1 个 command
│   ├── collections.rs   # 7 个 commands
│   ├── updates.rs       # 1 个 command
│   ├── recently_viewed.rs # 2 个 commands
│   └── settings.rs      # 3 个 commands
├── curseforge.rs        # CurseForge API 封装
├── modrinth.rs          # Modrinth API 封装
├── merger.rs            # 合并去重
├── db.rs                # SQLite 操作
├── format.rs            # 格式化工具
└── game_versions.rs     # 游戏版本
```

---

## 4. 前端架构

### 4.1 React Router 路由表

```typescript
// src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';

function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Navbar />
        <main className="pt-14 min-h-screen">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/category/:type" element={<CategoryPage />} />
            <Route path="/resource/:source/:id" element={<ResourcePage />} />
            <Route path="/collections" element={<CollectionsPage />} />
            <Route path="/collections/:id" element={<CollectionDetailPage />} />
            <Route path="/updates" element={<UpdatesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </BrowserRouter>
    </ToastProvider>
  );
}
```

### 4.2 状态管理

- **跨组件状态**（Toast、收藏夹列表）使用 React Context
- **页面内状态**使用 useState/useEffect
- **URL 参数**（搜索关键词、分页）使用 `useSearchParams()`
- **不引入** Redux、Zustand 等外部状态库

### 4.3 数据获取模式

```
┌──────────────┐     invoke()     ┌──────────────┐    reqwest    ┌────────────┐
│   React 组件  │ ───────────────→ │  Rust Command │ ────────────→ │ CF/MR API  │
│              │ ←─────────────── │              │ ←──────────── │            │
└──────────────┘    JSON result    └──────┬───────┘               └────────────┘
                                          │
                                          │ rusqlite
                                          ▼
                                    ┌──────────┐
                                    │  SQLite   │
                                    │  app.db   │
                                    └──────────┘
```

---

## 5. 数据库设计

### 5.1 数据库文件位置

- **开发环境**：`项目根目录/data/app.db`（Tauri dev 模式，current_dir = 项目根）
- **生产环境**：`%APPDATA%/com.mcmodhub.app/data/app.db`（Tauri app_data_dir）

在 `db.rs` 中动态判断：
```rust
use tauri::api::path::app_data_dir;

fn get_db_path(config: &tauri::Config) -> PathBuf {
    if cfg!(debug_assertions) {
        PathBuf::from("data/app.db")
    } else {
        app_data_dir(config).unwrap().join("data/app.db")
    }
}
```

### 5.2 表结构（完全照搬 MC-Mod-Hub，一字不改）

```sql
CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  game_version TEXT NOT NULL,
  release_type TEXT DEFAULT 'release',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS collection_items (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  resource_name TEXT NOT NULL,
  source TEXT NOT NULL,
  icon_url TEXT,
  selected_file_id TEXT,
  selected_file_name TEXT,
  selected_game_version TEXT,
  added_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS recently_viewed (
  id TEXT PRIMARY KEY,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  resource_name TEXT NOT NULL,
  source TEXT NOT NULL,
  icon_url TEXT,
  viewed_at TEXT DEFAULT (datetime('now'))
);
```

### 5.3 rusqlite 操作封装

```rust
// db.rs
use rusqlite::{Connection, params};
use std::sync::Mutex;

pub type DbConn = Mutex<Connection>;

pub fn init_connection(path: &Path) -> DbConn {
    let conn = Connection::open(path).expect("无法打开数据库");
    conn.execute_batch("PRAGMA foreign_keys = ON").unwrap();
    init_tables(&conn);
    Mutex::new(conn)
}

fn init_tables(conn: &Connection) {
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS collections (...);
        CREATE TABLE IF NOT EXISTS collection_items (...);
        CREATE TABLE IF NOT EXISTS recently_viewed (...);
    ").unwrap();
}
```

---

## 6. 外部 API 对接

### 6.1 CurseForge API 客户端

```rust
// curseforge.rs
use reqwest::Client;
use crate::types::*;

const API_BASE: &str = "https://api.curseforge.com";
const GAME_ID: u32 = 432;

pub struct CurseForgeClient {
    client: Client,
    api_key: String,
}

impl CurseForgeClient {
    pub fn new(api_key: String) -> Self {
        Self { client: Client::new(), api_key }
    }

    pub async fn search_mods(&self, query: &str, limit: u32) -> Vec<ResourceItem> {
        let url = format!("{}/v1/mods/search", API_BASE);
        let resp = self.client.get(&url)
            .header("x-api-key", &self.api_key)
            .query(&[("gameId", GAME_ID), ("searchFilter", query), ("sortBy", "6"), ("pageSize", limit)])
            .send().await?;
        // 解析 → map to ResourceItem
    }
    // fetchPopular, getModDetail, getModFiles, getModFileDownloadUrl, getModsBatch ...
}
```

### 6.2 Modrinth API 客户端

```rust
// modrinth.rs
use reqwest::Client;

const API_BASE: &str = "https://api.modrinth.com/v2";

pub struct ModrinthClient {
    client: Client,
}

impl ModrinthClient {
    pub fn new() -> Self {
        Self { client: Client::new() }
    }

    pub async fn search_projects(&self, query: &str, limit: u32) -> Vec<ResourceItem> {
        let url = format!("{}/search", API_BASE);
        let resp = self.client.get(&url)
            .query(&[("query", query), ("limit", limit), ("sort", "relevance")])
            .send().await?;
        // 解析 → map to ResourceItem
    }
    // fetchPopular, getProjectDetail, getProjectVersions, getProjectsBatch ...
}
```

### 6.3 API Key 流转

```
┌──────────┐  输入 API Key  ┌──────────┐  invoke('save_settings')  ┌──────────┐
│ 设置页 UI │ ────────────→ │ 前端状态  │ ───────────────────────→ │ Rust 端   │
└──────────┘                └──────────┘                           └────┬─────┘
                                                                       │
  CurseForge API ←── x-api-key header ─── reqwest ─── read from settings.json
```

---

## 7. 下载实现

### 7.1 单文件下载

```rust
// commands/download.rs
#[tauri::command]
async fn download_file(
    state: tauri::State<'_, AppState>,
    source: String,
    file_id: String,
    file_name: String,
    mod_id: Option<String>,
) -> Result<String, String> {
    // 1. 获取下载 URL
    let download_url = match source.as_str() {
        "curseforge" => curseforge::get_download_url(&state, &mod_id?, &file_id).await?,
        "modrinth" => modrinth::get_download_url(&state, &file_id).await?,
        _ => return Err("Invalid source".into()),
    };

    // 2. 流式下载到临时目录
    let temp_dir = std::env::temp_dir().join("mc-mod-hub");
    let temp_path = temp_dir.join(&file_name);
    let response = state.http_client.get(&download_url).send().await?;
    let bytes = response.bytes().await?;
    std::fs::write(&temp_path, &bytes)?;

    // 3. 弹出保存对话框 → 复制到用户指定位置
    // (用 tauri::api::dialog 或返回路径给前端处理)
    Ok(temp_path.to_string_lossy().to_string())
}
```

### 7.2 批量下载（zip 模式）

```rust
// commands/batch_download.rs
#[tauri::command]
async fn batch_download(
    state: tauri::State<'_, AppState>,
    mode: String,
    files: Vec<BatchFile>,
) -> Result<String, String> {
    if mode == "zip" {
        let temp_dir = std::env::temp_dir().join("mc-mod-hub-zip");
        std::fs::create_dir_all(&temp_dir)?;

        // 逐个下载到临时目录（并发 3）
        for chunk in files.chunks(3) {
            let tasks = chunk.iter().map(|f| download_one(&state, f));
            futures::future::join_all(tasks).await;
        }

        // zip 打包
        let zip_path = temp_dir.join(format!("mods-{}.zip", timestamp()));
        let file = std::fs::File::create(&zip_path)?;
        let mut zip = zip::ZipWriter::new(file);
        // ... 逐个 add

        Ok(zip_path.to_string_lossy().to_string())
    } else {
        // folder mode: 逐一下载到用户选择目录
    }
}
```

### 7.3 前端调用方式

原版 `fetch('/api/download?...')` + `URL.createObjectURL(blob)` 替换为：

```typescript
// 单文件下载
import { invoke } from '@tauri-apps/api/tauri';

const filePath = await invoke<string>('download_file', {
  source, fileId, fileName, modId
});
toast.success(`已下载到 ${filePath}`);
```

---

## 8. 组件复用策略

### 8.1 直接复制（不修改代码）

| 组件 | 文件 |
|------|------|
| SearchBar | 无 Next.js API 依赖 |
| HotSection | 仅 props 传递 |
| ResourceCard | 仅数据展示 |
| ContextMenu | `createPortal` 到 body（原生 DOM API） |
| VersionSelector | 纯 UI 交互 |
| ItemRow | 纯展示+回调 |
| Loading / Empty / Toast / ToastProvider | 纯 UI |

### 8.2 仅改路由链接

| 组件 | 改动 |
|------|------|
| Navbar | `next/link` → `react-router-dom Link`；`next/navigation usePathname` → `react-router-dom useLocation` |
| HotSection | `Link href=...` → `<Link to=...>` |
| ResourceCard | 同上 |
| RecentlyViewed | 同上 |
| UpdateAlerts | 同上 |
| ResourceHeader | 同上 |
| CollectionCard | 同上 |

### 8.3 需改数据获取

| 组件 | 原方式 | 新方式 |
|------|--------|--------|
| DownloadButton | `fetch('/api/download?...')` → blob → `a.click()` | `invoke('download_file', {...})` → filePath → toast |
| CompatibilityCheck | `fetch('/api/resolve-names?...')` | `invoke('resolve_names', {...})` |

---

## 9. 打包发布方案

### 9.1 tauri.conf.json 打包配置

```json
{
  "build": {
    "devUrl": "http://localhost:1420",
    "frontendDist": "../dist"
  },
  "app": {
    "title": "MC Mod Hub",
    "windows": [
      {
        "title": "MC Mod Hub",
        "width": 1280,
        "height": 800,
        "minWidth": 800,
        "minHeight": 600
      }
    ]
  },
  "bundle": {
    "active": true,
    "targets": ["msi", "nsis"],
    "icon": ["icons/icon.png"]
  }
}
```

### 9.2 GitHub Actions

```yaml
name: Build and Release
on:
  push:
    tags: ['v*']
  workflow_dispatch:

jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
      - name: Install dependencies
        run: npm ci
      - name: Build Tauri
        run: npm run tauri build
      - name: Upload to Release
        uses: softprops/action-gh-release@v1
        with:
          files: src-tauri/target/release/bundle/msi/*.msi
          generate_release_notes: true
```

---

## 10. 容易踩坑的地方

| 坑 | 说明 | 避免方法 |
|----|------|---------|
| Windows Rust 编译环境 | 需 Visual Studio Build Tools + Windows SDK | 文档提供 winget 一条命令安装 |
| WebView2 兼容性 | Windows 10 需确保 WebView2 Runtime 已安装 | windows-latest runner 已预装；用户端 Win10+ 自带 |
| rusqlite 绑定 | rusqlite 需 sqlite3 开发库（bundled feature 可解决） | Cargo.toml 使用 `rusqlite = { version = "0.31", features = ["bundled"] }` |
| sql.js → rusqlite 差异 | API 完全不同（stmt.step → conn.query_row） | 重新实现但业务逻辑照搬 |
| 下载方案差异 | blob URL 在 Tauri 不可用 | 所有下载移到 Rust 端，前端只调 invoke |
| Tailwind content 路径 | Next.js src/ → Vite src/ | vite.config.ts 配置 content: ['./src/**/*.{ts,tsx}'] |
| Tauri 安全策略 (CSP) | Tauri 默认 CSP 可能阻止外部图片加载 | tauri.conf.json 配置宽松 CSP |
| API Key 读取时序 | Rust 端读取 settings.json 发生在 command 调用时 | 每次调 CurseForge API 前实时读取设置 |
| 字体回退 | 原版 font-family 用了系统字体，Tauri WebView2 可能缺 | 保持原版 font-family 设置 |

---

## 11. 必须照搬的源文件路径标注

| 目标文件 | 照搬来源 | 改造说明 |
|----------|---------|---------|
| `src/types/index.ts` | `D:\vibe coding\projects\MC-Mod-Hub\src\types\index.ts` | 直接复制，一字不改 |
| `src/lib/format.ts` | `D:\vibe coding\projects\MC-Mod-Hub\src\lib\format.ts` | 直接复制 |
| `src/lib/game-versions.ts` | `D:\vibe coding\projects\MC-Mod-Hub\src\lib\game-versions.ts` | 改 fetch('/api/...') → invoke('get_game_versions') |
| `src/globals.css` | `D:\vibe coding\projects\MC-Mod-Hub\src\app\globals.css` | 直接复制 |
| `tailwind.config.ts` | `D:\vibe coding\projects\MC-Mod-Hub\tailwind.config.ts` | 直接复制，content 路径改为 `./src/**/*.{ts,tsx}` |
| `src/components/**/*.tsx` (18个) | `D:\vibe coding\projects\MC-Mod-Hub\src\components\` | 直接复制→改路由链接 |
| `src/pages/*.tsx` (7个页面) | `D:\vibe coding\projects\MC-Mod-Hub\src\app\` | 从 page.tsx 提取逻辑→改数据获取方式→改路由API |
| `src-tauri/src/curseforge.rs` | `D:\vibe coding\projects\MC-Mod-Hub\src\lib\curseforge.ts` | JS→Rust 重写，逻辑照搬 |
| `src-tauri/src/modrinth.rs` | `D:\vibe coding\projects\MC-Mod-Hub\src\lib\modrinth.ts` | JS→Rust 重写，逻辑照搬 |
| `src-tauri/src/merger.rs` | `D:\vibe coding\projects\MC-Mod-Hub\src\lib\merger.ts` | JS→Rust 重写，逻辑照搬 |
| `src-tauri/src/db.rs` | `D:\vibe coding\projects\MC-Mod-Hub\src\lib\db.ts` | sql.js→rusqlite 重写，表结构照搬 |
| `src-tauri/src/format.rs` | `D:\vibe coding\projects\MC-Mod-Hub\src\lib\format.ts` | JS→Rust 重写 |
| `src-tauri/src/game_versions.rs` | `D:\vibe coding\projects\MC-Mod-Hub\src\lib\game-versions.ts` | JS→Rust 重写，FALLBACK_VERSIONS 照搬 |

---

## 12. 新功能扩展指南

### 12.1 扩展原则

本项目设计为**附录模式**——任何新功能通过"追加"而非"修改"的方式插入。具体规则见 `migration-plan.md` 第 12 节。

### 12.2 Rust 端扩展模板

新增一个 Tauri command 的标准操作：

```rust
// 1. 新建 src-tauri/src/commands/new_feature.rs
#[tauri::command]
pub async fn new_feature(
    state: tauri::State<'_, AppState>,
    param: String,
) -> Result<Vec<SomeType>, String> {
    // 调 curseforge/modrinth/db 模块
    Ok(vec![])
}

// 2. 在 src-tauri/src/commands/mod.rs 追加
pub mod new_feature;

// 3. 在 src-tauri/src/main.rs 的 invoke_handler!() 追加
commands::new_feature::new_feature,
```

### 12.3 前端扩展模板

新增一个页面的标准操作：

```tsx
// 1. 新建 src/pages/NewPage.tsx
export default function NewPage() {
  // ...
}

// 2. 在 src/App.tsx 的 <Routes> 内追加
<Route path="/new-feature" element={<NewPage />} />

// 3. 如需显示在 Navbar，在 Navbar.tsx 追加链接
```

### 12.4 数据库扩展

新增表只追加不修改：

```rust
// 在 db.rs 的 init_tables() 末尾追加（不修改 3 张现有表的 CREATE）
conn.execute("CREATE TABLE IF NOT EXISTS new_table (...)", [])?;
```

### 12.5 新平台接入

继承 CurseForge/Modrinth 模式：

```rust
// 1. 新建 src-tauri/src/new_platform.rs
// 2. 返回统一 ResourceItem 结构（不改 types.rs）
// 3. 在 merger.rs 的 merge_results() 增加参数（可选）
// 4. 在对应 command 中增加 tokio::spawn 调用
```

