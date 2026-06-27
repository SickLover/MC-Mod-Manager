# 开发执行 Prompt — MC Mod Hub 轻量化版 Step 10（最终步）

> 具体产品需求请参考 `D:\vibe coding\projects\MC-Mod-Hub\requirements.md`，技术方案参考本目录 `technical-design.md`，迁移方案参考本目录 `migration-plan.md`，开发规则参考本目录 `AGENTS.md`。

---

## 项目背景

MC Mod Hub 轻量化版，基于 Tauri + Vite + React SPA。

- Step 1–8：全部 8 个页面功能完整就绪
- Step 9：Tauri 打包配置 + 本地 `.msi` / `.exe` 构建成功
- 补丁：6 个 UI/UX 修复（收藏按钮 / 返回键 / 热门 Tab 调整等）
- **当前**：只能本地构建安装包，每次发布需要手动操作

## 第十步目标（最终步）

**GitHub Actions CI/CD — 推送 tag 自动构建并发布 `.msi` / `.exe` 到 GitHub Releases。**

具体产出：
1. `.github/workflows/release.yml` — CI 工作流（Windows 构建 + 上传 Release）
2. `.gitignore` 确认（CI 不需要的路径已忽略）
3. 推送 `v0.1.0` tag → CI 自动触发 → Release 页面出现安装包

> Step 10 是最后一步。完成后项目可正式分发给朋友使用。

---

## 需要创建/修改的文件

### 新建文件

```
.github/workflows/release.yml   — GitHub Actions 自动构建发布
```

### 可能修改

```
.gitignore                      — 确认 CI 构建产物路径已忽略
```

---

## 开发步骤

### Step 10.1 — GitHub Actions Workflow

`.github/workflows/release.yml`：

```yaml
name: Build and Release

on:
  push:
    tags:
      - 'v*'           # 推送 v0.1.0, v1.0.0 等 tag 时触发
  workflow_dispatch:    # 允许手动触发

jobs:
  build:
    runs-on: windows-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Setup Rust
        uses: actions-rust-lang/setup-rust-toolchain@v1
        with:
          toolchain: stable
          target: x86_64-pc-windows-msvc

      - name: Install dependencies
        run: npm ci

      - name: Build frontend
        run: npm run build

      - name: Build Tauri (MSI + NSIS)
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: 'MC Mod Hub ${{ github.ref_name }}'
          releaseBody: |
            ## 更新内容
            - 见 [CHANGELOG.md](./CHANGELOG.md)

            ## 下载
            - **Windows**: 下载下方的 `.msi` 或 `.exe` 安装包
          releaseDraft: false
          prerelease: false
          args: '--target x86_64-pc-windows-msvc'
```

**关键配置**：
- `on.push.tags: ['v*']` — 推 tag 自动触发
- `windows-latest` — GitHub 提供 Windows Server 2022 runner（含 VS Build Tools + WebView2）
- `tauri-apps/tauri-action@v0` — Tauri 官方 Action，自动处理 Rust 编译 + 打包 + 上传 Release
- 不需要手动 `cargo build` — `tauri-action` 内部处理
- `GITHUB_TOKEN` 自动提供，无需额外配置

> ⚠️ 如果项目使用 npm（非 pnpm/yarn），`cache: 'npm'` 即可。`npm ci` 比 `npm install` 更快且确定性更强。

### Step 10.2 — .gitignore 确认

确保以下路径在 `.gitignore` 中：

```gitignore
# 已有（确认）
node_modules/
dist/
src-tauri/target/

# 补充（如果缺）
data/
*.msi
*.exe
release/
```

> CI 中 `tauri-action` 自动将构建产物上传到 Release，本地不需要提交这些二进制文件。

### Step 10.3 — 发布流程

```bash
# 1. 确保所有改动已提交
git add .
git commit -m "v0.1.0: 首次正式版本"

# 2. 打 tag
git tag v0.1.0

# 3. 推送代码 + tag
git push origin main
git push origin v0.1.0

# 4. 打开 GitHub Actions 页面查看构建进度
# https://github.com/<你的用户名>/mc-mod-hub-light/actions

# 5. 构建成功后在 Releases 页面看到安装包
# https://github.com/<你的用户名>/mc-mod-hub-light/releases
```

### Step 10.4 — 验证

1. 推送 tag 后打开 Actions 页面 → 确认 workflow 触发
2. 等待构建完成（约 10–20 分钟，首次更久因为要下载依赖）
3. 检查 Releases 页面 → 确认 `.msi` 和 `.exe` 已上传
4. 下载安装包 → 安装 → 启动 → 功能正常

---

## 常见问题

### Q: CI 构建失败：`link.exe` 找不到？
GitHub `windows-latest` runner 预装了 VS Build Tools。如果仍然失败，在 workflow 中加一步：
```yaml
- name: Install VS Build Tools
  run: choco install visualstudio2022buildtools --package-parameters "--add Microsoft.VisualStudio.Component.VC.Tools.x86.x64"
```

### Q: 构建超时？
首次构建需下载 Rust crates + 编译，约 10–20 分钟。后续有缓存会快很多。

### Q: Release 中没有文件？
检查 `tauri-action` 的 `tagName` 是否与推送的 tag 一致（`${{ github.ref_name }}`）。

### Q: 只有 `.msi` 没有 `.exe`？
`tauri.conf.json` 的 `bundle.targets` 需包含 `nsis`。如果是 `["msi"]` 则只生成 MSI。

---

## 约束条件

- ❌ **不要**改动任何功能代码——Step 10 只做 CI 配置
- ❌ **不要**在 CI 中配置代码签名（需要证书，v0.1 跳过）
- ✅ 使用 `tauri-apps/tauri-action@v0` 官方 Action（不要手写 cargo build 步骤）
- ✅ `releaseDraft: false` — 直接发布，不走草稿流程

---

## 完成后

完成后告诉我：
1. GitHub Actions workflow 是否成功触发
2. 构建是否通过（附 Actions 页面截图或链接）
3. Releases 页面是否有 `.msi` / `.exe`
4. 下载安装后功能是否正常
5. 实际执行中做了什么与计划不同的改动

---

## 🎉 10 步开发全部结束

这是最后一步。完成后：
- 所有功能页面就绪（8 页 + 搜索/热门/详情/下载/收藏夹/设置）
- 本地构建验证通过
- GitHub Actions 自动发布流程就绪
- 项目可从 GitHub Releases 下载安装包分发给朋友

**感谢完成 MC Mod Hub 轻量化版的全部开发！**
