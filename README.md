# MC Mod Manager

Minecraft Mod/光影/资源包桌面管理工具。从 CurseForge 和 Modrinth 搜索、管理收藏夹、批量下载。

**Tauri + React SPA** — 启动快、内存低、包体小。

## 特性

- 🔍 **双平台搜索** — CurseForge + Modrinth 并发搜索，去重合并
- 📁 **收藏夹管理** — 创建/重命名/删除收藏夹，右键添加资源
- ✅ **兼容性检测** — 游戏版本 + Mod 加载器交集分析
- 📦 **批量下载** — ZIP 打包 / 文件夹，进度推送
- 📤 **清单导出/导入** — JSON 格式（`name` + `loader`），跨设备迁移

## 配置

首次启动后，在设置页填入 CurseForge API Key（从 [CurseForge Developer Console](https://console.curseforge.com) 获取）。Modrinth 无需 Key。

设置文件保存在 `%APPDATA%/com.mcmodhub.light/settings.json`。

## 许可

MIT
