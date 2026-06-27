# MC Mod Hub 轻量化版

Minecraft Mod/光影/资源包桌面管理工具。从 CurseForge 和 Modrinth 搜索、管理收藏夹、批量下载。

**Tauri + React SPA** — 启动快、内存低、包体小。

## 特性

- 🔍 **双平台搜索** — CurseForge + Modrinth 并发搜索，去重合并
- 📁 **收藏夹管理** — 创建/重命名/删除收藏夹，右键添加资源
- ✅ **兼容性检测** — 游戏版本 + Mod 加载器交集分析
- 📦 **批量下载** — ZIP 打包 / 文件夹，进度推送
- 📤 **清单导出/导入** — JSON 格式（`name` + `loader`），跨设备迁移

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面框架 | [Tauri 2](https://tauri.app) |
| 前端 | React 18 + TypeScript + Vite 5 |
| 样式 | Tailwind CSS 3 — Minecraft 暗色主题 |
| 路由 | react-router-dom v6 |
| 数据库 | SQLite（rusqlite bundled） |
| HTTP | reqwest（Rust 端直调 API） |
| 打包 | Tauri Bundler → `.msi` / `.exe` |

## 快速开始

### 前置要求

- [Node.js](https://nodejs.org) ≥ 20
- [Rust](https://rustup.rs) stable
- Windows: [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/)（含 C++ workload）

### 开发

```bash
npm install
npm run tauri dev
```

### 构建

```bash
npm run tauri build
```

产物在 `src-tauri/target/release/bundle/`。

## 项目结构

```
mc-mod-hub-light/
├── src/                          # 前端
│   ├── pages/                    # 7 个页面
│   ├── components/
│   │   ├── home/                 # SearchBar, HotSection, ResourceCard, ContextMenu...
│   │   ├── resource/             # ResourceHeader, VersionSelector, DownloadButton
│   │   ├── collection/           # CollectionCard, ItemRow, CompatibilityCheck
│   │   ├── layout/               # Navbar
│   │   └── common/               # Loading, Empty, Toast
│   ├── types/                    # TypeScript 接口
│   └── lib/                      # 工具函数
├── src-tauri/                    # Rust 后端
│   └── src/
│       ├── commands/             # 11 个 Tauri command 模块
│       ├── curseforge.rs         # CurseForge API 客户端
│       ├── modrinth.rs           # Modrinth API 客户端
│       ├── merger.rs             # 合并去重
│       ├── db.rs                 # SQLite 数据库
│       └── types.rs              # Rust 数据结构
├── prompts/                      # 开发 prompt 归档
└── AGENTS.md                     # 开发规范
```

## 配置

首次启动后，在设置页填入 CurseForge API Key（从 [CurseForge Developer Console](https://console.curseforge.com) 获取）。Modrinth 无需 Key。

设置文件保存在 `%APPDATA%/com.mcmodhub.light/settings.json`。

## 许可

MIT
