# 开发执行 Prompt — MC Mod Hub 轻量化版 Step 4

> 具体产品需求请参考 `D:\vibe coding\projects\MC-Mod-Hub\requirements.md`，技术方案参考本目录 `technical-design.md`，迁移方案参考本目录 `migration-plan.md`，开发规则参考本目录 `AGENTS.md`。

---

## 项目背景

MC Mod Hub 轻量化版，基于 Tauri + Vite + React SPA。

- Step 1：项目骨架 + 搜索链路（SearchBar / ResourceCard / search command）
- Step 2：数据库层（SQLite 3 张表）+ Navbar + Empty + 7 个占位页
- Step 3：首页完成（HotSection / popular command / ContextMenu / 搜索热门切换）
- **当前**：右键卡片「查看详情」跳转到占位页，资源详情页只是一行标题文字

## 第四步目标

**资源详情页完整实现 + 单文件下载到本地。**

具体产出：
1. Rust 端：扩展 `curseforge.rs` — 加 `get_mod_detail` / `get_mod_files` / `get_mod_file_download_url`
2. Rust 端：扩展 `modrinth.rs` — 加 `get_project_detail` / `get_project_versions` / `get_version_download_url`
3. Rust 端：`resource` command — 根据 source+id 调 CF 或 MR 获取详情 + 文件列表
4. Rust 端：`download` command — reqwest 流式下载，写入用户指定目录，返回进度
5. 前端：`ResourceHeader` 组件 — 图标 + 名称 + 作者 + 下载量 + 描述
6. 前端：`VersionSelector` 组件 — 游戏版本筛选 chips + 文件列表
7. 前端：`DownloadButton` 组件 — 调 `invoke('download_file')`，显示下载进度 Toast
8. `ResourcePage` 完整组装 → 从卡片「查看详情」→ 看到完整资源页 → 选择版本 → 点下载 → 文件落盘

> Step 4 完成后，**资源详情页 + 单文件下载** 这条核心链路就跑通了。这是 MVP 的第二条完整链路（第一条是搜索）。

---

## 需要创建/修改的文件

### 新建文件

```
src-tauri/src/commands/resource.rs     — resource command（CF/MR 详情+文件列表）
src-tauri/src/commands/download.rs     — download command（流式下载到本地）
src/components/resource/ResourceHeader.tsx  — 资源头部（图标/名称/作者/下载量/描述）
src/components/resource/VersionSelector.tsx — 版本筛选 + 文件列表
src/components/resource/DownloadButton.tsx  — 下载按钮（invoke download → 进度 Toast）
```

### 修改文件

```
src-tauri/src/curseforge.rs            — 加 get_mod_detail / get_mod_files / get_mod_file_download_url
src-tauri/src/modrinth.rs              — 加 get_project_detail / get_project_versions / get_version_download_url
src-tauri/src/types.rs                 — 加 ModDetail / ModFile / DownloadProgress 等 struct
src-tauri/src/commands/mod.rs          — 加 pub mod resource + pub mod download
src-tauri/src/lib.rs                   — 注册 resource + download command（invoke_handler + setup）
src/pages/ResourcePage.tsx             — 替换占位内容为完整实现
src/types/index.ts                     — 加前端对等类型（ModDetail / ModFile / DownloadProgress）
```

---

## 开发步骤

### Step 4.1 — Rust 端：扩展类型定义

`src-tauri/src/types.rs` — 在现有 `ResourceItem` 基础上，新增详情和文件类型：

```rust
/// 资源详情（含完整描述和文件列表）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceDetail {
    pub id: String,
    pub source: String,
    #[serde(rename = "type")]
    pub resource_type: String,
    pub name: String,
    pub summary: String,
    pub description: String,           // 完整 HTML/Markdown 描述
    pub icon_url: Option<String>,
    pub download_count: u64,
    pub author: String,
    pub categories: Vec<String>,
    pub game_versions: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    pub files: Vec<ModFile>,
    pub url: Option<String>,           // 在平台上查看的链接
}

/// 模组文件/版本
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModFile {
    pub id: String,
    pub file_name: String,
    pub display_name: String,
    pub game_versions: Vec<String>,
    pub mod_loaders: Vec<String>,      // Forge / Fabric / NeoForge / Quilt
    pub release_type: String,          // release / beta / alpha
    pub file_size: u64,
    pub download_url: Option<String>,  // 实际下载地址（通过 getModFileDownloadUrl 获取）
    pub download_count: u64,
    pub created_at: String,
}

/// 下载进度（通过 Tauri event 推送）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub file_id: String,
    pub file_name: String,
    pub downloaded: u64,
    pub total: u64,
    pub finished: bool,
    pub error: Option<String>,
}
```

### Step 4.2 — Rust 端：扩展 CurseForge 客户端

`src-tauri/src/curseforge.rs` — 在现有 `search_mods` 基础上新增：

```rust
/// 获取模组详情
/// GET /v1/mods/{mod_id}
pub async fn get_mod_detail(
    client: &Client,
    api_key: &str,
    mod_id: u32,
) -> Result<ResourceDetail, String> {
    // 返回数据包含: name, summary, description(HTML), logo, authors, categories,
    //   downloadCount, dateCreated, dateModified, links(websiteUrl), latestFiles
    todo!("实现 get_mod_detail")
}

/// 获取模组文件列表
/// GET /v1/mods/{mod_id}/files?pageSize=50
pub async fn get_mod_files(
    client: &Client,
    api_key: &str,
    mod_id: u32,
) -> Result<Vec<ModFile>, String> {
    // 返回文件列表，每个文件含: id, fileName, displayName, gameVersions,
    //   releaseType(1=release/2=beta/3=alpha), fileLength, downloadCount, fileDate
    // 注意: downloadUrl 不在这里，要通过 get_mod_file_download_url 获取
    todo!("实现 get_mod_files")
}

/// 获取文件下载地址
/// POST /v1/mods/{mod_id}/files/{file_id}/download-url
pub async fn get_mod_file_download_url(
    client: &Client,
    api_key: &str,
    mod_id: u32,
    file_id: u32,
) -> Result<String, String> {
    // 返回 { data: "https://..." }，拿 data 字段即下载 URL
    todo!("实现 get_mod_file_download_url")
}
```

**照搬规则**：打开 MC-Mod-Hub `src/lib/curseforge.ts`，找到对应 JS 函数，逐行翻译为 Rust。URL、query 参数、header、响应结构完全不变。

CurseForge API 关键映射：
- `releaseType`: 1 = Release, 2 = Beta, 3 = Alpha
- `modLoaders`: CF 的 `gameVersionTypeIds` 或文件名推断（forge/fabric/neoforge/quilt）
- `description`: CF 返回 HTML，保留原样传给前端渲染

### Step 4.3 — Rust 端：扩展 Modrinth 客户端

`src-tauri/src/modrinth.rs` — 在现有 `search_projects` 基础上新增：

```rust
/// 获取项目详情
/// GET /v2/project/{id}
pub async fn get_project_detail(
    client: &Client,
    project_id: &str,
) -> Result<ResourceDetail, String> {
    // Modrinth 返回: title, description, body(Markdown), icon_url, downloads,
    //   team(作者), categories, versions(版本ID列表), created/updated
    todo!("实现 get_project_detail")
}

/// 获取项目版本列表
/// GET /v2/project/{id}/version?loaders=["fabric","forge","neoforge","quilt"]
pub async fn get_project_versions(
    client: &Client,
    project_id: &str,
    game_versions: &[String],
) -> Result<Vec<ModFile>, String> {
    // 返回版本列表，每个版本含: id, name, version_number, game_versions,
    //   loaders, version_type(release/beta/alpha), files[{url, filename, size}]
    // download_url 直接从 files[0].url 取（Modrinth 直接返回下载 URL）
    todo!("实现 get_project_versions")
}

/// Modrinth 的下载 URL 直接从版本 files[0].url 获取，无需额外 API 调用
/// 在 get_project_versions 中已经把 url 填入 ModFile.download_url
```

Modrinth API 关键点：
- **无需 API Key**，直接 reqwest
- `version_type`: `release` / `beta` / `alpha`（与 CF 的 releaseType 对齐）
- `loaders`: Modrinth 原生支持，直接取
- `files[0].url`: 可直接下载，无需额外获取 download-url
- `body`: Markdown 格式，与 CF 的 HTML description 不同，前端渲染时注意

### Step 4.4 — Rust 端：resource command

`src-tauri/src/commands/resource.rs`：

```rust
use tauri::State;
use crate::AppState;
use crate::types::{ResourceDetail, ModFile};

#[tauri::command]
pub async fn get_resource_detail(
    source: String,
    id: String,
    state: State<'_, AppState>,
) -> Result<ResourceDetail, String> {
    let api_key = {
        let settings = state.settings.lock().unwrap();
        settings.curseforge_api_key.clone()
    };

    match source.as_str() {
        "curseforge" => {
            let mod_id: u32 = id.parse().map_err(|_| "无效的 CurseForge ID".to_string())?;
            let (detail, files) = tokio::join!(
                crate::curseforge::get_mod_detail(&state.http_client, &api_key, mod_id),
                crate::curseforge::get_mod_files(&state.http_client, &api_key, mod_id),
            );
            let mut detail = detail?;
            detail.files = files.unwrap_or_default();
            Ok(detail)
        }
        "modrinth" => {
            let (detail, files) = tokio::join!(
                crate::modrinth::get_project_detail(&state.http_client, &id),
                crate::modrinth::get_project_versions(&state.http_client, &id, &[]),
            );
            let mut detail = detail?;
            detail.files = files.unwrap_or_default();
            Ok(detail)
        }
        _ => Err(format!("未知来源: {}", source)),
    }
}
```

> 设计决策：`get_resource_detail` 同时返回详情和文件列表，前端一次 `invoke` 拿到全部数据，避免两次往返。

### Step 4.5 — Rust 端：download command

`src-tauri/src/commands/download.rs`：

```rust
use tauri::{command, State, AppHandle, Emitter};
use crate::AppState;
use crate::types::DownloadProgress;

#[command]
pub async fn download_file(
    app: AppHandle,
    state: State<'_, AppState>,
    source: String,
    mod_id: String,
    file_id: String,
    file_name: String,
) -> Result<String, String> {
    // 1. 获取下载目录（从 settings 或默认 Downloads/mc-mod-hub）
    let download_dir = {
        let settings = state.settings.lock().unwrap();
        if settings.default_download_dir.is_empty() {
            // 默认：用户 Downloads 目录下的 mc-mod-hub 子目录
            dirs_next::download_dir()
                .unwrap_or_else(|| std::path::PathBuf::from("."))
                .join("mc-mod-hub")
        } else {
            std::path::PathBuf::from(&settings.default_download_dir)
        }
    };
    std::fs::create_dir_all(&download_dir).map_err(|e| format!("创建目录失败: {}", e))?;

    // 2. 获取实际下载 URL
    let api_key = {
        let settings = state.settings.lock().unwrap();
        settings.curseforge_api_key.clone()
    };

    let download_url = match source.as_str() {
        "curseforge" => {
            let mid: u32 = mod_id.parse().map_err(|_| "无效 Mod ID".to_string())?;
            let fid: u32 = file_id.parse().map_err(|_| "无效 File ID".to_string())?;
            crate::curseforge::get_mod_file_download_url(
                &state.http_client, &api_key, mid, fid
            ).await?
        }
        "modrinth" => {
            // Modrinth 的 download_url 已在前端传入（来自 get_project_versions 返回的 files[0].url）
            file_id.clone()
        }
        _ => return Err(format!("未知来源: {}", source)),
    };

    // 3. 流式下载
    let response = state.http_client
        .get(&download_url)
        .send()
        .await
        .map_err(|e| format!("下载请求失败: {}", e))?;

    let total = response.content_length().unwrap_or(0);
    let dest_path = download_dir.join(&file_name);

    let mut dest_file = std::fs::File::create(&dest_path)
        .map_err(|e| format!("创建文件失败: {}", e))?;

    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();

    use futures_util::StreamExt;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("下载流错误: {}", e))?;
        std::io::Write::write_all(&mut dest_file, &chunk)
            .map_err(|e| format!("写入文件失败: {}", e))?;
        downloaded += chunk.len() as u64;

        // 推送进度事件到前端
        let progress = DownloadProgress {
            file_id: file_id.clone(),
            file_name: file_name.clone(),
            downloaded,
            total,
            finished: false,
            error: None,
        };
        app.emit("download-progress", &progress).ok();
    }

    // 完成
    app.emit("download-progress", &DownloadProgress {
        file_id: file_id.clone(),
        file_name: file_name.clone(),
        downloaded: total,
        total,
        finished: true,
        error: None,
    }).ok();

    Ok(dest_path.to_string_lossy().to_string())
}
```

**依赖注意**：需要在 `Cargo.toml` 中加两个依赖：

```toml
dirs-next = "2"              # 获取系统 Downloads 目录
futures-util = "0.3"         # 流式下载 StreamExt
```

> 如果不想引入 `dirs-next`，可以暂时硬编码下载目录为 `./downloads/`，Step 9 再用设置页覆盖。但推荐一步到位。

### Step 4.6 — 注册新 commands

`src-tauri/src/commands/mod.rs` — 追加：
```rust
pub mod resource;
pub mod download;
```

`src-tauri/src/lib.rs` — 找到 `invoke_handler` 和 `setup` 中的 `manage`，确保 `AppState` 仍被管理。在 `invoke_handler` 中追加两个 command。

> ⚠️ 注意：`download_file` command 需要 `AppHandle` 参数（用于 `emit` 推送进度），Tauri 2 中第一个参数写 `app: AppHandle` 即可。

### Step 4.7 — 更新前端类型

`src/types/index.ts` — 追加对等 interface：

```typescript
export interface ModFile {
  id: string;
  fileName: string;
  displayName: string;
  gameVersions: string[];
  modLoaders: string[];
  releaseType: 'release' | 'beta' | 'alpha';
  fileSize: number;
  downloadUrl: string | null;
  downloadCount: number;
  createdAt: string;
}

export interface ResourceDetail {
  id: string;
  source: string;
  type: string;
  name: string;
  summary: string;
  description: string;
  iconUrl: string | null;
  downloadCount: number;
  author: string;
  categories: string[];
  gameVersions: string[];
  createdAt: string;
  updatedAt: string;
  files: ModFile[];
  url: string | null;
}

export interface DownloadProgress {
  fileId: string;
  fileName: string;
  downloaded: number;
  total: number;
  finished: boolean;
  error: string | null;
}
```

### Step 4.8 — ResourceHeader 组件

`src/components/resource/ResourceHeader.tsx` — 从 MC-Mod-Hub 直接复制，仅做适配：

| 原代码 | 改为 |
|--------|------|
| `next/link` → `Link` | `react-router-dom` → `Link` |
| `next/image` → `<img>` | 普通 img 标签 |
| 数据从 props 传入（不做 fetch） | 保持 props 传入 |
| `'use client'` | 删除 |

组件结构（从 MC-Mod-Hub 照搬）：
- 左侧：图标 96×96（或 fallback 占位）
- 右上：资源名称 + 类型标签（Mod/整合包/资源包 chip）
- 右侧中：作者 + 下载量（`formatDownloads`）
- 右下：分类 tags + 原始链接（如有 `url`）
- 底部：描述文本（HTML/Markdown，用 `dangerouslySetInnerHTML` 或 Markdown 渲染）

### Step 4.9 — VersionSelector 组件

`src/components/resource/VersionSelector.tsx` — 从 MC-Mod-Hub 直接复制（纯 UI 组件，无需路由适配）。

核心逻辑（从 MC-Mod-Hub 照搬）：
- 顶部：游戏版本筛选 chips（从 `files` 中提取所有 gameVersions 去重，点击筛选）
- 中部：模组加载器筛选（Forge / Fabric / NeoForge / Quilt chips）
- 列表：筛选后的文件列表，每行显示：
  - 文件名 + 版本号
  - releaseType 标签（Release 绿色 / Beta 黄色 / Alpha 红色）
  - 文件大小（`formatFileSize`）
  - 下载按钮 → 触发 `onDownload(file)`

### Step 4.10 — DownloadButton 组件

`src/components/resource/DownloadButton.tsx` — 从 MC-Mod-Hub 复制，改造下载逻辑：

| 原代码 | 改为 |
|--------|------|
| `fetch('/api/download', ...)` | `invoke('download_file', { source, modId, fileId, fileName })` |
| 进度从 fetch ReadableStream | 通过 Tauri event `download-progress` 监听 |

```tsx
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';
import type { ModFile, DownloadProgress } from '@/types';
import { useToast } from '@/components/common/ToastProvider';

interface DownloadButtonProps {
  source: string;
  modId: string;
  file: ModFile;
}

export default function DownloadButton({ source, modId, file }: DownloadButtonProps) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const { showToast } = useToast();

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    setProgress(0);

    // 监听下载进度事件
    const unlisten = await listen<DownloadProgress>('download-progress', (event) => {
      const p = event.payload;
      if (p.fileId === file.id) {
        if (p.finished) {
          setProgress(100);
          showToast(`✅ ${p.fileName} 下载完成`, 'success');
          setDownloading(false);
          unlisten();
        } else if (p.error) {
          showToast(`❌ 下载失败: ${p.error}`, 'error');
          setDownloading(false);
          unlisten();
        } else if (p.total > 0) {
          setProgress(Math.round((p.downloaded / p.total) * 100));
        }
      }
    });

    try {
      const destPath = await invoke<string>('download_file', {
        source,
        modId,
        fileId: file.id,
        fileName: file.fileName,
      });
      showToast(`已保存到: ${destPath}`, 'success');
    } catch (err) {
      showToast(`❌ 下载失败: ${String(err)}`, 'error');
    } finally {
      setDownloading(false);
      unlisten();
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      className={`... ${downloading ? 'cursor-wait' : ''}`}
    >
      {downloading
        ? `下载中 ${progress}%`
        : `下载 (${formatFileSize(file.fileSize)})`
      }
    </button>
  );
}
```

### Step 4.11 — ResourcePage 完整组装

`src/pages/ResourcePage.tsx` — 替换占位内容：

```tsx
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/tauri';
import type { ResourceDetail } from '@/types';
import ResourceHeader from '@/components/resource/ResourceHeader';
import VersionSelector from '@/components/resource/VersionSelector';
import Loading from '@/components/common/Loading';
import Empty from '@/components/common/Empty';

export default function ResourcePage() {
  const { source, id } = useParams<{ source: string; id: string }>();
  const [detail, setDetail] = useState<ResourceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!source || !id) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await invoke<ResourceDetail>('get_resource_detail', { source, id });
        setDetail(data);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [source, id]);

  if (loading) return <Loading />;
  if (error) return <div className="max-w-5xl mx-auto px-6 py-12 text-center text-red-400">{error}</div>;
  if (!detail) return <Empty message="资源不存在" />;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <ResourceHeader resource={detail} />
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-mc-text mb-4">版本列表</h2>
        <VersionSelector
          files={detail.files}
          source={source!}
          modId={id!}
        />
      </div>
    </div>
  );
}
```

### Step 4.12 — 验证步骤

```bash
# 1. Rust 编译检查
cd src-tauri
cargo check
# 预期：所有新 command + API 函数编译通过

# 2. 前端 TypeScript 检查
npx tsc --noEmit

# 3. Tauri 启动验证
npm run tauri dev
```

**验证清单**：
- [ ] 首页 → 搜索 → 右键卡片「查看详情」→ 跳转到资源详情页
- [ ] 详情页显示：图标 / 名称 / 作者 / 下载量 / 描述 / 分类标签
- [ ] 版本列表正确显示（文件名 / 版本号 / releaseType / 大小）
- [ ] 游戏版本筛选 chips 可点击、筛选生效
- [ ] 模组加载器筛选（Forge/Fabric 等）可点击
- [ ] 点击下载按钮 → 文件下载到本地 → Toast 提示路径
- [ ] 通过热门板块点卡片也能进入详情页
- [ ] CurseForge 和 Modrinth 两个来源的资源都能正常显示

---

## 约束条件

- ❌ **不要**改动数据库层（db.rs 不变）
- ❌ **不要**改动首页组件（HomePage/HotSection/SearchBar 不变）
- ❌ **不要**做实时的 WebSocket 下载进度条——用 Tauri event `listen('download-progress')` 推送即可
- ❌ **不要**做批量下载（zip/folder）——Step 7 才做
- ❌ **不要**改动 Navbar 或路由结构
- ✅ `ResourceHeader` / `VersionSelector` 直接从 MC-Mod-Hub 复制并做最少适配
- ✅ `DownloadButton` 改造 `fetch` → `invoke` + event listener
- ✅ CF 的 `description` 是 HTML，MR 的 `body` 是 Markdown，前端用 `dangerouslySetInnerHTML` 渲染即可
- ✅ `Cargo.toml` 新增依赖 `dirs-next` 和 `futures-util`（如需）

---

## MC-Mod-Hub 源码参考路径

| 目标文件 | 来源（如可访问） |
|---------|-----------------|
| `src/components/resource/ResourceHeader.tsx` | MC-Mod-Hub `src/components/resource/ResourceHeader.tsx` |
| `src/components/resource/VersionSelector.tsx` | MC-Mod-Hub `src/components/resource/VersionSelector.tsx` |
| `src/components/resource/DownloadButton.tsx` | MC-Mod-Hub `src/components/resource/DownloadButton.tsx` |
| `src-tauri/src/curseforge.rs` 新函数 | MC-Mod-Hub `src/lib/curseforge.ts` |
| `src-tauri/src/modrinth.rs` 新函数 | MC-Mod-Hub `src/lib/modrinth.ts` |

---

## 完成后

完成后告诉我：
1. `cargo check` 是否通过
2. 资源详情页是否正确显示（图标/名称/作者/描述/文件列表）
3. 下载按钮是否工作——文件是否成功下载到本地、Toast 是否弹出
4. CF 和 MR 两个平台的资源是否都正常
5. 实际执行中做了什么与计划不同的改动

---

## 应急方案说明

> 如需插入新功能：先读 `migration-plan.md` §12。B/C/D 级功能从 Step 2 后即可安全插入。
> 新功能铁律：新文件 + 注册文件（mod.rs / lib.rs / App.tsx）末尾加行，不改已有类型和表。

**本对话只做 Step 4 的资源详情 + 单文件下载，不做任何其他功能。**
