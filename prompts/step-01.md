# 开发执行 Prompt — MC Mod Hub 轻量化版 Phase 1·Step 1

> 具体产品需求请参考 `D:\vibe coding\projects\MC-Mod-Hub\requirements.md`，技术方案参考本目录 `technical-design.md`，迁移方案参考本目录 `migration-plan.md`，开发规则参考本目录 `AGENTS.md`。

---

## 项目背景

MC Mod Hub 轻量化版是从现有 **MC Mod Hub**（Electron + Next.js 14）迁移而来的 Tauri + React SPA 桌面应用。

- **来源**：`D:\vibe coding\projects\MC-Mod-Hub`（功能完整，所有代码可直接参考）
- **目标**：照搬全部功能，但用 Tauri 替代 Electron，Vite + React SPA 替代 Next.js
- **为什么迁移**：Electron 版本启动慢（6-10秒）、内存高（150-300MB）、打包大（150MB）

## 第一阶段目标

**搭骨架 — Vite + React SPA 项目初始化 + 打通第一条搜索链路**

具体产出：
1. Tauri + Vite + React + TypeScript 项目初始化完成，`cargo tauri dev` 能启动
2. Tailwind CSS 配置好（从 MC-Mod-Hub 复制色板）
3. 前端 type 定义复制到位
4. Rust 端：CurseForge API 客户端 + Modrinth API 客户端 + 合并去重逻辑
5. Rust 端：第一个 Tauri command `search` 可调通
6. 前端：搜索栏组件 + 资源卡片组件
7. 端到端验证：输入关键词 → 前端 `invoke('search', { query })` → Rust 调 CF+MR API → 返回 `Vec<ResourceItem>` → 前端渲染卡片

> ⚠️ **第一步只做搜索链路**。不做热门板块、不做收藏夹、不做下载、不做设置。只做：输入关键词 → 看到搜索结果卡片。

---

## 需要创建的文件

### Rust 端

```
src-tauri/Cargo.toml                    — 依赖：tauri, reqwest, serde, serde_json, tokio
src-tauri/tauri.conf.json               — Tauri 窗口配置
src-tauri/build.rs                      — Tauri 构建脚本
src-tauri/src/main.rs                   — Tauri 入口 + AppState + command 注册
src-tauri/src/lib.rs                    — 模块声明
src-tauri/src/types.rs                  — Rust 数据结构（对应前端 types）
src-tauri/src/curseforge.rs             — CurseForge API 客户端（reqwest）
src-tauri/src/modrinth.rs               — Modrinth API 客户端（reqwest）
src-tauri/src/merger.rs                 — 合并去重
src-tauri/src/commands/mod.rs           — 模块声明
src-tauri/src/commands/search.rs        — search command
```

### 前端

```
package.json                            — Vite + React + Tailwind + @tauri-apps/api
vite.config.ts                          — Vite 配置
tsconfig.json                           — TypeScript 严格模式
tsconfig.node.json                      — Vite Node 端 TS 配置
tailwind.config.ts                      — 从 MC-Mod-Hub 复制
postcss.config.js                       — PostCSS + tailwindcss + autoprefixer
index.html                              — Vite SPA 入口
src/main.tsx                            — React 入口
src/App.tsx                             — 路由 + ToastProvider（本步只配 / 路由）
src/globals.css                         — 从 MC-Mod-Hub 复制
src/vite-env.d.ts                       — Vite 类型声明
src/types/index.ts                      — 从 MC-Mod-Hub 复制
src/lib/tauri.ts                        — invoke 封装
src/lib/format.ts                       — 从 MC-Mod-Hub 复制
src/components/home/SearchBar.tsx       — 搜索栏（从 MC-Mod-Hub 复制）
src/components/home/ResourceCard.tsx    — 资源卡片（从 MC-Mod-Hub 复制，适配路由）
src/components/common/Loading.tsx       — 加载状态（从 MC-Mod-Hub 复制）
src/components/common/Toast.tsx         — 消息提示（从 MC-Mod-Hub 复制）
src/components/common/ToastProvider.tsx — Toast Provider（从 MC-Mod-Hub 复制）
src/pages/HomePage.tsx                  — 首页（仅搜索功能，本步不做热门板块）
```

### 配置文件

```
.gitignore                              — node_modules/ src-tauri/target/ data/
```

---

## 开发步骤

### Step 1.1 — 创建 Tauri + Vite 项目

```bash
# 用 Tauri CLI 创建项目（或手动创建）
npm create tauri-app@latest mc-mod-hub-light -- --template react-ts
# 选择：Vite + React + TypeScript
```

如果手动创建，参考以下 package.json 结构：

```json
{
  "name": "mc-mod-hub-light",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.28.0",
    "@tauri-apps/api": "^2.0.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0"
  }
}
```

### Step 1.2 — 配置 Tailwind CSS

从 `D:\vibe coding\projects\MC-Mod-Hub\tailwind.config.ts` **直接复制**，仅改 content 路径：

```ts
content: ['./src/**/*.{ts,tsx}'],
```

复制 `globals.css`：
从 `D:\vibe coding\projects\MC-Mod-Hub\src\app\globals.css` **直接复制**到 `src/globals.css`。

### Step 1.3 — 复制前端类型和工具

- `src/types/index.ts` ← `D:\vibe coding\projects\MC-Mod-Hub\src\types\index.ts`（直接复制）
- `src/lib/format.ts` ← `D:\vibe coding\projects\MC-Mod-Hub\src\lib\format.ts`（直接复制）
- `src/lib/tauri.ts`（新建，invoke 封装）：

```typescript
import { invoke } from '@tauri-apps/api/tauri';

// 统一封装 invoke，加类型安全
export async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(command, args);
}
```

### Step 1.4 — Rust 端：类型定义

`src-tauri/src/types.rs` — 与前端 `types/index.ts` 对等：

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceItem {
    pub id: String,
    pub source: String,
    #[serde(rename = "type")]
    pub resource_type: String,
    pub name: String,
    pub summary: String,
    pub icon_url: Option<String>,
    pub download_count: u64,
    pub author: String,
    pub categories: Vec<String>,
    pub game_versions: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}
```

### Step 1.5 — Rust 端：CurseForge API 客户端

`src-tauri/src/curseforge.rs` — 照搬 `D:\vibe coding\projects\MC-Mod-Hub\src\lib\curseforge.ts` 的 JS 逻辑到 Rust：

```rust
use reqwest::Client;
use serde::Deserialize;
use crate::types::ResourceItem;

const API_BASE: &str = "https://api.curseforge.com";
const GAME_ID: u32 = 432;

// CfMod, CfSearchResponse, CfLogo 等内部结构体...

pub async fn search_mods(
    client: &Client,
    api_key: &str,
    query: &str,
    limit: u32,
) -> Result<Vec<ResourceItem>, String> {
    let url = format!("{}/v1/mods/search", API_BASE);
    let resp = client
        .get(&url)
        .header("x-api-key", api_key)
        .query(&[
            ("gameId", GAME_ID.to_string()),
            ("searchFilter", query.to_string()),
            ("sortBy", "6".to_string()),
            ("sortOrder", "desc".to_string()),
            ("pageSize", limit.to_string()),
        ])
        .send()
        .await
        .map_err(|e| format!("CurseForge 请求失败: {}", e))?;

    // 解析 JSON → map CfMod → ResourceItem
    // ... (to_resource_item 逻辑照搬 JS 版 mapClassToType + toResourceItem)
    todo!("实现 search_mods")
}
```

关键：把 JS 的 `fetchPopular`、`searchMods` 等函数逐一映射为 Rust async fn。每个函数的 query 参数、header、解析逻辑照搬。

### Step 1.6 — Rust 端：Modrinth API 客户端

`src-tauri/src/modrinth.rs` — 照搬 `D:\vibe coding\projects\MC-Mod-Hub\src\lib\modrinth.ts`：

- `search_projects(query, limit)` → GET `/v2/search`
- `fetch_popular(type, limit)` → GET `/v2/search` + facets
- `to_resource_item` 逻辑照搬

Modrinth 无需 API Key，直接 reqwest。

### Step 1.7 — Rust 端：合并去重

`src-tauri/src/merger.rs` — 照搬 `D:\vibe coding\projects\MC-Mod-Hub\src\lib\merger.ts`：

```rust
pub fn merge_results(cf: &[ResourceItem], mr: &[ResourceItem]) -> Vec<ResourceItem> {
    // 合并 → 按 downloadCount 降序 → source-id 去重
}
```

### Step 1.8 — Rust 端：search command

`src-tauri/src/commands/search.rs`：

```rust
use tauri::State;
use crate::AppState;

#[tauri::command]
pub async fn search(
    query: String,
    state: State<'_, AppState>,
) -> Result<Vec<crate::types::ResourceItem>, String> {
    let api_key = {
        let settings = state.settings.lock().unwrap();
        settings.curseforge_api_key.clone()
    };

    let (cf, mr) = tokio::join!(
        crate::curseforge::search_mods(&state.http_client, &api_key, &query, 16),
        crate::modrinth::search_projects(&state.http_client, &query, 16),
    );

    let cf_results = cf.unwrap_or_default();
    let mr_results = mr.unwrap_or_default();

    Ok(crate::merger::merge_results(&cf_results, &mr_results))
}
```

### Step 1.9 — Rust 端：main.rs + AppState

```rust
// src-tauri/src/main.rs
mod commands;
mod curseforge;
mod modrinth;
mod merger;
mod types;

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
}

fn main() {
    let app_state = AppState {
        http_client: reqwest::Client::new(),
        settings: Mutex::new(Settings::default()),
    };

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::search::search,
        ])
        .run(tauri::generate_context!())
        .expect("启动 Tauri 失败");
}
```

### Step 1.10 — Tauri 配置

`src-tauri/tauri.conf.json`：

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
    ],
    "security": {
      "csp": "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'"
    }
  }
}
```

### Step 1.11 — Cargo.toml

```toml
[package]
name = "mc-mod-hub-light"
version = "0.1.0"
edition = "2021"

[dependencies]
tauri = { version = "2", features = [] }
tauri-build = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
reqwest = { version = "0.11", features = ["json"] }
tokio = { version = "1", features = ["full"] }

[build-dependencies]
tauri-build = { version = "2", features = [] }
```

### Step 1.12 — 前端组件：复制 + 适配

**从 MC-Mod-Hub 直接复制**（不改代码）：
- `src/components/common/Loading.tsx`
- `src/components/common/Toast.tsx`
- `src/components/common/ToastProvider.tsx`

**从 MC-Mod-Hub 复制，仅改路由 API**：
- `src/components/home/SearchBar.tsx` — 不改动（纯 UI）
- `src/components/home/ResourceCard.tsx` — 改 `next/link` → `react-router-dom Link`

### Step 1.13 — 首页

`src/pages/HomePage.tsx` — 当前版本只做搜索：

```tsx
import { useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import type { ResourceItem } from '@/types';
import SearchBar from '@/components/home/SearchBar';
import ResourceCard from '@/components/home/ResourceCard';
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

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="mb-10 pt-4">
        <SearchBar onSearch={handleSearch} />
      </div>

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
      ) : results && results.length === 0 ? (
        <div className="text-center py-16 text-mc-muted text-sm">
          未找到相关资源
        </div>
      ) : null}
    </div>
  );
}
```

### Step 1.14 — React 入口 + 路由

`src/main.tsx`：
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
```

`src/App.tsx`：
```tsx
import { Routes, Route } from 'react-router-dom';
import { ToastProvider } from '@/components/common/ToastProvider';
import HomePage from '@/pages/HomePage';

export default function App() {
  return (
    <ToastProvider>
      <div className="min-h-screen bg-mc-bg text-mc-text">
        <Routes>
          <Route path="/" element={<HomePage />} />
        </Routes>
      </div>
    </ToastProvider>
  );
}
```

---

## API Key 临时处理

当前 Step 1 先**硬编码** API Key 在 Rust 端 Settings 默认值中：

```rust
// main.rs — 临时方案
let mut settings = Settings::default();
settings.curseforge_api_key = "$2a$10$YOUR_KEY_HERE".to_string();
```

> Step 9 会改为从 `settings.json` 文件读取 + 设置页 UI。

## Cargo.toml reqwest 注意事项

reqwest 在 Windows 上需要 TLS 后端。推荐用 `native-tls`：

```toml
reqwest = { version = "0.11", features = ["json", "native-tls"] }
```

## 验证步骤

```bash
# 1. Rust 编译检查
cd src-tauri
cargo check

# 2. 前端启动
npm run dev
# Vite 在 http://localhost:1420

# 3. Tauri 完整启动
npm run tauri dev
# 出现窗口，输入搜索关键词 "sodium"
# 看到来自 CurseForge + Modrinth 的搜索结果卡片
```

## 约束条件

- 不做需求分析——照搬 MC-Mod-Hub 的 `requirements.md`
- 不做热门板块、收藏夹、下载——只做搜索链路
- UI 风格 100% 照搬 MC-Mod-Hub：直接复制 tailwind.config.ts + globals.css
- 组件从 MC-Mod-Hub 直接复制，仅改路由 API（`next/link` → `react-router-dom Link`）
- 不引入 shadcn/ui 或任何组件库——用 MC-Mod-Hub 已有的手写组件
- Rust 端逻辑照搬 JS 版 lib/ 文件

## 完成后

完成后告诉我：
1. `cargo check` 是否通过
2. `npm run tauri dev` 能否启动窗口
3. 输入关键词搜索是否有结果卡片显示
4. 实际执行中做了什么与计划不同的改动

---

## 应急方案说明

> 如果在开发过程中需要插入新功能，请先阅读 `migration-plan.md` 第 12 节的完整应急方案，然后在我为你生成的新对话中写明：
> - 当前进度（哪个 Step 已完成）
> - 新功能类型（A/B/C/D/E 级）
> - 需要改的挂接点
> - 受影响需同步更新的文档

**本对话只做 Step 1 的项目初始化，不做任何其他功能。**
