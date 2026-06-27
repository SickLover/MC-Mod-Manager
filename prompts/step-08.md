# 开发执行 Prompt — MC Mod Hub 轻量化版 Step 8

> 具体产品需求请参考 `D:\vibe coding\projects\MC-Mod-Hub\requirements.md`，技术方案参考本目录 `technical-design.md`，迁移方案参考本目录 `migration-plan.md`，开发规则参考本目录 `AGENTS.md`。

---

## 项目背景

MC Mod Hub 轻量化版，基于 Tauri + Vite + React SPA。

- Step 1–3：骨架 + 搜索 + 首页热门 + 右键菜单
- Step 4：资源详情 + 单文件下载
- Step 5–6：收藏夹 CRUD + 详情页 + 批量下载
- Step 7：分类浏览分页 + 最近浏览 + 更新提醒骨架
- **当前**：设置页仍是占位状态。API Key 硬编码在 Rust 端，无法修改。下载目录不可配置。设置页是所有页面的最后一块拼图。

## 第八步目标

**设置页完整实现 — API Key 管理 + 下载目录 + 偏好设置持久化。**

具体产出：
1. Rust 端：`settings` command — 读写 `settings.json`（存于 `app_data_dir()`）
2. Rust 端：去除硬编码 API Key → 启动时从 `settings.json` 加载，无文件时用空字符串
3. 前端：`SettingsPage` 完整实现 — API Key（password 输入框）+ 下载目录（目录选择）+ 偏好开关
4. Tauri 窗口配置：标题栏、窗口大小等优化（可选，minor）

> Step 8 完成后，所有 8 个页面的功能全部就绪。项目进入最终调优和打包阶段。

---

## 需要创建/修改的文件

### 新建文件

```
src-tauri/src/commands/settings.rs  — settings command（读写 settings.json）
```

### 修改文件

```
src-tauri/src/lib.rs                 — 启动时加载 settings.json → AppState.settings
src-tauri/src/commands/mod.rs        — 加 pub mod settings
src/pages/SettingsPage.tsx           — 替换占位为完整实现
```

---

## 开发步骤

### Step 8.1 — settings command（Rust 端读写 settings.json）

`src-tauri/src/commands/settings.rs`：

```rust
use tauri::{command, State, AppHandle, Manager};
use crate::AppState;
use std::fs;
use std::path::PathBuf;

/// 获取 settings.json 路径
fn settings_path(app: &AppHandle) -> PathBuf {
    let mut path = app.path().app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("data"));
    fs::create_dir_all(&path).ok();
    path.push("settings.json");
    path
}

/// 加载设置（启动时调用）
pub fn load_settings(app: &AppHandle) -> crate::Settings {
    let path = settings_path(app);
    if path.exists() {
        fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    } else {
        crate::Settings::default()
    }
}

/// 保存设置到文件
fn save_settings(app: &AppHandle, settings: &crate::Settings) -> Result<(), String> {
    let path = settings_path(app);
    let json = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("序列化失败: {}", e))?;
    fs::write(&path, json)
        .map_err(|e| format!("写入失败: {}", e))?;
    Ok(())
}

#[command]
pub async fn get_settings(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<crate::Settings, String> {
    // 从文件重新加载最新设置
    let settings = load_settings(&app);
    // 同步到内存
    if let Ok(mut s) = state.settings.lock() {
        *s = settings.clone();
    }
    Ok(settings)
}

#[command]
pub async fn save_settings_command(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: crate::Settings,
) -> Result<(), String> {
    save_settings(&app, &settings)?;
    // 同步到内存
    if let Ok(mut s) = state.settings.lock() {
        *s = settings;
    }
    Ok(())
}

/// 选择目录（调用系统文件夹选择对话框）
#[command]
pub async fn select_directory(app: AppHandle) -> Result<String, String> {
    use tauri::api::dialog::blocking::FileDialogBuilder;
    // Tauri 2: 使用 rfd crate 或 tauri::api::dialog
    // 简化版：直接返回默认目录，让用户手动输入路径
    // 完整版：用 rfd::FileDialog
    Err("目录选择器暂未启用，请手动输入路径".to_string())
}
```

**目录选择器**：Tauri 2 的 dialog API 需要额外插件或 `rfd` crate。如果不想引入 rfd，设置页用文本输入框让用户手动输入路径——简单且够用。

如果选择引入 rfd（推荐，体验更好）：

```toml
# Cargo.toml
rfd = "0.14"
```

```rust
#[command]
pub async fn select_directory() -> Result<String, String> {
    let folder = rfd::AsyncFileDialog::new()
        .pick_folder()
        .await
        .map(|handle| handle.path().to_string_lossy().to_string());
    folder.ok_or_else(|| "未选择目录".to_string())
}
```

> **决策**：如果 `rfd` 编译通过无问题则使用，否则退回到文本输入模式。

### Step 8.2 — 启动时加载 settings.json

`src-tauri/src/lib.rs` — 修改 `run()` 函数，在 `setup` 中加载 settings：

```rust
.setup(|app| {
    let db_path = db::get_db_path(&app.handle());
    let database = db::Database::new(&db_path)
        .expect("初始化数据库失败");

    // 从 settings.json 加载设置（替代硬编码 API Key）
    let settings = commands::settings::load_settings(&app.handle());

    let app_state = AppState {
        http_client: reqwest::Client::new(),
        settings: Mutex::new(settings),
        db: database,
    };

    app.manage(app_state);
    Ok(())
})
```

**删除硬编码 API Key**：如果 Step 1 的 `Settings::default()` 或 `setup` 中有硬编码的 `$2a$10$YOUR_KEY_HERE`，删除之。`Settings::default()` 应返回空字符串。

### Step 8.3 — 注册 settings command

`commands/mod.rs` — 追加 `pub mod settings;`

`lib.rs` — invoke_handler 追加：
```rust
commands::settings::get_settings,
commands::settings::save_settings_command,
commands::settings::select_directory,  // 如果实现了
```

### Step 8.4 — SettingsPage 完整实现

`src/pages/SettingsPage.tsx` — 替换占位：

```tsx
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { useToast } from '@/components/common/ToastProvider';

interface Settings {
  curseforgeApiKey: string;
  defaultDownloadDir: string;
  checkUpdatesOnStartup: boolean;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    curseforgeApiKey: '',
    defaultDownloadDir: '',
    checkUpdatesOnStartup: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const toast = useToast();

  useEffect(() => {
    invoke<Settings>('get_settings')
      .then(setSettings)
      .catch(err => toast?.error?.(`加载设置失败: ${String(err)}`))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await invoke('save_settings_command', { settings });
      toast?.success?.('设置已保存');
    } catch (err) {
      toast?.error?.(`保存失败: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="max-w-2xl mx-auto px-6 py-8 text-mc-muted">加载中...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-mc-text mb-8">设置</h1>

      <div className="space-y-8">
        {/* CurseForge API Key */}
        <section>
          <h2 className="text-lg font-semibold text-mc-text mb-3">CurseForge API Key</h2>
          <p className="text-sm text-mc-muted mb-2">
            用于访问 CurseForge API。在{' '}
            <a href="https://console.curseforge.com" target="_blank" rel="noreferrer"
               className="text-mc-green hover:text-mc-green-light underline">
              CurseForge Developer Console
            </a>{' '}
            获取。
          </p>
          <div className="flex gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              value={settings.curseforgeApiKey}
              onChange={e => setSettings(s => ({ ...s, curseforgeApiKey: e.target.value }))}
              placeholder="粘贴 API Key..."
              className="flex-1 px-3 py-2 rounded-md bg-mc-card border border-mc-border
                         text-mc-text text-sm placeholder:text-mc-muted/50
                         focus:outline-none focus:border-mc-green transition-colors"
            />
            <button
              onClick={() => setShowKey(v => !v)}
              className="px-3 py-2 rounded-md bg-mc-card border border-mc-border
                         text-mc-muted hover:text-mc-text text-sm transition-colors"
            >
              {showKey ? '隐藏' : '显示'}
            </button>
          </div>
        </section>

        {/* 下载目录 */}
        <section>
          <h2 className="text-lg font-semibold text-mc-text mb-3">默认下载目录</h2>
          <p className="text-sm text-mc-muted mb-2">
            下载的 Mod 文件将保存到此目录。留空则默认保存到「下载/mc-mod-hub」。
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={settings.defaultDownloadDir}
              onChange={e => setSettings(s => ({ ...s, defaultDownloadDir: e.target.value }))}
              placeholder="例如: D:\Minecraft\mods"
              className="flex-1 px-3 py-2 rounded-md bg-mc-card border border-mc-border
                         text-mc-text text-sm placeholder:text-mc-muted/50
                         focus:outline-none focus:border-mc-green transition-colors"
            />
            <button
              onClick={async () => {
                try {
                  const dir = await invoke<string>('select_directory');
                  setSettings(s => ({ ...s, defaultDownloadDir: dir }));
                } catch {}
              }}
              className="px-3 py-2 rounded-md bg-mc-card border border-mc-border
                         text-mc-muted hover:text-mc-text text-sm transition-colors"
            >
              浏览...
            </button>
          </div>
        </section>

        {/* 偏好设置 */}
        <section>
          <h2 className="text-lg font-semibold text-mc-text mb-3">偏好设置</h2>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.checkUpdatesOnStartup}
              onChange={e => setSettings(s => ({ ...s, checkUpdatesOnStartup: e.target.checked }))}
              className="w-4 h-4 rounded accent-mc-green"
            />
            <span className="text-sm text-mc-text">启动时检查更新提醒</span>
          </label>
        </section>

        {/* 保存按钮 */}
        <div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-mc-green text-white rounded-md text-sm font-medium
                       hover:bg-mc-green-light transition-colors disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存设置'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

### Step 8.5 — Tauri 窗口配置优化（可选）

`src-tauri/tauri.conf.json` — 确认配置合理：

```json
{
  "app": {
    "title": "MC Mod Hub",
    "windows": [
      {
        "title": "MC Mod Hub",
        "width": 1280,
        "height": 800,
        "minWidth": 900,
        "minHeight": 600,
        "resizable": true,
        "center": true
      }
    ]
  }
}
```

> 如果在 Step 1 已配置好，无需改动。

### Step 8.6 — 验证步骤

```bash
cargo check
npx tsc --noEmit
npm run tauri dev
```

**验证清单**：
- [ ] 导航到 `/settings` → 看到完整设置页（API Key / 下载目录 / 偏好开关）
- [ ] API Key 输入密码框，点击「显示」可切换明文
- [ ] 输入 API Key → 保存 → 关闭应用 → 重启 → API Key 仍在
- [ ] 搜索 CF 资源（如 Key 有效则返回结果，无效则返回 Modrinth 结果）
- [ ] 下载目录：输入路径 → 保存 → 下载文件验证目录正确
- [ ] `settings.json` 文件生成在 `app_data_dir()` 下
- [ ] 偏好开关正常切换

---

## 约束条件

- ❌ **不要**在代码中保留硬编码 API Key — 全部从 settings.json 加载
- ❌ **不要**做用户登录系统
- ❌ **不要**做主题切换——只保持暗色主题
- ✅ `Settings` struct 字段保持不变（`curseforge_api_key` / `default_download_dir` / `check_updates_on_startup`）
- ✅ API Key 在 UI 上用 `type="password"`（点「显示」才可见）
- ✅ 目录选择：如有 `rfd` crate 自然最好，否则手动输入框即可

---

## 完成后

完成后告诉我：
1. `cargo check` 是否通过
2. 设置页三个区域是否正常（API Key / 下载目录 / 偏好）
3. 保存后关闭重启 → 设置是否持久化
4. API Key 正确时 CF 搜索是否恢复（之前硬编码的占位 Key 被替换）
5. 实际执行中做了什么与计划不同的改动

---

## 应急方案说明

> Step 8 结束后，所有 8 个页面功能全部就绪。接下来的 Step 9/10 专注于打包发布。

**本对话只做 Step 8 的设置页实现，不做打包和发布。**
