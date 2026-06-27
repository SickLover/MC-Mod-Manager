# AGENTS.md — MC Mod Hub 轻量化版

Minecraft Mod/光影/材质包桌面管理工具，基于 Tauri + Vite + React SPA，从 CurseForge 和 Modrinth 搜索资源、管理收藏夹、批量下载。从 MC Mod Hub（Electron + Next.js）功能对等迁移而来。

## 文件分类管理

```
mc-mod-hub-light/
├── prompt.md                   # 【活跃文件】当前 Step 的专属 prompt
├── prompts/                    # 【归档目录】历史 step prompt
│   ├── step-01.md              # Step 1 prompt（已执行）
│   ├── step-02.md              # Step 2 prompt（下一轮写入）
│   └── ...
├── requirements.md             # 产品需求（从 MC-Mod-Hub 复制，只读）
├── technical-design.md         # 技术方案（只读参考）
├── migration-plan.md           # 迁移方案 + 应急方案（只读参考）
├── AGENTS.md                   # 本文件 — 开发规则 + 工作流约定
│
├── (以下为 Step 1 之后逐步产生的代码文件)
├── package.json / vite.config.ts / index.html ...
├── src-tauri/  ...
└── src/  ...
```

**文件分类规则**：

| 类型 | 位置 | 特性 |
|------|------|------|
| **活跃 prompt** | `prompt.md`（根目录） | **唯一活跃文件** — 每轮对话唯一需要读取的文件 |
| **prompt 归档** | `prompts/step-0X.md` | 只读存档，复盘用 |
| **项目文档** | `requirements.md` / `technical-design.md` / `migration-plan.md` | 只读参考 |
| **AI 规则** | `AGENTS.md` | 只读规则 |
| **源代码** | `src/` / `src-tauri/` | 逐步产出 |

## 工作流约定（核心流程）

```
每轮对话 = 3 步循环：

1. 你粘贴 prompt.md 全部内容到一个新对话
2. AI 按 prompt.md 指令执行该 Step
3. 完成后你在此对话说"我完成了 Step X"
   → AI 执行：
     a) 把 prompt.md 复制为 prompts/step-0X.md（存档）
     b) 覆盖写入 prompt.md 为 Step X+1 的专属 prompt
     c) 更新 AGENTS.md 的"当前进度"状态
   → 你开新对话，粘贴新的 prompt.md，进入下一轮
```

**关键规则**：
- 每轮只需发一个文件：`prompt.md`
- 不需要手动翻 `technical-design.md` 找 prompt — prompt.md 是自包含的
- `prompts/` 目录永远只增不减，复盘时直接打开看任意一步

## 当前进度

| 项目 | 状态 |
|------|------|
| 当前 Step | **Step 10（最终步）**（prompt.md 内容 = GitHub Actions CI/CD） |
| 已完成 | Step 1–9（全部页面 + 打包）+ 补丁（6 个修复）+ Code Review（0 Critical / 2 Major / 5 Minor） |
| 下一轮 | 你说"我完成了 Step 10" → 项目完结 🎉 |

## 项目背景

- 这是一个 **Windows 桌面软件**，不是网页
- 用户是国内 Minecraft 玩家，小范围朋友间使用
- 不需要登录，所有数据存本地电脑
- 第一版从 MC-Mod-Hub（Electron + Next.js）**功能对等照搬**
- 目标：启动 < 2 秒、内存 < 80MB、打包 < 15MB（对比原版 6-10s / 150-300MB / 150MB）

## 技术栈约定

- **桌面框架**：Tauri 2.x（Rust 后端 + 系统 WebView2）
- **前端**：Vite + React 18 SPA + TypeScript strict 模式
- **路由**：react-router-dom v6 声明式路由
- **样式**：Tailwind CSS + Minecraft 暗色主题（苦力怕绿 `#5a9e3a`）
- **Rust 后端**：Tauri Commands（搜索/下载/数据库/API 调用全部在 Rust 端）
- **数据库**：SQLite（rusqlite bundled feature），通过 `src-tauri/src/db.rs` 统一访问
- **HTTP 客户端**：reqwest（Rust 端调 CurseForge / Modrinth API）
- **序列化**：serde + serde_json（Rust struct ↔ JSON，与前端 types 对等）
- **打包**：Tauri bundler，输出 .msi/.exe
- **外部 API**：CurseForge（需 Key）+ Modrinth（无需 Key）

## 关键路径别名

| 名称 | 路径 | 说明 |
|------|------|------|
| `@/` | `src/` | 前端导入别名（if vite.config.ts 配置） |
| `src-tauri/` | Tauri Rust 工程 | `cargo` 命令在此目录运行 |
| `src/` | Vite React 前端 | `npm run dev` 启动 Vite 开发服务器 |
| `MC-Mod-Hub ref` | `D:\vibe coding\projects\MC-Mod-Hub\` | 原始 Electron 项目，所有功能照搬来源 |

## 目录结构约定

- `src-tauri/` — Tauri Rust 后端（Cargo.toml、tauri.conf.json、src/）
  - `src-tauri/src/commands/` — Tauri Commands（每个 command 模块对应一个原 API Route）
  - `src-tauri/src/curseforge.rs` — CurseForge API 客户端
  - `src-tauri/src/modrinth.rs` — Modrinth API 客户端
  - `src-tauri/src/merger.rs` — 两平台结果合并去重
  - `src-tauri/src/db.rs` — SQLite 数据库操作
  - `src-tauri/src/types.rs` — Rust 数据结构
- `src/` — Vite React 前端
  - `src/components/` — React 组件，按功能分 `layout/` `home/` `resource/` `collection/` `common/`
  - `src/pages/` — 页面组件（对应原 `src/app/` 下的 page.tsx）
  - `src/lib/` — 前端工具（大部分逻辑已迁到 Rust 端）
  - `src/types/` — TypeScript 接口定义
- `public/` — 静态资源（图标）
- 根目录放前端配置文件（`vite.config.ts`、`tailwind.config.ts`、`tsconfig.json`）

## 代码风格约定

- **组件**：函数式组件 + Hooks。纯客户端组件（SPA 无 SSR）
- **命名**：组件 PascalCase（`SearchBar.tsx`），工具 camelCase，Rust 用 snake_case
- **类型**：精确接口定义在 `src/types/index.ts`（从 MC-Mod-Hub 直接复制），禁止 `any`
- **Rust 类型**：`src-tauri/src/types.rs` 与 `src/types/index.ts` 对等（同名字段，camelCase serde rename）
- **API 响应**：Rust command 返回 `Result<T, String>`，前端通过 try/catch 处理
- **导入**：前端统一用相对路径或 `@/` 别名
- **一个文件只做一件事**，新功能新建文件
- **删除 `'use client'`**：SPA 天然全是客户端组件

## UI 风格约定（完全沿用 MC-Mod-Hub）

从 MC-Mod-Hub 直接复制以下文件，不改动 UI 风格：

- `tailwind.config.ts` — 含 `creeper` / `surface` / `border` / `mc-*` 全部色板
- `src/globals.css` — 暗色主题 + 滚动条 + 动画 + 全局样式

**色板约定**：
- **主色**：苦力怕绿 `mc-green`（`#5a9e3a`）、`mc-green-light`（`#7ec850`）、`mc-green-dark`（`#3d6e25`）
- **背景**：`mc-bg`（`#1a1a1a` 全局）、`mc-card`（`#252525` 卡片）、`mc-card-hover`（`#2a2a2a` 悬停）
- **文字**：`mc-text`（`#e5e5e5` 正文）、`mc-muted`（`#9ca3af` 次要）
- **动画**：transition `duration-200`，卡片悬停上浮 4px
- **圆角**：`rounded-mc`（0.75rem）用于卡片，`rounded-md` 用于按钮
- 只做暗色主题，不做切换

## 数据库约定

- 所有数据库操作通过 `src-tauri/src/db.rs` 的 rusqlite 封装
- **不得**在前端直接操作 SQLite
- 前端通过 Tauri `invoke()` 调用 Rust command，由 command 内部操作数据库
- 表结构从 MC-Mod-Hub 照搬（3 张表：collections / collection_items / recently_viewed）
- 数据库文件位置：开发环境 `data/app.db`，生产环境 Tauri `app_data_dir()/data/app.db`

## Tauri 约定

- **Command 即 API**：Rust 端的所有对外接口都是 `#[tauri::command]`
- **所有外部 API 调用在 Rust 端**：前端不直接 fetch CurseForge/Modrinth（CORS + API Key 安全）
- **下载在 Rust 端**：reqwest 流式下载 → 写入本地文件，不经过浏览器 blob
- **AppState 共享**：`reqwest::Client`（连接池）、`rusqlite::Connection`（Mutex 包裹）、Settings 缓存
- **新加功能**：在 `src-tauri/src/commands/` 新建模块 → 在 `main.rs` 注册 command
- **安全策略**：tauri.conf.json 配置 CSP 允许加载外部图片（CurseForge/Modrinth CDN）

## 从 MC-Mod-Hub 照搬的规则

### 文件复制清单

| 目标 | 来源 | 改造 |
|------|------|------|
| `src/types/index.ts` | MC-Mod-Hub `src/types/index.ts` | 直接复制 |
| `tailwind.config.ts` | MC-Mod-Hub `tailwind.config.ts` | content 路径改 `./src/**/*.{ts,tsx}` |
| `src/globals.css` | MC-Mod-Hub `src/app/globals.css` | 直接复制 |
| `src/lib/format.ts` | MC-Mod-Hub `src/lib/format.ts` | 直接复制 |
| `src/components/**/*.tsx` (18个) | MC-Mod-Hub `src/components/` | 改路由链接 + 改数据获取 |
| `src/pages/*.tsx` (7个页面) | MC-Mod-Hub `src/app/` 对应 page.tsx | 提取逻辑 + 删除 SSR 代码 |
| `src-tauri/src/curseforge.rs` | MC-Mod-Hub `src/lib/curseforge.ts` | JS→Rust，逻辑照搬 |
| `src-tauri/src/modrinth.rs` | MC-Mod-Hub `src/lib/modrinth.ts` | JS→Rust，逻辑照搬 |
| `src-tauri/src/merger.rs` | MC-Mod-Hub `src/lib/merger.ts` | JS→Rust，逻辑照搬 |
| `src-tauri/src/db.rs` | MC-Mod-Hub `src/lib/db.ts` | sql.js→rusqlite，表结构照搬 |

### 组件适配规则

| 原代码 | 新代码 | 使用场景 |
|--------|--------|---------|
| `import Link from 'next/link'` | `import { Link } from 'react-router-dom'` | 路由链接 |
| `next/navigation useRouter()` | `react-router-dom useNavigate()` | 编程式导航 |
| `next/navigation usePathname()` | `react-router-dom useLocation()` | 当前路径判断 |
| `next/navigation useParams()` | `react-router-dom useParams()` | 路径参数 |
| `next/navigation useSearchParams()` | `react-router-dom useSearchParams()` | URL 参数 |
| `'use client'` | **删除** | SPA 无需此指令 |
| `fetch('/api/xxx')` | `invoke('xxx', { ... })` | 数据获取 |
| `URL.createObjectURL(blob)` | `invoke('download_file', {...})` | 文件下载 |

## 开发流程约定

1. **先理解，再动手**：修改前先读原始 MC-Mod-Hub 对应文件，理解现有逻辑
2. **最小改动**：只改和当前任务相关的文件，不修改不相关的代码
3. **逐步验证**：新增 command → `cargo check` → 前端 invoker → Vite HMR 验证
4. **保持干净**：不引入不需要的 Cargo crate 或 npm 包
5. **先跑通一条链路**：搜索输入 → Tauri command → Rust reqwest → CF/MR API → JSON 返回 → 前端渲染

## 分步开发规则

本项目分 10 步开发，当前对话只执行其中一步。详细步骤说明见 `migration-plan.md` 第 10 节。

- 每个对话只完成一个步骤的内容
- 完成当前步骤后，不需要考虑下一步
- 如果当前步骤提到"占位页"，只需做显示标题的最简页面
- 如果当前步骤涉及 Rust 端，先确保 `cargo check` 通过再调前端
- **严格顺序执行，不允许跳步**
- **每步结束后代码必须可运行**——不累积到后面修

## 新功能开发规则（应急方案）

当需要在开发中途插入新功能时，必须先阅读 `migration-plan.md` 第 12 节的完整应急方案。关键要点：

### 功能分级

| 级别 | 可插入时机 | 示例 |
|------|-----------|------|
| A 级（纯前端UI） | 任意 Step 后 | 主题切换、排序选项 |
| B 级（读操作） | Step 2 后 | 按条件筛选列表 |
| C 级（写操作） | Step 2 后 | 导出收藏夹 JSON |
| D 级（新外部API） | Step 2 后 | 接入新平台 |
| E 级（架构变更） | 仅 Step 10 后 | 改数据库表结构 |

### 新功能铁律

- ✅ **只追加，不修改**：新文件 + 在注册文件末尾加行
- ✅ **不改已有类型**：types 末尾追加 interface
- ✅ **不改已有表**：数据库新表独立 CREATE
- ✅ **先读应急方案**：`migration-plan.md` §12 有完整 SOP
- ❌ **不看应急方案就动手**：会破坏现有结构
- ❌ **改已有文件**（除了 mod.rs / main.rs / App.tsx 的注册行）
- ❌ **在 Step 2 前插入 C/D/E 级功能**：Rust 端还没建立好

### 新功能开发前必须同步更新文档

| 文档 | 更新什么 |
|------|---------|
| `migration-plan.md` §12 | 新功能类型 + 插入点 |
| `technical-design.md` §12 | 技术方案 + rust struct |
| `AGENTS.md` | 本节 + 禁止行为 |
| 当前对话的 `prompt.md` | 新功能需求 + 插入条件 |

## 禁止行为

- ❌ **不要**随意改动与当前任务无关的文件
- ❌ **不要**擅自更换技术栈（不用 Electron、不用 Next.js、不用 Vue、不用其他框架）
- ❌ **不要**引入 shadcn/ui 或任何组件库——用 MC-Mod-Hub 已有的手写组件
- ❌ **不要**引入不必要的新依赖（npm 或 Cargo crate）
- ❌ **不要**过度设计——第一版就是功能对等迁移，不增不减
- ❌ **不要**在代码里硬编码 API Key
- ❌ **不要**删除已有的功能代码（除非明确要求砍掉）
- ❌ **不要**在前端直接调用 CurseForge / Modrinth API——必须通过 Tauri command
- ❌ **不要**修改已有数据库表结构（3 张表原样迁移）
- ❌ **不要**跨步骤开发——本对话只做分配的那一步
- ❌ **不要**在不读 `migration-plan.md` §12 的情况下插入新功能
- ❌ **不要**修改已有类型的字段（types/index.ts / types.rs）——只能追加新 interface/struct
- ❌ **不要**在已有组件内添加与新功能无关的逻辑

## 测试与验证要求

- 每完成一个功能模块，先 `cargo check` 确保 Rust 端编译通过
- 然后 `npm run dev` 启动 Vite 确认前端无编译错误
- 在 Tauri 窗口中手动点一遍流程验证
- 验证数据持久化（关闭重开数据还在）

## 每次改动后

简要说明：
1. 改了什么（文件列表 + 改动类型：新建/修改/复制）
2. 为什么改（对应哪个需求或迁移目标）
3. 如何验证（cargo check + 手动测试步骤）

---

## 遇到不确定的问题时

- **产品问题**：参考 MC-Mod-Hub 的 `requirements.md`（`D:\vibe coding\projects\MC-Mod-Hub\requirements.md`）
- **功能边界**：打开 MC-Mod-Hub 的对应文件，看原版怎么做
- **技术问题**：参考本目录的 `technical-design.md` 和 `migration-plan.md`
- **文档冲突**：以 `technical-design.md` 为准
- **步骤范围问题**：如果不确定某个功能是否属于当前步骤，先确认再动手
- **UI 细节**：直接打开 MC-Mod-Hub 的 `src/components/` 对应组件文件照搬
