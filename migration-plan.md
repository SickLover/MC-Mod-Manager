# 迁移方案文档 — MC Mod Hub 轻量化迁移

> 从 Electron + Next.js 14 → Tauri + React SPA，全部功能对等照搬

---

## 1. 技术栈对比

| 层级 | 原版（MC-Mod-Hub） | 轻量化版 | 理由 |
|------|---------------------|----------|------|
| 桌面框架 | Electron | **Tauri** | 启动<2秒，内存<80MB，打包<15MB |
| 前端框架 | Next.js 14 App Router | **Vite + React 18 SPA** | 去掉 SSR/SSG 负担，纯 CSR |
| 路由 | Next.js 文件路由 | **react-router-dom v6** | 声明式路由，模仿 App Router 结构 |
| 样式 | Tailwind CSS (mc-* 色板) | **Tailwind CSS（照搬）** | 直接复制 tailwind.config.ts |
| API 层 | Next.js API Routes (15个) | **Tauri Commands (Rust)** | 砍掉 HTTP 中间层，前端直接调 Rust |
| 数据库 | sql.js WASM | **Tauri Rust 端 SQLite (rusqlite)** | 原生性能，无 WASM 加载开销 |
| HTTP 客户端 | fetch (Next.js 扩展) | **reqwest (Rust 端)** | Tauri command 内调用外部 API |
| 设置存储 | Electron IPC + localStorage | **Tauri fs API + localStorage fallback** | settings.json 存 app data dir |
| 下载 | blob + createObjectURL | **Tauri fs + reqwest 流式下载** | 写入用户指定目录，绕开浏览器下载 |
| ZIP 打包 | jszip (JS 端) | **zip crate (Rust 端)** | 在 Rust 端打包，性能更好 |
| 打包输出 | NSIS .exe (~150MB) | **Tauri bundler .msi/.exe (<15MB)** | 不含 Chromium，仅 WebView2 |

---

## 2. 目录结构设计

```
mc-mod-hub-light/
├── package.json                    # Vite + React 依赖
├── vite.config.ts                  # Vite 配置
├── tsconfig.json                   # TypeScript 配置
├── tailwind.config.ts              # Tailwind（照搬 MC-Mod-Hub）
├── postcss.config.js               # PostCSS
├── index.html                      # Vite 入口 HTML
├── .gitignore
│
├── src-tauri/                      # Tauri Rust 后端
│   ├── Cargo.toml
│   ├── tauri.conf.json             # Tauri 窗口/打包配置
│   ├── icons/                      # 应用图标（各尺寸）
│   ├── build.rs
│   └── src/
│       ├── main.rs                 # Tauri 入口 + command 注册
│       ├── commands/               # Tauri Commands（对应原 API Routes）
│       │   ├── mod.rs
│       │   ├── search.rs           # 搜索（CF+MR 合并）
│       │   ├── popular.rs          # 热门内容
│       │   ├── resource.rs         # 资源详情+版本列表
│       │   ├── download.rs         # 单文件下载
│       │   ├── batch_download.rs   # 批量下载（zip/folder）
│       │   ├── collections.rs      # 收藏夹 CRUD
│       │   ├── updates.rs          # 更新提醒
│       │   ├── recently_viewed.rs  # 最近浏览
│       │   └── settings.rs         # 设置读写
│       ├── curseforge.rs           # CurseForge API 客户端 (reqwest)
│       ├── modrinth.rs             # Modrinth API 客户端 (reqwest)
│       ├── merger.rs               # 两平台结果合并去重
│       ├── db.rs                   # SQLite 操作 (rusqlite)
│       ├── format.rs               # 格式化工具
│       ├── game_versions.rs        # 游戏版本列表
│       └── types.rs                # Rust 数据结构（对应前端 types/index.ts）
│
├── src/                            # Vite React 前端
│   ├── main.tsx                    # React 入口
│   ├── App.tsx                     # 路由配置 + ToastProvider
│   ├── globals.css                 # 全局样式（照搬 MC-Mod-Hub）
│   ├── types/
│   │   └── index.ts               # TypeScript 类型（照搬 MC-Mod-Hub）
│   ├── lib/                        # 前端工具（大部分逻辑已迁到 Rust）
│   │   ├── tauri.ts                # Tauri invoke 封装
│   │   ├── game-versions.ts        # 游戏版本获取（调 Tauri command）
│   │   └── format.ts               # 格式化工具（照搬 MC-Mod-Hub）
│   ├── components/                 # React 组件（照搬 MC-Mod-Hub）
│   │   ├── layout/
│   │   │   └── Navbar.tsx
│   │   ├── home/
│   │   │   ├── SearchBar.tsx
│   │   │   ├── HotSection.tsx
│   │   │   ├── ResourceCard.tsx
│   │   │   ├── ContextMenu.tsx
│   │   │   ├── RecentlyViewed.tsx
│   │   │   └── UpdateAlerts.tsx
│   │   ├── resource/
│   │   │   ├── ResourceHeader.tsx
│   │   │   ├── VersionSelector.tsx
│   │   │   └── DownloadButton.tsx
│   │   ├── collection/
│   │   │   ├── CollectionCard.tsx
│   │   │   ├── ItemRow.tsx
│   │   │   └── CompatibilityCheck.tsx
│   │   └── common/
│   │       ├── Loading.tsx
│   │       ├── Empty.tsx
│   │       ├── Toast.tsx
│   │       └── ToastProvider.tsx
│   └── pages/                      # 页面（对应原 src/app/ 下的 page.tsx）
│       ├── HomePage.tsx
│       ├── ResourcePage.tsx
│       ├── CategoryPage.tsx
│       ├── CollectionsPage.tsx
│       ├── CollectionDetailPage.tsx
│       ├── UpdatesPage.tsx
│       └── SettingsPage.tsx
└── .github/workflows/
    └── release.yml                 # GitHub Actions 自动构建发布
```

---

## 3. API 层改造方案 — Next.js API Route → Tauri Command 映射表

15 个 API Route 全部映射为 Rust Tauri Command：

| # | 原 API Route | 方法 | Tauri Command (Rust) | 说明 |
|---|-------------|------|---------------------|------|
| 1 | `/api/search?q=` | GET | `search(query: String) -> Vec<ResourceItem>` | CF+MR 合并搜索 |
| 2 | `/api/popular` | GET | `get_popular() -> PopularData` | 三类型热门资源 |
| 3 | `/api/list?type=&offset=&limit=` | GET | `list_resources(type, offset, limit) -> Vec<ResourceItem>` | 分页列表 |
| 4 | `/api/resource/:source/:id` | GET | `get_resource_detail(source, id) -> ResourceDetail` | 资源详情+版本 |
| 5 | `/api/download?source=&fileId=&fileName=` | GET | `download_file(source, fileId, fileName) -> String` | 返回本地文件路径 |
| 6 | `/api/batch-download` | POST | `batch_download(mode, files) -> String` | zip打包 或 folder逐一下载 |
| 7 | `/api/check-updates` | GET | `check_updates() -> Vec<UpdateInfo>` | 收藏夹资源更新 |
| 8 | `/api/game-versions` | GET | `get_game_versions() -> Vec<String>` | Minecraft 版本列表 |
| 9 | `/api/resolve-names?source=&ids=` | GET | `resolve_names(source, ids) -> HashMap<String, String>` | 批量解析 Mod 名称 |
| 10 | `/api/recently-viewed` | GET | `get_recently_viewed() -> Vec<ResourceItem>` | 最近浏览记录 |
| 11 | `/api/recently-viewed` | POST | `add_recently_viewed(item) -> ()` | 记录浏览 |
| 12 | `/api/collections` | GET | `list_collections() -> Vec<Collection>` | 收藏夹列表 |
| 13 | `/api/collections` | POST | `create_collection(name, gameVersion) -> Collection` | 创建收藏夹 |
| 14 | `/api/collections/:id` | PUT | `update_collection(id, name, gameVersion) -> Collection` | 重命名/改版本 |
| 15 | `/api/collections/:id` | DELETE | `delete_collection(id) -> ()` | 删除收藏夹 |
| 16 | `/api/collections/:id/items` | POST | `add_item_to_collection(collectionId, item) -> ()` | 添加资源 |
| 17 | `/api/collections/remove-resource` | POST | `remove_item_from_collection(collectionId, resourceId, source) -> ()` | 移除资源 |
| 18 | `/api/collections/favorited` | GET | `get_favorited_items(resourceIds) -> Vec<String>` | 检查已收藏 |

**改造要点**：
- `db.ts` 的 sql.js 操作 → Rust `db.rs` 用 rusqlite，通过 `tauri::api::path::app_data_dir()` 获取数据目录
- `curseforge.ts` 的 `fetch()` + API Key → Rust `curseforge.rs` 用 reqwest + 从 settings.json 读取 Key
- `modrinth.ts` 的 `fetch()` → Rust `modrinth.rs` 用 reqwest
- `merger.ts` 的合并/去重逻辑 → Rust `merger.rs`，逻辑完全照搬
- `format.ts` → 保留在前端 `src/lib/format.ts`（纯计算，不涉及 I/O）

---

## 4. 数据库方案 — sql.js WASM → Rust 端 SQLite

### 4.1 数据库驱动

| 对比项 | sql.js (原版) | rusqlite (轻量版) |
|--------|--------------|-------------------|
| 运行环境 | JS/WASM 在渲染进程 | Rust 原生在 Tauri 主进程 |
| 文件位置 | `process.cwd()/data/app.db` | `app_data_dir()/data/app.db` |
| 初始化 | 动态 import('sql.js') | `Connection::open()` |
| 查询 | `stmt.step() / getAsObject()` | `conn.query_row() / prepare()` |

### 4.2 表结构（完全照搬，一字不改）

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

### 4.3 数据库文件路径

- **开发环境**：`项目根目录/data/app.db`
- **生产环境**：`%APPDATA%/mc-mod-hub-light/data/app.db`

在 Rust 端通过 `tauri::api::path::app_data_dir()` 获取，确保跨环境一致。

### 4.4 前端调用方式

前端不直接访问 SQLite。所有数据库操作通过 Tauri command 调用：

```typescript
// 前端
import { invoke } from '@tauri-apps/api/tauri';
const collections = await invoke<Collection[]>('list_collections');
```

```rust
// Rust 端 command
#[tauri::command]
fn list_collections(state: tauri::State<AppState>) -> Result<Vec<Collection>, String> {
    let conn = state.db.lock().unwrap();
    // rusqlite 查询...
}
```

---

## 5. 下载方案 — blob+createObjectURL → Tauri 文件系统

### 5.1 单文件下载

| 对比项 | 原版（Next.js API Route） | 轻量版（Tauri Command） |
|--------|--------------------------|------------------------|
| 获取下载URL | Next.js fetch CurseForge/Modrinth | Rust reqwest 调 CF/MR API |
| 下载文件 | 服务端 fetch → 流式传回浏览器 blob | Rust reqwest 流式下载到临时目录 |
| 保存到本地 | `a.click()` blob download 或 Electron saveFileDialog | Tauri 原生文件对话框 → fs::copy |
| 用户指定目录 | Electron IPC `selectDir` | Tauri `dialog` 模块 |

**Rust 端流程**：
```
1. 前端 invoke('download_file', { source, fileId, fileName })
2. Rust 获取下载 URL（resolver URL for CF, version files for MR）
3. Rust reqwest 流式下载 → 临时文件
4. Rust 弹出保存对话框 → 复制到用户指定位置
5. 返回最终文件路径给前端
```

### 5.2 批量下载（zip 模式）

| 对比项 | 原版（jszip） | 轻量版（zip crate） |
|--------|-------------|-------------------|
| 并发控制 | `withConcurrencyLimit(3)` | Rust tokio `try_join_all` + `buffer_unordered(3)` |
| 打包 | jszip.generateAsync() | `zip::ZipWriter` |
| 返回 | NextResponse blob stream | 写入临时 zip → 返回路径 |

### 5.3 批量下载（folder 模式）

逐一下载每个文件到用户指定目录，Rust 端管理全部 I/O。

---

## 6. 设置存储方案

| 对比项 | 原版 | 轻量版 |
|--------|------|--------|
| 桌面环境 | Electron IPC → settings.json | Tauri fs API → settings.json |
| 浏览器fallback | localStorage | localStorage (开发时用 Vite dev server) |
| 文件路径 | `userData/settings.json` | `app_data_dir()/settings.json` |
| API Key 注入 | process.env / Electron IPC | Rust 端从 settings.json 读取后注入 reqwest header |

**settings.json 结构**（不变）：
```json
{
  "curseforgeApiKey": "$2a$10$...",
  "defaultDownloadDir": "D:/Minecraft/mods",
  "checkUpdatesOnStartup": true
}
```

---

## 7. 路由迁移表 — Next.js App Router → react-router-dom

| 原路由 | 新路由 | React 页面组件 | 说明 |
|--------|--------|---------------|------|
| `/` | `/` | `HomePage` | 搜索+热门+最近浏览+更新提醒 |
| `/category/[type]` | `/category/:type` | `CategoryPage` | 分类分页浏览 |
| `/resource/[source]/[id]` | `/resource/:source/:id` | `ResourcePage` | 资源详情+版本选择+下载 |
| `/collections` | `/collections` | `CollectionsPage` | 收藏夹列表 CRUD |
| `/collections/[id]` | `/collections/:id` | `CollectionDetailPage` | 收藏夹详情+批量下载 |
| `/updates` | `/updates` | `UpdatesPage` | 更新提醒列表 |
| `/settings` | `/settings` | `SettingsPage` | API Key+下载目录+偏好 |

**适配要点**：
- `next/link` → `react-router-dom` 的 `Link`
- `next/navigation` 的 `useRouter()` / `useParams()` / `useSearchParams()` → `react-router-dom` 的 `useNavigate()` / `useParams()` / `useSearchParams()`
- `'use client'` 指令 → 删除（React SPA 天然全是客户端组件）
- `next/image` → 普通 `<img>` 标签

---

## 8. 18 个组件的复用策略

| # | 组件 | 来源文件 | 改造量 | 改造内容 |
|---|------|---------|--------|---------|
| 1 | Navbar | `src/components/layout/Navbar.tsx` | 轻 | `next/link` → `react-router-dom Link` |
| 2 | SearchBar | `src/components/home/SearchBar.tsx` | 无 | 直接复制 |
| 3 | HotSection | `src/components/home/HotSection.tsx` | 轻 | `next/link` → `react-router-dom Link` |
| 4 | ResourceCard | `src/components/home/ResourceCard.tsx` | 轻 | 同上 + ContextMenu 集成 |
| 5 | ContextMenu | `src/components/home/ContextMenu.tsx` | 无 | `createPortal` 到 body 不变 |
| 6 | RecentlyViewed | `src/components/home/RecentlyViewed.tsx` | 轻 | 路由链接适配 |
| 7 | UpdateAlerts | `src/components/home/UpdateAlerts.tsx` | 轻 | 路由链接适配 |
| 8 | ResourceHeader | `src/components/resource/ResourceHeader.tsx` | 轻 | 路由链接适配 |
| 9 | VersionSelector | `src/components/resource/VersionSelector.tsx` | 无 | 直接复制 |
| 10 | DownloadButton | `src/components/resource/DownloadButton.tsx` | 中 | fetch → `invoke('download_file')` |
| 11 | CollectionCard | `src/components/collection/CollectionCard.tsx` | 轻 | 路由链接适配 |
| 12 | ItemRow | `src/components/collection/ItemRow.tsx` | 无 | 直接复制（纯展示+交互） |
| 13 | CompatibilityCheck | `src/components/collection/CompatibilityCheck.tsx` | 中 | fetch `/api/resolve-names` → `invoke('resolve_names')` |
| 14 | Loading | `src/components/common/Loading.tsx` | 无 | 直接复制 |
| 15 | Empty | `src/components/common/Empty.tsx` | 无 | 直接复制 |
| 16 | Toast | `src/components/common/Toast.tsx` | 无 | 直接复制 |
| 17 | ToastProvider | `src/components/common/ToastProvider.tsx` | 无 | 直接复制（React Context 不变） |

**改造量分级**：
- **无**：直接复制，不动一行代码
- **轻**：仅改路由链接（`next/link` → `react-router-dom Link`）
- **中**：需改数据获取方式（fetch → Tauri invoke）

---

## 9. 第三方服务对接

| 服务 | 原版（Next.js API Route） | 轻量版（Rust Command） |
|------|------------------------|---------------------|
| CurseForge API | 服务端 fetch + `x-api-key` header | Rust reqwest + `x-api-key` header（Key 从 settings.json 读） |
| Modrinth API | 服务端 fetch（无需Key） | Rust reqwest（无需 Key） |
| API Key 来源 | process.env 或 settings.json | `app_data_dir()/settings.json` |
| Game Versions | `/api/game-versions` 调外部 API | Rust 端先用 reqwest 调，失败用 FALLBACK_VERSIONS |

**CurseForge API Key 流转**：
```
用户在设置页输入 → 前端 invoke('save_settings', settings) → Rust 写入 settings.json
→ 后续调用 CurseForge API 时 → Rust 端 read_settings() 获取 Key → 注入 reqwest header
```

---

## 10. 分步开发计划（详细版）

沿用 MC-Mod-Hub 的 10 步体系，每步独立可验证。每个 Step 对应一个对话窗口，**完成即止，不跨步**。

---

### Phase 1 — MVP（搭骨架 + 搜索链路）

> 目标：Tauri 项目可启动，输入关键词能搜出 CF+MR 结果并在卡片中展示。**这是整个项目的"心跳"——后续所有功能都在这个骨架上长。**

#### Step 1 — 项目初始化

| 属性 | 内容 |
|------|------|
| **一句话目标** | `cargo tauri dev` 能启动一个空白窗口 |
| **依赖** | 无（从零开始） |
| **新建文件** | 全部项目骨架文件 |
| **修改文件** | 无 |
| **涉及层** | 前端 + Rust 端 |

**具体产出**：

| # | 子步骤 | 产出 | 验证方式 |
|---|--------|------|---------|
| 1.1 | 创建 Tauri + Vite + React + TS 项目 | `package.json` / `vite.config.ts` / `tsconfig.json` / `index.html` | `npm run dev` 能在浏览器打开 |
| 1.2 | 配置 Tauri | `src-tauri/Cargo.toml` / `tauri.conf.json` / `build.rs` / `src/main.rs` | `cargo tauri dev` 弹出窗口 |
| 1.3 | 配置 Tailwind CSS | `tailwind.config.ts`（从 MC-Mod-Hub 复制，content 路径改为 `./src/**/*.{ts,tsx}`）/ `postcss.config.js` | 窗口背景变暗色 |
| 1.4 | 复制全局样式 | `src/globals.css`（从 MC-Mod-Hub 复制） | 暗色主题生效 |
| 1.5 | 复制 types + 前端工具 | `src/types/index.ts` + `src/lib/format.ts`（直接复制） | TypeScript 编译通过 |
| 1.6 | 项目配置文件 | `.gitignore` + 确认目录结构正确 | `git status` 干净 |

**完成后项目结构**：
```
mc-mod-hub-light/
├── package.json / vite.config.ts / tsconfig.json / tailwind.config.ts / postcss.config.js
├── index.html / .gitignore
├── src/
│   ├── main.tsx / App.tsx / globals.css / vite-env.d.ts
│   ├── types/index.ts
│   └── lib/format.ts
└── src-tauri/
    ├── Cargo.toml / tauri.conf.json / build.rs
    └── src/main.rs
```

**可复用的基础设施**（后续 Step 直接继承）：
- `tailwind.config.ts` — 不再改动
- `globals.css` — 不再改动
- `src/types/index.ts` — 不再改动
- `src/lib/format.ts` — 不再改动

---

#### Step 2 — 基础设施层 (Rust)

| 属性 | 内容 |
|------|------|
| **一句话目标** | 前端输入关键词 → 调 `invoke('search')` → Rust 调 CF+MR → 返回合并结果 JSON |
| **依赖** | Step 1（项目已可启动） |
| **新建文件** | Rust 端 8 个文件 + 前端 tauri.ts |
| **修改文件** | `src-tauri/Cargo.toml`（加 reqwest/serde/tokio） / `src-tauri/src/main.rs`（加 AppState + command 注册） |
| **涉及层** | Rust 端为主，前端仅加 tauri.ts 封装 |

**具体产出**：

| # | 子步骤 | 产出 | 验证方式 |
|---|--------|------|---------|
| 2.1 | Rust 类型定义 | `src-tauri/src/types.rs`（与 `src/types/index.ts` 对等） | `cargo check` 通过 |
| 2.2 | CurseForge API 客户端 | `src-tauri/src/curseforge.rs`（search_mods + get_mod_detail + get_mod_files + get_mod_file_download_url） | 单元测试或 cargo check |
| 2.3 | Modrinth API 客户端 | `src-tauri/src/modrinth.rs`（search_projects + get_project_detail + get_project_versions + get_version_download_url） | cargo check |
| 2.4 | 合并去重 | `src-tauri/src/merger.rs`（照搬 merger.ts 逻辑） | cargo check |
| 2.5 | SQLite 数据库 | `src-tauri/src/db.rs`（init_connection + init_tables + CRUD 封装） | 数据库文件生成 |
| 2.6 | search command | `src-tauri/src/commands/search.rs`（调 CF+MR → 合并去重 → 返回 Vec<ResourceItem>） | cargo check |
| 2.7 | Tauri 入口 | `src-tauri/src/main.rs`（AppState + command 注册） / `lib.rs`（模块声明） | `cargo build` 通过 |
| 2.8 | 前端 invoke 封装 | `src/lib/tauri.ts` | 编译通过 |

**Rust 端结构**（此后不再大改）：
```
src-tauri/src/
├── main.rs          # Tauri 入口 — 后续只加 command 注册行
├── lib.rs           # 模块声明 — 后续只加 mod 行
├── types.rs         # 数据结构 — 后续可能加新 struct
├── curseforge.rs    # CF API — 后续可能加新函数
├── modrinth.rs      # MR API — 后续可能加新函数
├── merger.rs        # 合并去重 — 不改
├── db.rs            # SQLite — 后续可能加新查询
└── commands/
    ├── mod.rs
    └── search.rs    # 第一个 command
```

**此步不碰前端 UI**——只验证 Rust 端能编译并在后续 Step 接入前端。

---

#### Step 3 — 前端骨架

| 属性 | 内容 |
|------|------|
| **一句话目标** | 浏览器打开能看到 Navbar + 正确路由 + 基础组件就绪 |
| **依赖** | Step 2（Rust 端可编译） |
| **新建文件** | 11 个前端文件 |
| **修改文件** | `src/App.tsx` / `src/main.tsx` |
| **涉及层** | 前端 |

**具体产出**：

| # | 子步骤 | 产出 | 验证方式 |
|---|--------|------|---------|
| 3.1 | React Router 路由表 | `src/main.tsx`（BrowserRouter） / `src/App.tsx`（Routes + ToastProvider） | 所有路由不 404 |
| 3.2 | Navbar | `src/components/layout/Navbar.tsx`（从 MC-Mod-Hub 复制，改 next/link → react-router-dom Link） | 导航栏显示，点击跳转 |
| 3.3 | 公共组件（4个） | `Loading.tsx` / `Empty.tsx` / `Toast.tsx` / `ToastProvider.tsx`（直接复制） | Toast 可弹出 |
| 3.4 | 占位页（7个） | `src/pages/` 下全部 7 个页面，当前仅显示页面标题 | 每个路由显示正确标题 |

**此步不写业务逻辑**——页面只放 `<h1>页面名称</h1>`，业务逻辑留到后续 Step 逐步填充。

---

#### Step 4 — 首页搜索 + 热门

| 属性 | 内容 |
|------|------|
| **一句话目标** | 首页输入关键词 → 搜索结果卡片展示 → 热门三板块缩略卡 |
| **依赖** | Step 3（前端骨架就绪） |
| **新建文件** | 3 个组件 + 1 个 Rust command |
| **修改文件** | `src/pages/HomePage.tsx` / `src-tauri/src/main.rs` / `src-tauri/src/lib.rs` |
| **涉及层** | 前端 + Rust 端 |

**具体产出**：

| # | 子步骤 | 产出 | 验证方式 |
|---|--------|------|---------|
| 4.1 | SearchBar 组件 | 从 MC-Mod-Hub 复制，直接可用 | 输入关键词有反馈 |
| 4.2 | ResourceCard 组件 | 从 MC-Mod-Hub 复制，改 Link → react-router-dom Link | 卡片展示 CF/MR 结果 |
| 4.3 | search command 接入 | 前端 `invoke('search', { query })` → 渲染卡片列表 | 搜 "sodium" 看到结果 |
| 4.4 | popular command | `src-tauri/src/commands/popular.rs`（调 CF+MR popular → 合并） | cargo check |
| 4.5 | HotSection 组件 | 从 MC-Mod-Hub 复制，改 Link + 数据获取（fetch → invoke） | 首页显示三板块前 6 张卡片 |
| 4.6 | 首页完整布局 | 搜索栏 → 结果卡片 / 热门板块默认展示 | 搜索前后状态切换正常 |

**MVP 完成**：此时可用 `cargo tauri dev` 启动，搜索资源、看到热门内容。搜索链路完整可跑。

---

### Phase 2 — 核心功能

> 目标：完整照搬 MC-Mod-Hub 的资源详情、下载、收藏夹体系。

#### Step 5 — 资源详情 + 单文件下载

| 属性 | 内容 |
|------|------|
| **一句话目标** | 点击卡片 → 查看详情（Header + 版本筛选）→ DownloadButton 下载到本地 |
| **依赖** | Step 4（搜索可用） |
| **新建文件** | 3 个组件 + 2 个 Rust commands |
| **修改文件** | `src/pages/ResourcePage.tsx` / `src-tauri/src/main.rs` / `src-tauri/src/lib.rs` |
| **涉及层** | 前端 + Rust 端 |

**具体产出**：

| # | 子步骤 | 产出 |
|---|--------|------|
| 5.1 | ResourceHeader 组件 | 从 MC-Mod-Hub 复制，改 Link → react-router-dom Link |
| 5.2 | VersionSelector 组件 | 从 MC-Mod-Hub 直接复制（纯 UI） |
| 5.3 | DownloadButton 组件 | 从 MC-Mod-Hub 复制，fetch → `invoke('download_file')` |
| 5.4 | resource command | `src-tauri/src/commands/resource.rs`（get_resource_detail：调 CF/MR 详情+文件列表） |
| 5.5 | download command | `src-tauri/src/commands/download.rs`（reqwest 流式下载 → 保存到用户指定目录） |
| 5.6 | ResourcePage 完整 | 组装 Header + VersionSelector + DownloadButton，路由参数正确 |

---

#### Step 6 — 收藏夹管理 (CRUD)

| 属性 | 内容 |
|------|------|
| **一句话目标** | 收藏夹列表 CURD + 从资源详情 ContextMenu 添加到收藏夹 |
| **依赖** | Step 5（资源详情可用） |
| **新建文件** | 1 个组件 + 1 个 Rust command 模块(7个command) |
| **修改文件** | `src/pages/CollectionsPage.tsx` / `src-tauri/src/main.rs` / `src-tauri/src/lib.rs` |
| **涉及层** | 前端 + Rust 端 |

**具体产出**：

| # | 子步骤 | 产出 |
|---|--------|------|
| 6.1 | collections commands | `src-tauri/src/commands/collections.rs`（全部 7 个 CRUD command） |
| 6.2 | CollectionCard 组件 | 从 MC-Mod-Hub 复制，改 Link |
| 6.3 | ContextMenu 组件 | 从 MC-Mod-Hub 直接复制（createPortal） |
| 6.4 | CollectionsPage 完整 | 列表 + 新建/重命名 Modal + 删除确认 |
| 6.5 | ContextMenu 集成到 ResourceCard | 右键 → "添加到收藏夹" → 弹出选择列表 |

---

#### Step 7 — 收藏夹详情 + 批量下载

| 属性 | 内容 |
|------|------|
| **一句话目标** | 打开收藏夹 → 看到资源列表（可筛选）→ 勾选 → zip/folder 批量下载 |
| **依赖** | Step 6（收藏夹 CRUD 可用） |
| **新建文件** | 1 个组件 + 1 个 Rust command |
| **修改文件** | `src/pages/CollectionDetailPage.tsx` / `src-tauri/src/main.rs` / `src-tauri/src/lib.rs` |
| **涉及层** | 前端 + Rust 端 |

**具体产出**：

| # | 子步骤 | 产出 |
|---|--------|------|
| 7.1 | ItemRow 组件 | 从 MC-Mod-Hub 直接复制（纯展示+勾选） |
| 7.2 | batch_download command | `src-tauri/src/commands/batch_download.rs`（zip 模式 + folder 模式） |
| 7.3 | CollectionDetailPage 完整 | sticky header + 三级筛选(加载器+类型+版本select) + 全选 + sticky 底部栏 |

---

### Phase 3 — 补充 + 发布

> 目标：补齐 MC-Mod-Hub 剩余功能，配置 Tauri 壳，打包发布。

#### Step 8 — 补充功能

| 属性 | 内容 |
|------|------|
| **一句话目标** | 最近浏览 + 更新提醒 + 分类分页 + 兼容性检测全部可用 |
| **依赖** | Step 7（批量下载可用） |
| **新建文件** | 3 个组件 + 3 个 Rust commands |
| **修改文件** | `src/pages/UpdatesPage.tsx` / `src/pages/CategoryPage.tsx` / `CollectionDetailPage.tsx` / `src-tauri/src/main.rs` / `src-tauri/src/lib.rs` |
| **涉及层** | 前端 + Rust 端 |

**具体产出**：

| # | 子步骤 | 产出 |
|---|--------|------|
| 8.1 | RecentlyViewed 组件 | 从 MC-Mod-Hub 复制，改 Link + 数据获取 |
| 8.2 | recently_viewed command | `src-tauri/src/commands/recently_viewed.rs`（get + add 两个 command） |
| 8.3 | UpdateAlerts 组件 | 从 MC-Mod-Hub 复制，改 Link |
| 8.4 | updates command | `src-tauri/src/commands/updates.rs` |
| 8.5 | CategoryPage | 分页(PAGE_SIZE=20) + 页码按钮 + 跳页输入 |
| 8.6 | list command | `src-tauri/src/commands/list.rs`（分页列表） |
| 8.7 | CompatibilityCheck 组件 | 从 MC-Mod-Hub 复制，fetch → invoke('resolve_names') |

---

#### Step 9 — 设置页 + Tauri 壳

| 属性 | 内容 |
|------|------|
| **一句话目标** | API Key 输入 + 下载目录选择 + 偏好设置全部本地持久化 |
| **依赖** | Step 8（补充功能完成） |
| **新建文件** | 1 个 Rust command |
| **修改文件** | `src/pages/SettingsPage.tsx` / `src-tauri/src/main.rs` / `src-tauri/src/lib.rs` / `src-tauri/tauri.conf.json` |
| **涉及层** | 前端 + Rust 端 + Tauri 配置 |

**具体产出**：

| # | 子步骤 | 产出 |
|---|--------|------|
| 9.1 | settings command | `src-tauri/src/commands/settings.rs`（get_settings + save_settings：读写 settings.json） |
| 9.2 | game_versions command | `src-tauri/src/commands/settings.rs` 内 get_game_versions（调外部 + FALLBACK） |
| 9.3 | SettingsPage 完整 | API Key(password输入) + 下载目录 + 偏好的复选框 |
| 9.4 | Tauri 窗口配置 | `tauri.conf.json` 完善：1280x800 + minWidth/minHeight + CSP |
| 9.5 | Tauri 原生对话框 | 下载目录选择用 Tauri dialog |
| 9.6 | API Key 正式流转 | 设置页输入 → Rust 写 settings.json → 后续 CF 请求从文件读取（移除 Step 2 的硬编码） |

---

#### Step 10 — 打包发布

| 属性 | 内容 |
|------|------|
| **一句话目标** | `npm run tauri build` 生成 .msi/.exe，推 tag 后 GitHub Actions 自动发布 |
| **依赖** | Step 9（全部功能完成） |
| **新建文件** | `.github/workflows/release.yml` + 可能 `icons/` 目录 |
| **修改文件** | `src-tauri/tauri.conf.json`（bundler 配置） / `package.json`（scripts） |
| **涉及层** | 打包配置 |

**具体产出**：

| # | 子步骤 | 产出 |
|---|--------|------|
| 10.1 | Tauri bundler 配置 | `tauri.conf.json` 中 `bundle.targets: ["msi","nsis"]` + icon |
| 10.2 | package.json scripts | `"build": "tsc && vite build"` + `"tauri:build": "tauri build"` |
| 10.3 | GitHub Actions | `.github/workflows/release.yml`（windows-latest + checkout → install → tauri build → upload release） |
| 10.4 | 本地打包验证 | `npm run tauri build` → 生成 .msi |
| 10.5 | git tag 推送 | `git tag v0.1.0 && git push origin v0.1.0` → CI 自动构建发布 |

---

### 步骤依赖图

```
Step 1 ──→ Step 2 ──→ Step 3 ──→ Step 4 ──→ Step 5 ──→ Step 6 ──→ Step 7 ──→ Step 8 ──→ Step 9 ──→ Step 10
 骨架     Rust 层   前端骨架   搜索+热门   详情+下载   收藏CRUD   批量下载   补充功能   设置+Tauri   打包发布
```

**规则**：
- **严格顺序执行**——不允许跳步
- **每步独立可验证**——跑通验证标准才算完成
- **每步结束后代码可运行**——不累积到后面再修

---

## 11. 核心判断

### 为什么选 Tauri 而不是继续 Electron

1. **启动速度**：Electron 需启动 Chromium 实例，6-10 秒 → Tauri 用系统 WebView2，< 2 秒
2. **内存**：Electron 内置 Chromium，150-300MB → Tauri 复用系统 WebView2，< 80MB
3. **打包体积**：Electron 含 Chromium，~150MB → Tauri 不含浏览器，< 15MB
4. **性能**：Rust 端直接调外部 API + SQLite，砍掉 JS 中间层
5. **开发体验**：Rust 编译一次，类型安全；Tauri command 比 Next.js API Route 更直观

### 预计最大挑战

1. **Rust 编译门槛**：Windows 上需安装 Visual Studio Build Tools + WebView2。解决：文档提供完整步骤
2. **sql.js → rusqlite 迁移**：sql.js API 和 rusqlite API 差异大。解决：重新实现但逻辑照搬，3 张表结构不变
3. **下载方案重构**：原版 blob+createObjectURL 不能在 Tauri 直接用。解决：全部下载逻辑移到 Rust 端，前端只管调 invoke
4. **18 个组件复制后适配**：next/link、useRouter 等 Next.js API 需替换。解决：用 react-router-dom 等价 API，改动集中在一行
5. **Tauri Windows 构建**：CI 环境需 WebView2。解决：windows-latest runner 已预装 WebView2

---

## 12. 应急方案 — 如何在开发中插入新功能

### 12.1 核心原则

> **插入功能就像在运行中的火车上加一节车厢——必须在正确的"挂接点"接入，不影响前后车厢。**

新功能开发遵循三个原则：
- **最小影响面**：新增代码不改动已有代码
- **正确挂接点**：Rust command ↔ 前端页面，两个挂接点互不污染
- **独立可测**：新功能可在不影响现有功能的情况下单独验证

### 12.2 功能分级与插入策略

| 功能类型 | 定义 | 插入时机 | 示例 |
|----------|------|---------|------|
| **A 级：纯前端 UI** | 不需要新 Rust command，仅前端展示/交互 | 任意 Step 后 | 深色/浅色主题切换、收藏夹排序选项 |
| **B 级：读操作** | 需新 Rust command（只读现有数据/API） | **Step 2 之后**（Rust 端结构已定） | 按下载量排序、按更新时间筛选 |
| **C 级：写操作** | 需新 Rust command（写入数据库/文件） | **Step 2 之后**（db.rs 可用） | 导出收藏夹为 JSON、导入旧数据 |
| **D 级：新外部 API** | 需对接新的第三方平台 | **Step 2 之后** | 增加 Forge、Planet Minecraft 等平台 |
| **E 级：架构变更** | 改数据库表结构、改 types、改 AppState | **仅在 Step 10 完成后或 Phase 间隙** | 新增"标签"表、改下载并发数 |

### 12.3 挂接点地图

以下是开发过程中安全的"挂接点"——在这些位置加代码不会破坏现有功能：

```
┌─────────────────────────────────────────────────────┐
│  前端挂接点                                         │
├──────────────┬──────────────────────────────────────┤
│  src/pages/  │  新增页面组件，在 App.tsx 加 Route    │
│  components/ │  新增子目录 + 组件文件，不改现有组件   │
│  lib/        │  新增工具函数文件，不改现有文件        │
│  types/      │  在 index.ts 末尾追加 interface        │
│  App.tsx     │  <Routes> 内加 <Route>，不改现有路由   │
├──────────────┴──────────────────────────────────────┤
│  Rust 端挂接点                                      │
├──────────────┬──────────────────────────────────────┤
│  commands/   │  新增 xxx.rs → mod.rs 加 mod →       │
│              │  main.rs 加注册行                     │
│  curseforge/ │  在 curseforge.rs 末尾加新 fn         │
│  modrinth/   │  在 modrinth.rs 末尾加新 fn           │
│  db.rs       │  在末尾加新查询函数                    │
│  types.rs    │  在末尾加新 struct                     │
│  main.rs     │  仅加 command 注册行，不改 AppState    │
└──────────────┴──────────────────────────────────────┘
```

### 12.4 新功能开发 SOP（标准操作流程）

当需要插入新功能时，按下述流程执行：

```
第 1 步：分级
  ├→ 确定功能类型（A/B/C/D/E）
  │
第 2 步：判断时机
  ├→ A 级：随时可做
  ├→ B/C/D 级：当前 Step 编号 ≥ 2 即可
  └→ E 级：当前 Step 编号 ≥ 10 才可
  │
第 3 步：确定挂接点
  ├→ 需要新 Rust command？→ commands/ 下新建文件
  ├→ 需要新前端页面？→ pages/ 下新建文件 + App.tsx 加 Route
  ├→ 需要新组件？→ components/ 下新建文件
  │
第 4 步：独立开发
  ├→ 不修改已有文件（除了 mod.rs、main.rs、App.tsx 的注册行）
  ├→ 不删除已有代码
  ├→ 不改已有数据库表结构（可新增表）
  │
第 5 步：插入验证
  ├→ cargo check（Rust 端编译通过）
  ├→ 前端编译通过
  ├→ 新功能独立工作
  └→ 旧功能不受影响（回归测试：搜索、下载、收藏、设置各点一遍）
```

### 12.5 数据库扩展示例

如需新增一张表（例如 `tags`），**不修改** 3 张现有表的 CREATE 语句，而是在 `db.rs` 的 `init_tables()` 末尾追加：

```rust
// 新表 — 不影响 collections / collection_items / recently_viewed
conn.execute(
    "CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        resource_id TEXT NOT NULL,
        tag TEXT NOT NULL
    )",
    [],
)?;
```

### 12.6 新平台API接入示例

如需接入第三方平台（例如 Planet Minecraft），继承现有模式：

```
1. 新建 src-tauri/src/planetminecraft.rs
   └→ pub async fn search_pm(query: &str, limit: u32) -> Vec<ResourceItem>
   └→ 用 reqwest，返回统一 ResourceItem 结构

2. 在 merger.rs 的 merge_results() 增加一个输入参数
   └→ 不破坏已有去重逻辑，仅增加一组合并来源

3. 在 commands/search.rs 增加一个 tokio::spawn 调用
   └→ 原 CF+MR 调用不改

4. 前端 ResourceCard 不需修改
   └→ ResourceItem.source 字段增加新值 "planetminecraft"
```

### 12.7 不能在 Step 中途做的事

| 禁区 | 原因 |
|------|------|
| **修改数据库表结构**（删字段/改类型） | 已有命令依赖现有结构，改一个全崩 |
| **替换技术栈**（换 Vue/Next.js/其他框架） | 推翻全部工作 |
| **引入组件库**（shadcn/ui / MUI 等） | 与手写组件体系冲突 |
| **改 CSS 色板** | `tailwind.config.ts` 在 Step 1 定稿，后续全项目引用 |
| **改 types/index.ts 已有 interface** | 所有命令和组件依赖类型 |
| **修改 main.rs AppState 结构** | 所有命令依赖 AppState |
| **在 Step 2 之前插入 C/D/E 级功能** | Rust 端未建立，没有挂接点 |
| **在 Step 4 之前插入复杂前端功能** | SearchBar 链路未跑通，无从调试 |

### 12.8 新功能开发在 4 份文档中的体现

任何新功能开发前，**必须同步更新以下 4 份文档**：

| 文档 | 更新内容 | 位置 |
|------|---------|------|
| `migration-plan.md` | 新功能插入时间点 + 挂接点说明 | 本节 12.2~12.7 的对应条目 |
| `technical-design.md` | 新功能的技术方案 + 新文件路径 + Rust struct | 对应章节末尾追加 |
| `AGENTS.md` | 新功能开发约束 + 禁止行为补充 | 对应章节末尾追加 |
| `prompt.md` | **当前对话的 prompt 文件**：明确新功能需求 + 插入条件 | 每次开新对话时写一份新的 |

**prompt 模板**（插入新功能时使用）：

```markdown
# 开发执行 Prompt — 新功能插入 [功能名称]

> 当前进度：[当前 Step N 已完成]，插入点为 [挂接点路径]
> 插入类型：[A/B/C/D/E] 级
> 受影响文档：[列出需更新的文档]

## 功能描述
[具体需求]

## 技术方案
- Rust 端：[新增/不改/改哪些文件]
- 前端：[新增/不改/改哪些文件]

## 约束
- 不修改已有 [列出不可改的文件]
- 仅追加 [列出可追加位置]
- 数据库：[是否涉及，如是→只新增表不改已有表]

## 验证
- 新功能如何测试
- 旧功能回归项：[搜索/下载/收藏/设置]
```
