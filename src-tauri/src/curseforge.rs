use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;
use crate::types::{ModFile, ResourceDetail, ResourceItem};

/// 反序列化可能为 null 或数组的值 → Vec<String>
/// serde #[serde(default)] 只处理 field 缺失，不处理 null 值
fn deserialize_nullable_vec<'de, D>(deserializer: D) -> Result<Vec<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    match Option::<Vec<Value>>::deserialize(deserializer)? {
        None => Ok(vec![]),
        Some(arr) => {
            let strs: Vec<String> = arr
                .into_iter()
                .filter_map(|v| match v {
                    Value::String(s) => Some(s),
                    Value::Number(n) => Some(n.to_string()),
                    _ => None,
                })
                .collect();
            Ok(strs)
        }
    }
}

/// 反序列化可能为 null 或数字的值 → 0
fn deserialize_nullable_u64<'de, D>(deserializer: D) -> Result<u64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    match Option::<Value>::deserialize(deserializer)? {
        None => Ok(0),
        Some(Value::Number(n)) => n.as_u64().ok_or_else(|| serde::de::Error::custom("expected u64")),
        Some(Value::String(s)) => s.parse::<u64>().or(Ok(0)),
        _ => Ok(0),
    }
}

/// 反序列化可能为 null 或数组的 Vec<T> → 空 vec
fn deserialize_nullable_vec_any<'de, D, T>(deserializer: D) -> Result<Vec<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: serde::de::DeserializeOwned,
{
    match Option::<Vec<T>>::deserialize(deserializer)? {
        None => Ok(vec![]),
        Some(arr) => Ok(arr),
    }
}

/// 反序列化可能为 null 或字符串的值 → ""
fn deserialize_nullable_string<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    match Option::<String>::deserialize(deserializer)? {
        None => Ok(String::new()),
        Some(s) => Ok(s),
    }
}

const API_BASE: &str = "https://api.curseforge.com";
const GAME_ID: u32 = 432;

// ---- CurseForge API 响应结构体 ----

#[derive(Debug, Deserialize)]
pub struct CfLogo {
    pub url: String,
}

#[derive(Debug, Deserialize)]
pub struct CfAuthor {
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct CfCategory {
    pub name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CfFile {
    #[serde(default)]
    pub game_versions: Vec<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CfLinks {
    #[serde(default)]
    pub website_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CfMod {
    pub id: u64,
    pub name: String,
    pub summary: String,
    pub logo: Option<CfLogo>,
    #[serde(default)]
    pub download_count: u64,
    #[serde(default)]
    pub authors: Vec<CfAuthor>,
    #[serde(default)]
    pub categories: Vec<CfCategory>,
    pub class_id: u32,
    pub slug: String,
    #[serde(default)]
    pub date_created: String,
    #[serde(default)]
    pub date_modified: String,
    #[serde(default)]
    pub latest_files: Vec<CfFile>,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub links: CfLinks,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CfPagination {
    pub total_count: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CfSearchResponse {
    pub data: Vec<CfMod>,
    pub pagination: CfPagination,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CfModResponse {
    pub data: CfMod,
}

// ---- 文件列表 API 响应 ----

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CfModLoader {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub is_default: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CfFileEntry {
    pub id: u64,
    #[serde(default, deserialize_with = "deserialize_nullable_string")]
    pub display_name: String,
    #[serde(default, deserialize_with = "deserialize_nullable_string")]
    pub file_name: String,
    #[serde(default, deserialize_with = "deserialize_nullable_vec")]
    pub game_versions: Vec<String>,
    #[serde(default, deserialize_with = "deserialize_nullable_vec_any")]
    pub mod_loaders: Vec<CfModLoader>,
    #[serde(default, deserialize_with = "deserialize_nullable_u64")]
    pub release_type: u64, // 1=Release, 2=Beta, 3=Alpha
    #[serde(default, deserialize_with = "deserialize_nullable_u64")]
    pub file_length: u64,
    pub download_url: Option<String>,
    #[serde(default, deserialize_with = "deserialize_nullable_u64")]
    pub download_count: u64,
    #[serde(default, deserialize_with = "deserialize_nullable_string")]
    pub file_date: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CfFilesResponse {
    pub data: Vec<CfFileEntry>,
}

// ---- 下载 URL 响应 ----

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CfDownloadUrlData {
    pub download_url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CfDownloadUrlResponse {
    pub data: CfDownloadUrlData,
}

// ---- 类型映射 ----

/// classId → ResourceType (CurseForge API 实际映射)
fn map_class_to_type(class_id: u32) -> &'static str {
    match class_id {
        6 => "mod",
        4471 => "modpack",
        12 => "resourcepack",
        6552 => "shader",
        17 => "world",
        4546 => "datapack",
        _ => "mod",
    }
}

/// CfMod → ResourceItem（搜索用）
fn to_resource_item(mod_: &CfMod) -> ResourceItem {
    ResourceItem {
        id: mod_.id.to_string(),
        source: "curseforge".to_string(),
        resource_type: map_class_to_type(mod_.class_id).to_string(),
        name: mod_.name.clone(),
        summary: mod_.summary.clone(),
        icon_url: mod_.logo.as_ref().map(|l| l.url.clone()),
        download_count: mod_.download_count,
        author: mod_
            .authors
            .first()
            .map(|a| a.name.clone())
            .unwrap_or_else(|| "Unknown".to_string()),
        categories: mod_.categories.iter().map(|c| c.name.clone()).collect(),
        game_versions: mod_
            .latest_files
            .first()
            .map(|f| f.game_versions.clone())
            .unwrap_or_default(),
        created_at: mod_.date_created.clone(),
        updated_at: mod_.date_modified.clone(),
    }
}

/// CfMod → ResourceDetail（详情用）
fn to_resource_detail(mod_: &CfMod) -> ResourceDetail {
    ResourceDetail {
        id: mod_.id.to_string(),
        source: "curseforge".to_string(),
        resource_type: map_class_to_type(mod_.class_id).to_string(),
        name: mod_.name.clone(),
        summary: mod_.summary.clone(),
        description: mod_.description.clone(),
        icon_url: mod_.logo.as_ref().map(|l| l.url.clone()),
        download_count: mod_.download_count,
        author: mod_
            .authors
            .first()
            .map(|a| a.name.clone())
            .unwrap_or_else(|| "Unknown".to_string()),
        categories: mod_.categories.iter().map(|c| c.name.clone()).collect(),
        game_versions: mod_
            .latest_files
            .first()
            .map(|f| f.game_versions.clone())
            .unwrap_or_default(),
        created_at: mod_.date_created.clone(),
        updated_at: mod_.date_modified.clone(),
        files: vec![],
        url: mod_.links.website_url.clone(),
    }
}

/// 已知的加载器关键字（不区分大小写）
const LOADER_KEYWORDS: &[&str] = &[
    "forge", "fabric", "neoforge", "quilt", "rift", "liteloader",
    "server", "client", "bukkit", "spigot", "paper",
];

/// 判断是否是加载器名称
fn is_loader(value: &str) -> bool {
    LOADER_KEYWORDS.iter().any(|kw| value.eq_ignore_ascii_case(kw))
}

/// CfFileEntry → ModFile
fn to_mod_file(file: &CfFileEntry) -> ModFile {
    let release_type = match file.release_type {
        1 => "release",
        2 => "beta",
        3 => "alpha",
        _ => "release",
    };

    // 从 game_versions 中分离出真正的游戏版本 vs 加载器
    let (game_versions, extracted_loaders): (Vec<String>, Vec<String>) =
        file.game_versions.iter().cloned().partition(|v| !is_loader(v));

    // 如果 mod_loaders 为空，从 game_versions 提取；否则用 API 返回的
    let mod_loaders = if file.mod_loaders.is_empty() && !extracted_loaders.is_empty() {
        extracted_loaders
    } else {
        file.mod_loaders.iter().map(|l| l.name.clone()).collect()
    };

    ModFile {
        id: file.id.to_string(),
        file_name: file.file_name.clone(),
        display_name: file.display_name.clone(),
        game_versions,
        mod_loaders,
        release_type: release_type.to_string(),
        file_size: file.file_length,
        download_url: file.download_url.clone(),
        download_count: file.download_count,
        created_at: file.file_date.clone(),
    }
}

// ---- API 调用辅助 ----

async fn cf_get<T: for<'de> Deserialize<'de>>(
    client: &Client,
    api_key: &str,
    path: &str,
    params: &[(&str, String)],
) -> Result<T, String> {
    let url = format!("{}{}", API_BASE, path);
    let resp = client
        .get(&url)
        .header("x-api-key", api_key)
        .query(params)
        .send()
        .await
        .map_err(|e| format!("CurseForge 请求失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("CurseForge 返回错误状态: {}", resp.status()));
    }

    resp.json::<T>()
        .await
        .map_err(|e| format!("CurseForge JSON 解析失败: {}", e))
}

async fn cf_get_no_params<T: for<'de> Deserialize<'de>>(
    client: &Client,
    api_key: &str,
    path: &str,
) -> Result<T, String> {
    let url = format!("{}{}", API_BASE, path);
    let resp = client
        .get(&url)
        .header("x-api-key", api_key)
        .send()
        .await
        .map_err(|e| format!("CurseForge 请求失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("CurseForge 返回错误状态: {}", resp.status()));
    }

    resp.json::<T>()
        .await
        .map_err(|e| format!("CurseForge JSON 解析失败: {}", e))
}

// ---- 公开 API ----

/// 搜索 Mod（关键词搜索）
pub async fn search_mods(
    client: &Client,
    api_key: &str,
    query: &str,
    limit: u32,
) -> Result<Vec<ResourceItem>, String> {
    let data = cf_get::<CfSearchResponse>(
        client,
        api_key,
        "/v1/mods/search",
        &[
            ("gameId", GAME_ID.to_string()),
            ("searchFilter", query.to_string()),
            ("sortBy", "6".to_string()),
            ("sortOrder", "desc".to_string()),
            ("pageSize", limit.to_string()),
        ],
    )
    .await?;

    let results: Vec<ResourceItem> = data.data.iter().take(limit as usize).map(to_resource_item).collect();
    Ok(results)
}

/// 获取热门资源（按 classId 筛选）
pub async fn fetch_popular(
    client: &Client,
    api_key: &str,
    resource_type: &str,
    limit: u32,
) -> Result<Vec<ResourceItem>, String> {
    let class_id = match resource_type {
        "mod" => 6u32,
        "modpack" => 4471,
        "resourcepack" => 12,
        "shader" => 6552,
        "world" => 17,
        "datapack" => 4546,
        _ => 6,
    };

    let data = cf_get::<CfSearchResponse>(
        client,
        api_key,
        "/v1/mods/search",
        &[
            ("gameId", GAME_ID.to_string()),
            ("classId", class_id.to_string()),
            ("sortBy", "1".to_string()),  // 1 = Popularity
            ("sortOrder", "desc".to_string()),
            ("pageSize", limit.to_string()),
        ],
    )
    .await?;

    let results: Vec<ResourceItem> = data.data.iter().take(limit as usize).map(to_resource_item).collect();
    Ok(results)
}

/// 批量获取多个类型的 popular
pub async fn fetch_popular_list(
    client: &Client,
    api_key: &str,
    types: &[&str],
    limit: u32,
) -> Result<Vec<(String, Vec<ResourceItem>)>, String> {
    let mut results = Vec::with_capacity(types.len());
    for t in types {
        let items = fetch_popular(client, api_key, t, limit).await?;
        results.push((t.to_string(), items));
    }
    Ok(results)
}

// ---- Step 4 新增 API ----

/// 获取模组详情
/// GET /v1/mods/{mod_id}
pub async fn get_mod_detail(
    client: &Client,
    api_key: &str,
    mod_id: u32,
) -> Result<ResourceDetail, String> {
    let data = cf_get_no_params::<CfModResponse>(
        client,
        api_key,
        &format!("/v1/mods/{}", mod_id),
    )
    .await?;

    Ok(to_resource_detail(&data.data))
}

/// 获取模组文件列表
/// GET /v1/mods/{mod_id}/files?pageSize=50
pub async fn get_mod_files(
    client: &Client,
    api_key: &str,
    mod_id: u32,
) -> Result<Vec<ModFile>, String> {
    let data = cf_get::<CfFilesResponse>(
        client,
        api_key,
        &format!("/v1/mods/{}/files", mod_id),
        &[
            ("pageSize", "50".to_string()),
            ("index", "0".to_string()),
        ],
    )
    .await?;

    Ok(data.data.iter().map(to_mod_file).collect())
}

/// 获取文件下载地址
/// POST /v1/mods/{mod_id}/files/{file_id}/download-url
pub async fn get_mod_file_download_url(
    client: &Client,
    api_key: &str,
    mod_id: u32,
    file_id: u32,
) -> Result<String, String> {
    let url = format!("{}/v1/mods/{}/files/{}/download-url", API_BASE, mod_id, file_id);
    let resp = client
        .post(&url)
        .header("x-api-key", api_key)
        .send()
        .await
        .map_err(|e| format!("CurseForge download-url 请求失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("CurseForge download-url 返回错误状态: {}", resp.status()));
    }

    let data = resp
        .json::<CfDownloadUrlResponse>()
        .await
        .map_err(|e| format!("CurseForge download-url JSON 解析失败: {}", e))?;

    Ok(data.data.download_url)
}
