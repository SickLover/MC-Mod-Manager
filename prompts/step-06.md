# 开发执行 Prompt — MC Mod Hub 轻量化版 Step 6

> 具体产品需求请参考 `D:\vibe coding\projects\MC-Mod-Hub\requirements.md`，技术方案参考本目录 `technical-design.md`，迁移方案参考本目录 `migration-plan.md`，开发规则参考本目录 `AGENTS.md`。

---

## 项目背景

MC Mod Hub 轻量化版，基于 Tauri + Vite + React SPA。

- Step 1：项目骨架 + 搜索链路
- Step 2：数据库层 + Navbar + 7 个占位页
- Step 3：首页完成（热门 + 右键菜单）
- Step 4：资源详情页 + 单文件下载
- Step 5：收藏夹 CRUD + ContextMenu「添加到收藏夹」打通
- **当前**：收藏夹详情页仍是占位状态。用户点进收藏夹看不到资源列表，无法批量下载。

## 第六步目标

**收藏夹详情页完整实现 — 资源列表查看 + 筛选 + 批量下载（zip / folder）。**

具体产出：
1. Rust 端：`batch_download` command — 勾选文件列表 → zip 打包下载（zip crate）或 逐个下载到 folder
2. 前端：`ItemRow` 组件（从 MC-Mod-Hub 复制，含复选框 + 信息行）
3. 前端：`CompatibilityCheck` 组件（从 MC-Mod-Hub 复制，双栏兼容性检测）
4. 前端：`CollectionDetailPage` 完整实现 — sticky header / 三级筛选 / 全选勾选 / 批量下载 / sticky 底部栏

> Step 6 完成后，收藏夹体系完整闭环：创建收藏夹 → 添加资源 → 查看/筛选/勾选 → 批量下载。

---

## 需要创建/修改的文件

### 新建文件

```
src-tauri/src/commands/batch_download.rs  — batch_download command（zip / folder）
src/components/collection/ItemRow.tsx      — 收藏夹条目行（从 MC-Mod-Hub 复制）
src/components/collection/CompatibilityCheck.tsx — 兼容性检测（从 MC-Mod-Hub 复制）
```

### 修改文件

```
src-tauri/Cargo.toml                      — 加 zip + walkdir 依赖
src-tauri/src/commands/mod.rs             — 加 pub mod batch_download
src-tauri/src/lib.rs                      — 注册 batch_download command
src/pages/CollectionDetailPage.tsx        — 替换占位为完整实现
src/types/index.ts                        — 如需追加 BatchDownloadRequest 等类型
```

---

## 开发步骤

### Step 6.1 — Cargo.toml 新依赖

```toml
zip = "0.6"          # zip 打包
walkdir = "2"        # 遍历文件夹（可选，仅 folder 模式用）
```

### Step 6.2 — batch_download command

`src-tauri/src/commands/batch_download.rs`：

```rust
use tauri::{command, State, AppHandle, Emitter};
use crate::AppState;
use crate::types::DownloadProgress;
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchDownloadRequest {
    pub source: String,
    pub mod_id: String,
    pub file_id: String,
    pub file_name: String,
}

#[command]
pub async fn batch_download(
    app: AppHandle,
    state: State<'_, AppState>,
    files: Vec<BatchDownloadRequest>,
    mode: String,  // "zip" | "folder"
) -> Result<String, String> {
    // 1. 准备下载目录
    let download_dir = {
        let settings = state.settings.lock().unwrap();
        if settings.default_download_dir.is_empty() {
            dirs_next::download_dir()
                .unwrap_or_else(|| std::path::PathBuf::from("."))
                .join("mc-mod-hub")
        } else {
            std::path::PathBuf::from(&settings.default_download_dir)
        }
    };
    std::fs::create_dir_all(&download_dir).map_err(|e| format!("创建目录失败: {}", e))?;

    let api_key = {
        let settings = state.settings.lock().unwrap();
        settings.curseforge_api_key.clone()
    };

    // 2. 逐个下载到临时目录
    let temp_dir = download_dir.join(format!(".batch_{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&temp_dir).map_err(|e| format!("创建临时目录失败: {}", e))?;

    let total = files.len() as u64;
    for (i, file) in files.iter().enumerate() {
        // 获取下载 URL
        let download_url = match file.source.as_str() {
            "curseforge" => {
                let mid: u32 = file.mod_id.parse().map_err(|_| "无效 Mod ID".to_string())?;
                let fid: u32 = file.file_id.parse().map_err(|_| "无效 File ID".to_string())?;
                crate::curseforge::get_mod_file_download_url(
                    &state.http_client, &api_key, mid, fid
                ).await?
            }
            "modrinth" => file.file_id.clone(), // Modrinth 直接传 URL
            _ => return Err(format!("未知来源: {}", file.source)),
        };

        // 流式下载
        let response = state.http_client.get(&download_url).send().await
            .map_err(|e| format!("下载请求失败: {}", e))?;

        let dest = temp_dir.join(&file.file_name);
        let mut dest_file = std::fs::File::create(&dest)
            .map_err(|e| format!("创建文件失败: {}", e))?;

        let mut stream = response.bytes_stream();
        use futures_util::StreamExt;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("流错误: {}", e))?;
            std::io::Write::write_all(&mut dest_file, &chunk)
                .map_err(|e| format!("写入失败: {}", e))?;
        }

        // 推送进度
        app.emit("batch-progress", &serde_json::json!({
            "current": i + 1,
            "total": total,
            "fileName": file.file_name,
        })).ok();
    }

    // 3. 按 mode 输出
    let result_path = match mode.as_str() {
        "zip" => {
            let zip_name = format!("mc-mods-{}.zip",
                chrono::Local::now().format("%Y%m%d-%H%M%S"));
            let zip_path = download_dir.join(&zip_name);

            let zip_file = std::fs::File::create(&zip_path)
                .map_err(|e| format!("创建 zip 失败: {}", e))?;
            let mut zip_writer = zip::ZipWriter::new(zip_file);
            let options = zip::write::FileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated);

            for entry in std::fs::read_dir(&temp_dir).map_err(|e| format!("读取临时目录失败: {}", e))? {
                let entry = entry.map_err(|e| format!("读取条目失败: {}", e))?;
                let path = entry.path();
                if path.is_file() {
                    let name = path.file_name().unwrap().to_string_lossy().to_string();
                    zip_writer.start_file(&name, options)
                        .map_err(|e| format!("zip 创建条目失败: {}", e))?;
                    let data = std::fs::read(&path)
                        .map_err(|e| format!("读取文件失败: {}", e))?;
                    zip_writer.write_all(&data)
                        .map_err(|e| format!("zip 写入失败: {}", e))?;
                }
            }
            zip_writer.finish().map_err(|e| format!("zip 完成失败: {}", e))?;
            zip_path.to_string_lossy().to_string()
        }
        "folder" => {
            let folder_name = format!("mc-mods-{}",
                chrono::Local::now().format("%Y%m%d-%H%M%S"));
            let folder_path = download_dir.join(&folder_name);
            std::fs::rename(&temp_dir, &folder_path)
                .map_err(|e| format!("重命名目录失败: {}", e))?;
            folder_path.to_string_lossy().to_string()
        }
        _ => return Err(format!("未知模式: {}", mode)),
    };

    Ok(result_path)
}
```

**Cargo.toml 加依赖**（如未加过）：

```toml
chrono = "0.4"       # 时间戳用于文件名
```

### Step 6.3 — 注册 batch_download command

`commands/mod.rs` — 追加 `pub mod batch_download;`

`lib.rs` — invoke_handler 追加 `commands::batch_download::batch_download,`

### Step 6.4 — ItemRow 组件

`src/components/collection/ItemRow.tsx` — 从 MC-Mod-Hub 直接复制，仅做适配：

| 原代码 | 改为 |
|--------|------|
| `next/link` → `Link` | `react-router-dom` → `Link` |
| `next/image` → `<img>` | 普通 img 标签 |
| `'use client'` | 删除 |

组件结构（从 MC-Mod-Hub 照搬）：
- 左侧：复选框（受控 `checked` prop）
- 图标：32×32 或 24×24 缩略图
- 中间：资源名称（点击跳详情页）+ 来源标签（CF/MR）
- 右侧：下载量 + 添加日期
- 操作按钮：移除（🚫）

### Step 6.5 — CompatibilityCheck 组件

`src/components/collection/CompatibilityCheck.tsx` — 从 MC-Mod-Hub 直接复制：

这是一个**纯前端 UI 组件**，不涉及路由或数据获取，直接复制即可。

核心逻辑（从 MC-Mod-Hub 照搬）：
- 接收：勾选的 `CollectionItem[]` 列表
- 从每个 item 提取 `gameVersions`（解析 JSON 字符串）
- 双栏布局：左栏 - 所有勾选资源的版本交集（兼容版本），右栏 - 每个资源的版本详情
- 交集为空的资源标红警告

如果 MC-Mod-Hub 不可访问，按以下最简结构手写：

```tsx
interface Props {
  selectedItems: CollectionItem[];
}

export default function CompatibilityCheck({ selectedItems }: Props) {
  if (selectedItems.length < 2) return null;

  // 解析每个 item 的 gameVersions JSON → 取交集
  const allVersions = selectedItems.map(item => {
    try { return JSON.parse(item.gameVersions) as string[]; }
    catch { return []; }
  });

  const intersection = allVersions.reduce((acc, vers) =>
    acc.filter(v => vers.includes(v))
  );

  return (
    <div className="grid grid-cols-2 gap-4 p-4 bg-mc-card rounded-mc border border-mc-border">
      <div>
        <h4 className="text-sm font-medium text-mc-text mb-2">兼容版本</h4>
        <div className="flex flex-wrap gap-1">
          {intersection.length > 0
            ? intersection.map(v => <span key={v} className="chip-green">{v}</span>)
            : <span className="text-red-400 text-sm">无交集</span>
          }
        </div>
      </div>
      <div>
        <h4 className="text-sm font-medium text-mc-text mb-2">各资源版本</h4>
        {selectedItems.map(item => (
          <div key={item.id} className="text-xs text-mc-muted mb-1">
            {item.name}: {(() => {
              try { return (JSON.parse(item.gameVersions) as string[]).join(', '); }
              catch { return '-'; }
            })()}
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Step 6.6 — CollectionDetailPage 完整实现

`src/pages/CollectionDetailPage.tsx` — 替换占位内容：

核心功能：
- **sticky header**：收藏夹名称 + 资源数量 + 返回按钮
- **三级筛选**：
  1. 资源类型（全部 / Mod / 整合包 / 资源包 / 光影 / 世界 / 数据包）
  2. 来源（全部 / CurseForge / Modrinth）
  3. 游戏版本（下拉 select，从 items 中提取去重版本列表）
- **全选/反选**：顶部 checkbox
- **ItemRow 列表**：每个 item 可勾选
- **sticky 底部栏**：
  - 已选 N 个 → 下载为 ZIP / 下载为文件夹 按钮
  - 移除选中 按钮
  - 已选资源文件名汇总
- **CompatibilityCheck**：当勾选 ≥2 个时，在底部栏上方显示
- **空状态**：`Empty` 组件（"收藏夹是空的"）

```tsx
import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import type { CollectionItem } from '@/types';
import ItemRow from '@/components/collection/ItemRow';
import CompatibilityCheck from '@/components/collection/CompatibilityCheck';
import Loading from '@/components/common/Loading';
import Empty from '@/components/common/Empty';
import { useToast } from '@/components/common/ToastProvider';

export default function CollectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [filterVersion, setFilterVersion] = useState('all');
  const [downloading, setDownloading] = useState(false);
  const { showToast } = useToast();

  const loadItems = useCallback(async () => {
    if (!id) return;
    try {
      const data = await invoke<CollectionItem[]>('list_collection_items', { collectionId: id });
      setItems(data);
    } catch (err) {
      showToast(`加载失败: ${String(err)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [id, showToast]);

  useEffect(() => { loadItems(); }, [loadItems]);

  // 三级筛选
  const filtered = items.filter(item => {
    if (filterType !== 'all' && item.resourceType !== filterType) return false;
    if (filterSource !== 'all' && item.source !== filterSource) return false;
    if (filterVersion !== 'all') {
      try {
        const versions: string[] = JSON.parse(item.gameVersions);
        if (!versions.includes(filterVersion)) return false;
      } catch { return false; }
    }
    return true;
  });

  const allSelected = filtered.length > 0 && selected.size === filtered.length;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(i => i.id)));
    }
  };

  const handleBatchDownload = async (mode: 'zip' | 'folder') => {
    const selectedItems = items.filter(i => selected.has(i.id));
    if (selectedItems.length === 0) return;
    setDownloading(true);
    try {
      const files = selectedItems.map(i => ({
        source: i.source,
        modId: i.resourceId,
        fileId: i.resourceId,
        fileName: `${i.name}.jar`,
      }));

      // 监听批量进度
      const unlisten = await listen<{ current: number; total: number; fileName: string }>(
        'batch-progress',
        (event) => {
          // 可显示进度条（本步先用 Toast，Step 9 加进度条 UI）
        },
      );

      const resultPath = await invoke<string>('batch_download', { files, mode });
      showToast(`已保存到: ${resultPath}`, 'success');
      unlisten();
    } catch (err) {
      showToast(`批量下载失败: ${String(err)}`, 'error');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return <Loading />;
  if (items.length === 0) return <Empty message="收藏夹是空的" icon="📂" />;

  // 提取游戏版本列表用于筛选
  const allVersions = [...new Set(items.flatMap(i => {
    try { return JSON.parse(i.gameVersions) as string[]; }
    catch { return []; }
  }))].sort();

  return (
    <div className="max-w-5xl mx-auto px-6 pb-32">
      {/* sticky header */}
      <div className="sticky top-14 z-40 bg-mc-bg/95 backdrop-blur py-4 border-b border-mc-border mb-4">
        <Link to="/collections" className="text-mc-muted hover:text-mc-text text-sm mb-2 inline-block">
          ← 返回收藏夹列表
        </Link>
        <h1 className="text-xl font-bold text-mc-text">
          收藏夹详情 <span className="text-mc-muted text-sm font-normal">({items.length} 个资源)</span>
        </h1>
      </div>

      {/* 三级筛选 */}
      <div className="flex flex-wrap gap-4 mb-4">
        {/* 类型筛选 */}
        {/* 来源筛选 */}
        {/* 版本筛选 */}
      </div>

      {/* 全选 bar */}
      <div className="flex items-center gap-3 mb-2 px-2">
        <input type="checkbox" checked={allSelected} onChange={toggleAll} />
        <span className="text-sm text-mc-muted">
          {selected.size > 0 ? `已选 ${selected.size}/${filtered.length}` : '全选'}
        </span>
      </div>

      {/* ItemRow 列表 */}
      <div className="space-y-0.5">
        {filtered.map(item => (
          <ItemRow
            key={item.id}
            item={item}
            checked={selected.has(item.id)}
            onToggle={(checked) => {
              setSelected(prev => {
                const next = new Set(prev);
                checked ? next.add(item.id) : next.delete(item.id);
                return next;
              });
            }}
            onRemove={async () => {
              await invoke('remove_item_from_collection', { collectionId: id, itemId: item.id });
              loadItems();
            }}
          />
        ))}
      </div>

      {/* CompatibilityCheck — 勾选 ≥2 时显示 */}
      {selected.size >= 2 && (
        <div className="mt-6">
          <CompatibilityCheck
            selectedItems={items.filter(i => selected.has(i.id))}
          />
        </div>
      )}

      {/* sticky 底部栏 */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-mc-bg/95 backdrop-blur
                        border-t border-mc-border px-6 py-3
                        flex items-center gap-4">
          <span className="text-sm text-mc-muted">已选 {selected.size} 个</span>
          <button onClick={() => handleBatchDownload('zip')} disabled={downloading}
            className="px-4 py-2 bg-mc-green text-white rounded-md text-sm
                       hover:bg-mc-green-light transition-colors disabled:opacity-50">
            📦 下载为 ZIP
          </button>
          <button onClick={() => handleBatchDownload('folder')} disabled={downloading}
            className="px-4 py-2 bg-mc-card border border-mc-border text-mc-text rounded-md text-sm
                       hover:bg-mc-card-hover transition-colors disabled:opacity-50">
            📁 下载为文件夹
          </button>
        </div>
      )}
    </div>
  );
}
```

### Step 6.7 — 验证步骤

```bash
# 1. Rust 编译检查
cd src-tauri
cargo check
# 预期：zip + chrono + batch_download 编译通过

# 2. 前端 TypeScript 检查
npx tsc --noEmit

# 3. Tauri 启动验证
npm run tauri dev
```

**验证清单**：
- [ ] 从收藏夹列表点击一个收藏夹 → 进入详情页
- [ ] 看到资源列表（从 ContextMenu「添加到收藏夹」添加的资源）
- [ ] 三级筛选：类型 / 来源 / 版本下拉，筛选后列表更新
- [ ] 全选 checkbox → 全部勾选 / 取消
- [ ] 单个 ItemRow 勾选 / 取消
- [ ] 勾选 ≥2 个 → CompatibilityCheck 显示（交集版本 + 各资源版本）
- [ ] sticky 底部栏：显示已选数量 + 按钮
- [ ] 下载为 ZIP → 等待完成 → Toast 显示 zip 路径 → 检查文件存在
- [ ] 下载为文件夹 → Toast 显示文件夹路径 → 检查文件存在
- [ ] 移除按钮 → item 从列表消失
- [ ] 空收藏夹 → Empty 组件

---

## 约束条件

- ❌ **不要**改动 Step 5 的 `commands/collections.rs`（7 个 CRUD 不变）
- ❌ **不要**改动已有的单文件下载（`commands/download.rs`）——批量下载是新的独立 command
- ❌ **不要**做最近浏览 / 更新提醒 / 分页——Step 7 才做
- ❌ **不要**做 SettingsPage 实现——Step 8 才做
- ✅ `batch_download` command 新增 `chrono` / `zip` / `walkdir` 依赖是允许的
- ✅ `CompatibilityCheck` 从 MC-Mod-Hub 直接复制（纯 UI，无需适配）
- ✅ sticky header + sticky 底部栏使用 Tailwind `sticky` / `fixed` + `z-40` / `z-50`

---

## MC-Mod-Hub 源码参考

| 目标文件 | 来源 |
|---------|------|
| `ItemRow.tsx` | MC-Mod-Hub `src/components/collection/ItemRow.tsx` |
| `CompatibilityCheck.tsx` | MC-Mod-Hub `src/components/collection/CompatibilityCheck.tsx` |
| `CollectionDetailPage` 逻辑 | MC-Mod-Hub `src/app/collections/[id]/page.tsx` |

---

## 完成后

完成后告诉我：
1. `cargo check` 是否通过
2. 收藏夹详情页是否显示资源列表、三级筛是否正常
3. 勾选全选 / 兼容性检测双栏是否正常
4. 批量下载 ZIP / 文件夹是否成功、Toast 提示路径
5. 实际执行中做了什么与计划不同的改动

---

## 应急方案说明

> 如需插入新功能：先读 `migration-plan.md` §12。B/C/D 级功能从 Step 2 后即可安全插入。
> 新功能铁律：新文件 + 注册文件末尾加行，不改已有类型和表。

**本对话只做 Step 6 的收藏夹详情 + 批量下载，不做其他页面。**
