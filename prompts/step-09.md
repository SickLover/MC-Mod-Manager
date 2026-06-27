# 开发执行 Prompt — MC Mod Hub 轻量化版 Step 9

> 具体产品需求请参考 `D:\vibe coding\projects\MC-Mod-Hub\requirements.md`，技术方案参考本目录 `technical-design.md`，迁移方案参考本目录 `migration-plan.md`，开发规则参考本目录 `AGENTS.md`。

---

## 项目背景

MC Mod Hub 轻量化版，基于 Tauri + Vite + React SPA。

- Step 1–8：全部 8 个页面功能完整就绪（搜索 / 热门 / 详情 / 下载 / 收藏夹 / 分类 / 更新 / 设置）
- **当前**：只能通过 `npm run tauri dev` 开发模式运行，无独立安装包

## 第九步目标

**Tauri 打包配置 — 生成 `.msi` / `.exe` 安装包，本地构建验证通过。**

具体产出：
1. `tauri.conf.json` — 补充 `bundle` 配置（Windows MSI/NSIS installer）
2. 应用图标 — 生成各尺寸 icon（或使用占位图标）
3. `src-tauri/icons/` — 放置各尺寸 png/ico
4. `.gitignore` — 确认 `src-tauri/target/` / `release/` / `data/` 已忽略
5. `package.json` — 确认 `build` / `tauri build` 脚本
6. 本地构建验证 — `npm run tauri build` 成功生成 `.msi` 或 `.exe`

> Step 9 完成后，项目可以打包分发给朋友使用。仅剩 GitHub Actions 自动发布（Step 10）。

---

## 需要创建/修改的文件

### 新建文件

```
src-tauri/icons/icon.png              — 应用图标（256×256 PNG）
src-tauri/icons/icon.ico              — Windows 图标
src-tauri/icons/32x32.png             — 小尺寸（可选，Tauri 可自动生成）
```

### 修改文件

```
src-tauri/tauri.conf.json             — 加 bundle 配置
package.json                          — 确认 build/tauri 脚本
.gitignore                            — 确认 target/ / release/ / data/ 忽略
```

---

## 开发步骤

### Step 9.1 — Tauri bundler 配置

`src-tauri/tauri.conf.json` — 在现有基础上追加 `bundle` 段：

```json
{
  "productName": "MC Mod Hub",
  "version": "0.1.0",
  "identifier": "com.mcmodhub.light",
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
        "minWidth": 900,
        "minHeight": 600,
        "resizable": true,
        "center": true
      }
    ],
    "security": {
      "csp": "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'"
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "windows": {
      "wix": {
        "language": "zh-CN"
      },
      "nsis": {
        "installMode": "currentUser",
        "languages": ["SimpChinese", "English"]
      }
    }
  }
}
```

关键配置解释：
- `identifier`：唯一应用 ID（`com.mcmodhub.light`）
- `bundle.targets`：`"all"` 或 `["msi", "nsis"]`（Windows only）
- `bundle.icon`：各尺寸图标路径
- `bundle.windows.wix`：生成 `.msi`，语言设为中文
- `bundle.windows.nsis`：生成 `.exe` NSIS 安装器，当前用户安装

> ⚠️ 如果只需要 `.msi`，把 `targets` 改为 `["msi"]`。如果需要 `.exe`（NSIS），改为 `["nsis"]`。两者都要用 `"all"`。

### Step 9.2 — 应用图标

`src-tauri/icons/` — 需要准备图标文件。如果没有设计好的图标，用以下两种方式之一：

**方式 A — 自动生成（推荐）**：
```bash
# Tauri CLI 自带图标生成命令
npm run tauri icon path/to/source-icon.png
# 自动生成全部所需尺寸到 src-tauri/icons/
```

**方式 B — 手动放置**：
- `icon.png` — 256×256 或 512×512 PNG
- `icon.ico` — Windows 图标
- `32x32.png` / `128x128.png` / `128x128@2x.png` — 各尺寸

如果没有任何图标素材，创建一个简单的占位图标：
- 绿色方块 + "MH" 文字，256×256 PNG
- 用任何图片编辑工具生成

### Step 9.3 — package.json 脚本确认

确保 `package.json` 有以下脚本：

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build"
  }
}
```

**关键**：`"build": "tsc && vite build"` — Tauri build 依赖 `npm run build` 先构建前端，所以 `build` 脚本必须正确。

### Step 9.4 — .gitignore 确认

确保以下路径已忽略：

```gitignore
# 依赖
node_modules/

# 构建产物
dist/
src-tauri/target/

# 数据库文件（本地测试数据不提交）
data/

# IDE
.vscode/
.idea/

# 系统文件
.DS_Store
Thumbs.db
```

> 检查 `src-tauri/target/` 和 `data/` 是否已在 `.gitignore` 中。

### Step 9.5 — 构建前检查清单

在运行 `npm run tauri build` 之前确认：

- [ ] `tauri.conf.json` 的 `identifier` 已设置（不能是默认值 `com.tauri.dev`）
- [ ] `tauri.conf.json` 的 `version` 已设置（如 `0.1.0`）
- [ ] 图标文件存在于 `src-tauri/icons/`
- [ ] `npm run build` 能成功（前端 TypeScript + Vite 构建）
- [ ] `.gitignore` 包含 `src-tauri/target/`
- [ ] 磁盘空间充足（target 目录可能占 500MB–1GB）

### Step 9.6 — 执行本地构建

```bash
# 1. 前端构建
npm run build
# 预期：dist/ 目录生成 index.html + assets/

# 2. Tauri 构建
npm run tauri build
# 预期：编译 Rust → 打包 → 输出到 src-tauri/target/release/bundle/
```

**产物位置**：
```
src-tauri/target/release/bundle/
├── msi/
│   └── MC Mod Hub_0.1.0_x64_zh-CN.msi    — Windows MSI 安装包
├── nsis/
│   └── MC Mod Hub_0.1.0_x64-setup.exe     — NSIS 安装器
└── ...
```

### Step 9.7 — 构建后验证

1. 找到生成的 `.msi` 或 `.exe`
2. 双击安装
3. 启动应用 → 确认所有功能正常（搜索 / 热门 / 详情 / 收藏夹 / 设置）
4. 检查安装目录大小（目标 < 15MB，实际可能 10–20MB 含 WebView2 依赖）
5. 检查 `data/app.db` 和 `settings.json` 的存储位置（应在 `%APPDATA%/com.mcmodhub.light/data/` 下）

---

## 约束条件

- ❌ **不要**改任何功能代码——Step 9 只做打包配置
- ❌ **不要**升级 Tauri / Rust / npm 依赖版本（除非打包必须）
- ❌ **不要**做 GitHub Actions 配置——Step 10 做
- ✅ `identifier` 必须改（默认 `com.tauri.dev` 不能用于打包）
- ✅ 图标可先用占位图标，后续替换设计好的
- ✅ 如果 `npm run tauri build` 遇到 WebView2 相关错误，检查 Windows SDK 安装

---

## 常见问题

### Q: `cargo build` 时提示 `link.exe` 找不到？
确保安装了 Visual Studio Build Tools（含 C++ workload），且 PATH 中有 MSVC linker。

### Q: 打包后应用启动白屏？
检查 `tauri.conf.json` 的 `frontendDist` 路径是否正确（应为 `../dist`）。

### Q: `.msi` 安装时提示「未签名」？
本地构建包默认无数字签名，属正常现象。Step 10 的 GitHub Actions 中可以配置签名。

### Q: 打包体积超过 15MB？
WebView2 是系统组件不计入。实际 Rust 二进制约 5–8MB，前端 assets 约 1–3MB，总计 < 15MB。

---

## 完成后

完成后告诉我：
1. `npm run build` 是否成功
2. `npm run tauri build` 是否成功生成 `.msi` / `.exe`
3. 安装包大小（MB）
4. 安装后启动 → 功能是否正常
5. 实际执行中做了什么与计划不同的改动

---

## 应急方案说明

> Step 9 仅涉及打包配置，不涉及功能代码。如需插入新功能，请先读 `migration-plan.md` §12。
> E 级（架构变更）功能仅允许在 Step 10 之后插入。

**本对话只做 Step 9 的打包配置 + 本地构建验证，不做 GitHub Actions。**
