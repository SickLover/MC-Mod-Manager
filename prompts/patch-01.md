# 补丁 Prompt — Code Review 修复（7 个问题）

> 基于深度 Code Review 发现的问题修复。覆盖 1 个 Bug + 6 个质量/安全问题。
> 每个问题独立、改动面小，按优先级排列。

---

## 当前项目状态

全部 8 个页面 + 打包配置已完成。以下文件需要修改：

```
src-tauri/src/db.rs                          — 问题 1（Bug 修复）
src-tauri/src/lib.rs                         — 问题 2（HTTP 超时）
src-tauri/src/commands/download.rs           — 问题 3（路径穿越）
src-tauri/src/commands/batch_download.rs     — 问题 3 + 6（路径穿越 + ZIP 内存优化）
src-tauri/src/commands/search.rs             — 问题 4（错误日志）
src-tauri/src/commands/popular.rs            — 问题 4（错误日志）
src-tauri/src/commands/category.rs           — 问题 4（错误日志）
```

> ⚠️ 本补丁只涉及 Rust 后端文件，不改前端。

---

## 问题清单与修复方案

### 问题 1 🔴 Bug — `list_recently_viewed` 字段映射错位

**现象**：`db.rs` 的 `list_recently_viewed` 方法中，SQL SELECT 列顺序与 `row.get()` 索引不对应，导致返回的 `ResourceItem` 字段全部错位（`name` 得到的是 `summary`，`icon_url` 得到的是 `resource_type` 等）。

**根因**：
- SELECT 列顺序: `resource_id, source, name, summary, icon_url, resource_type`
- row.get 索引: `0→id, 1→source, 2→resource_type(错!), 3→name(错!), 4→summary(错!), 5→icon_url(错!)`

**修复**：更正 row.get 索引，使其匹配 SELECT 列顺序。

**文件**：`src-tauri/src/db.rs`，`list_recently_viewed` 方法（约第 290–304 行）

**改动**：

```rust
// 修改前（290–304 行）：
let rows = stmt.query_map(params![limit], |row| {
    Ok(ResourceItem {
        id: row.get(0)?,
        source: row.get(1)?,
        resource_type: row.get::<_, String>(2).unwrap_or_else(|_| "mod".into()),
        name: row.get::<_, String>(3).unwrap_or_default(),
        summary: row.get::<_, String>(4).unwrap_or_default(),
        icon_url: row.get(5)?,
        download_count: 0,
        author: String::new(),
        categories: vec![],
        game_versions: vec![],
        created_at: String::new(),
        updated_at: String::new(),
    })
})

// 修改后（修正 row.get 索引）：
let rows = stmt.query_map(params![limit], |row| {
    Ok(ResourceItem {
        id: row.get(0)?,                                            // resource_id
        source: row.get(1)?,                                        // source
        name: row.get::<_, String>(2).unwrap_or_default(),          // name ← 修正
        summary: row.get::<_, String>(3).unwrap_or_default(),       // summary ← 修正
        icon_url: row.get(4)?,                                      // icon_url ← 修正
        resource_type: row.get::<_, String>(5).unwrap_or_else(|_| "mod".into()), // resource_type ← 修正
        download_count: 0,
        author: String::new(),
        categories: vec![],
        game_versions: vec![],
        created_at: String::new(),
        updated_at: String::new(),
    })
})
```

> 字段对应关系：索引 0=resource_id, 1=source, 2=name, 3=summary, 4=icon_url, 5=resource_type。

---

### 问题 2 🟠 HTTP 请求无超时

**现象**：`reqwest::Client::new()` 未设置超时。如 CurseForge/Modrinth API 挂起，用户界面将无限等待。

**修复**：使用 `ClientBuilder` 设置 30 秒超时。

**文件**：`src-tauri/src/lib.rs`，`run()` 函数 setup 闭包内（约第 43 行）

**改动**：

```rust
// 修改前：
http_client: reqwest::Client::new(),

// 修改后：
http_client: reqwest::Client::builder()
    .timeout(std::time::Duration::from_secs(30))
    .build()
    .expect("创建 HTTP 客户端失败"),
```

---

### 问题 3 🟠 下载路径穿越风险

**现象**：`download.rs` 和 `batch_download.rs` 中直接使用 `download_dir.join(&file_name)`，如果 `file_name` 包含 `../` 序列（如 `../../Windows/system32/evil.dll`），`PathBuf::join()` 会解析路径穿越，将文件写入任意目录。

**修复**：在 join 前从 `file_name` 提取纯文件名，丢弃路径部分。

**文件**：
- `src-tauri/src/commands/download.rs`（约第 59 行）
- `src-tauri/src/commands/batch_download.rs`（约第 64 行）

**改动**：

**download.rs** — 在 `let dest_path = download_dir.join(&file_name);` 之前插入安全处理：

```rust
// 在 let dest_path = download_dir.join(&file_name); 之前插入：
let safe_name = std::path::PathBuf::from(&file_name)
    .file_name()
    .unwrap_or_else(|| std::ffi::OsStr::new("unknown"))
    .to_string_lossy()
    .to_string();
let dest_path = download_dir.join(&safe_name);
```

同时删除原来的 `let dest_path = download_dir.join(&file_name);` 行（或改为使用 `safe_name`）。

**batch_download.rs** — 同样在 `let dest = temp_dir.join(&file.file_name);` 之前插入：

```rust
// 在 let dest = temp_dir.join(&file.file_name); 之前插入：
let safe_name = std::path::PathBuf::from(&file.file_name)
    .file_name()
    .unwrap_or_else(|| std::ffi::OsStr::new("unknown"))
    .to_string_lossy()
    .to_string();
let dest = temp_dir.join(&safe_name);
```

删除原来的 `let dest = temp_dir.join(&file.file_name);` 行。

---

### 问题 4 🟡 API 错误静默吞没

**现象**：`search.rs`、`popular.rs`、`category.rs` 中对 CF/MR API 调用使用了 `unwrap_or_default()`，导致 API 错误（403 Key 无效、500 服务端错误）被完全丢弃，用户看不到任何错误提示。

**修复**：至少将错误记录到 stderr，让开发者/用户能通过终端日志排查问题。

**文件**：
- `src-tauri/src/commands/search.rs`（第 25–26 行）
- `src-tauri/src/commands/popular.rs`（第 21–22 行）
- `src-tauri/src/commands/category.rs`（第 28–29 行）

**改动**：

**search.rs** — 将：
```rust
let cf = cf_result.unwrap_or_default();
let mr = mr_result.unwrap_or_default();
```
改为：
```rust
let cf = match cf_result {
    Ok(r) => r,
    Err(e) => { eprintln!("[search] CurseForge 搜索失败: {}", e); vec![] }
};
let mr = match mr_result {
    Ok(r) => r,
    Err(e) => { eprintln!("[search] Modrinth 搜索失败: {}", e); vec![] }
};
```

**popular.rs** — 将：
```rust
let cf_list = cf_result.unwrap_or_default();
let mr_list = mr_result.unwrap_or_default();
```
改为：
```rust
let cf_list = match cf_result {
    Ok(r) => r,
    Err(e) => { eprintln!("[popular] CurseForge 请求失败: {}", e); vec![] }
};
let mr_list = match mr_result {
    Ok(r) => r,
    Err(e) => { eprintln!("[popular] Modrinth 请求失败: {}", e); vec![] }
};
```

**category.rs** — 将：
```rust
let cf_results = cf.unwrap_or_default();
let mr_results = mr.unwrap_or_default();
```
改为：
```rust
let cf_results = match cf {
    Ok(r) => r,
    Err(e) => { eprintln!("[category] CurseForge 请求失败: {}", e); vec![] }
};
let mr_results = match mr {
    Ok(r) => r,
    Err(e) => { eprintln!("[category] Modrinth 请求失败: {}", e); vec![] }
};
```

---

### 问题 5 🟡 Mutex 锁 panic 传播风险

**现象**：`db.rs` 中有 9 处 `self.conn.lock().unwrap()`。如果有线程 panic 导致 Mutex 被毒化（poisoned），后续所有 lock 都会 panic，进程崩溃。由于 SQLite 连接在持有锁期间只做查询操作，poison 后恢复是安全的。

**修复**：用 `unwrap_or_else(|e| e.into_inner())` 替换 `unwrap()`，从 poisoned 状态恢复。

**文件**：`src-tauri/src/db.rs`，全部 9 处 `self.conn.lock().unwrap()`

**改动**：将全部 9 处：
```rust
let conn = self.conn.lock().unwrap();
```
改为：
```rust
let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
```

> 影响范围：`list_collections`、`create_collection`、`update_collection`、`delete_collection`、`add_item`、`remove_item`、`list_items`、`record_recently_viewed`、`list_recently_viewed` 共 9 个方法。

---

### 问题 6 🟡 批量下载 ZIP 将大文件全量加载到内存

**现象**：`batch_download.rs` 中打包 ZIP 时使用 `std::fs::read(&path)` 将整个文件读入内存再写入 ZIP。如果有 100MB+ 的 Mod 文件，批量下载多个可能导致 OOM。

**修复**：使用 `std::io::copy` 流式复制代替全量读取。

**文件**：`src-tauri/src/commands/batch_download.rs`（约第 103–106 行）

**改动**：将：
```rust
let data = std::fs::read(&path)
    .map_err(|e| format!("读取文件失败: {}", e))?;
zip_writer.write_all(&data)
    .map_err(|e| format!("zip 写入失败: {}", e))?;
```
改为：
```rust
let mut f = std::fs::File::open(&path)
    .map_err(|e| format!("读取文件失败: {}", e))?;
std::io::copy(&mut f, &mut zip_writer)
    .map_err(|e| format!("zip 写入失败: {}", e))?;
```

---

### 问题 7 🟢 未使用参数 `_game_versions`

**现象**：`modrinth.rs` 的 `get_project_versions` 函数接受 `_game_versions: &[String]` 参数但未使用。

**修复**：移除该参数，简化调用方。

**文件**：
- `src-tauri/src/modrinth.rs`（第 267–271 行，函数签名）
- `src-tauri/src/commands/resource.rs`（第 33 行，调用方）

**改动**：

**modrinth.rs** — 函数签名从：
```rust
pub async fn get_project_versions(
    client: &Client,
    project_id: &str,
    _game_versions: &[String],
) -> Result<Vec<ModFile>, String> {
```
改为：
```rust
pub async fn get_project_versions(
    client: &Client,
    project_id: &str,
) -> Result<Vec<ModFile>, String> {
```

**resource.rs** — 调用处从：
```rust
crate::modrinth::get_project_versions(&state.http_client, &id, &[]),
```
改为：
```rust
crate::modrinth::get_project_versions(&state.http_client, &id),
```

---

## 改动文件汇总

| 文件 | 问题 | 改动类型 |
|------|------|---------|
| `src-tauri/src/db.rs` | #1 + #5 | Bug 修复（索引错位）+ 9 处 unwrap→unwrap_or_else |
| `src-tauri/src/lib.rs` | #2 | ClientBuilder 加 30s 超时 |
| `src-tauri/src/commands/download.rs` | #3 | 文件名安全提取 |
| `src-tauri/src/commands/batch_download.rs` | #3 + #6 | 文件名安全提取 + ZIP 流式写入 |
| `src-tauri/src/commands/search.rs` | #4 | unwrap_or_default → match + eprintln |
| `src-tauri/src/commands/popular.rs` | #4 | unwrap_or_default → match + eprintln |
| `src-tauri/src/commands/category.rs` | #4 | unwrap_or_default → match + eprintln |
| `src-tauri/src/modrinth.rs` | #7 | 移除未用参数 _game_versions |
| `src-tauri/src/commands/resource.rs` | #7 | 调用方适配 |

---

## 验证步骤

```bash
# 1. Rust 编译检查
cd src-tauri && cargo check

# 2. 如通过，完整构建验证
cargo build

# 3. 前端无改动，但仍可确认无 TS 错误
npx tsc --noEmit

# 4. 手动功能验证（npm run tauri dev）
```

**验证清单**：
- [ ] `cargo check` 零错误零警告
- [ ] 首页「最近浏览」模块正确显示资源名称、图标、类型（之前字段错位）
- [ ] 搜索 Modrinth 资源（不填 CF API Key）正常返回结果
- [ ] 填写无效 CF API Key 后搜索 → 终端有 `[search] CurseForge 搜索失败:` 日志
- [ ] 下载一个 Mod → 文件保存到正确目录，文件名不含路径
- [ ] 批量下载 ZIP 模式 → ZIP 正常生成，文件内容完整
- [ ] 详情页正常展示（resource.rs 调用适配后）

---

## 约束条件

- ❌ **不要**改动任何前端文件（`.tsx` / `.ts` / `.css`）
- ❌ **不要**改动数据库表结构
- ❌ **不要**修改 API 调用逻辑（只改错误处理方式，不改业务逻辑）
- ❌ **不要**新增 Cargo crate 依赖
- ✅ 所有改动最小化——每个问题只改目标位置的几行代码
- ✅ `cargo check` 必须在每一步改动后通过

**本对话只做这 7 个修复，不做其他功能。**
