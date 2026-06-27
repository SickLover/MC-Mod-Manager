use reqwest::Client;
use serde::Deserialize;
use crate::types::{ModFile, ResourceDetail, ResourceItem};

const API_BASE: &str = "https://api.modrinth.com/v2";

// ---- Modrinth API 响应结构体 ----

#[derive(Debug, Deserialize)]
pub struct MrHit {
    pub project_id: String,
    pub project_type: String,
    pub slug: String,
    pub author: String,
    pub title: String,
    pub description: String,
    pub icon_url: Option<String>,
    pub downloads: u64,
    #[serde(default)]
    pub categories: Vec<String>,
    #[serde(default)]
    pub versions: Vec<String>,
    pub date_modified: String,
}

#[derive(Debug, Deserialize)]
pub struct MrSearchResponse {
    pub hits: Vec<MrHit>,
    pub total_hits: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct MrProject {
    pub id: String,
    pub project_type: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub body: String,
    pub icon_url: Option<String>,
    pub downloads: u64,
    #[serde(default)]
    pub categories: Vec<String>,
    #[serde(default)]
    pub versions: Vec<String>,
    pub published: String,
    pub updated: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct MrVersion {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub version_number: String,
    #[serde(default)]
    pub game_versions: Vec<String>,
    #[serde(default)]
    pub loaders: Vec<String>,
    #[serde(default, alias = "version_type")]
    pub release_type: String,
    #[serde(default)]
    pub files: Vec<MrVersionFile>,
    #[serde(default)]
    pub date_published: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct MrVersionFile {
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub filename: String,
    #[serde(default)]
    pub size: u64,
}

// ---- 类型映射 ----

fn to_resource_item(hit: &MrHit) -> ResourceItem {
    let resource_type = match hit.project_type.as_str() {
        "mod" => "mod",
        "modpack" => "modpack",
        "shader" => "shader",
        "resourcepack" => "resourcepack",
        _ => "mod",
    };

    ResourceItem {
        id: hit.project_id.clone(),
        source: "modrinth".to_string(),
        resource_type: resource_type.to_string(),
        name: hit.title.clone(),
        summary: hit.description.clone(),
        icon_url: hit.icon_url.clone(),
        download_count: hit.downloads,
        author: if hit.author.is_empty() { "Unknown".to_string() } else { hit.author.clone() },
        categories: hit.categories.clone(),
        game_versions: hit.versions.clone(),
        created_at: String::new(),
        updated_at: hit.date_modified.clone(),
    }
}

fn build_facet(resource_type: &str) -> String {
    let facet = match resource_type {
        "mod" => "project_type:mod",
        "modpack" => "project_type:modpack",
        "shader" => "project_type:shader",
        "resourcepack" => "project_type:resourcepack",
        _ => "project_type:mod",
    };
    format!("[[\"{}\"]]", facet)
}

// ---- API 调用辅助 ----

async fn mr_get<T: for<'de> Deserialize<'de>>(
    client: &Client,
    path: &str,
    params: &[(&str, String)],
) -> Result<T, String> {
    let url = format!("{}{}", API_BASE, path);
    let resp = client
        .get(&url)
        .query(params)
        .send()
        .await
        .map_err(|e| format!("Modrinth 请求失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Modrinth 返回错误状态: {}", resp.status()));
    }

    resp.json::<T>()
        .await
        .map_err(|e| format!("Modrinth JSON 解析失败: {}", e))
}

async fn mr_get_no_params<T: for<'de> Deserialize<'de>>(
    client: &Client,
    path: &str,
) -> Result<T, String> {
    let url = format!("{}{}", API_BASE, path);
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Modrinth 请求失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Modrinth 返回错误状态: {}", resp.status()));
    }

    resp.json::<T>()
        .await
        .map_err(|e| format!("Modrinth JSON 解析失败: {}", e))
}

// ---- 公开 API ----

/// 搜索项目（关键词搜索）
pub async fn search_projects(
    client: &Client,
    query: &str,
    limit: u32,
) -> Result<Vec<ResourceItem>, String> {
    let data = mr_get::<MrSearchResponse>(
        client,
        "/search",
        &[
            ("query", query.to_string()),
            ("limit", limit.to_string()),
            ("sort", "relevance".to_string()),
        ],
    )
    .await?;

    let results: Vec<ResourceItem> = data.hits.iter().take(limit as usize).map(to_resource_item).collect();
    Ok(results)
}

/// 获取热门资源（按类型筛选）
pub async fn fetch_popular(
    client: &Client,
    resource_type: &str,
    limit: u32,
) -> Result<Vec<ResourceItem>, String> {
    let data = mr_get::<MrSearchResponse>(
        client,
        "/search",
        &[
            ("facets", build_facet(resource_type)),
            ("sort", "downloads".to_string()),
            ("limit", limit.to_string()),
        ],
    )
    .await?;

    let results: Vec<ResourceItem> = data.hits.iter().take(limit as usize).map(to_resource_item).collect();
    Ok(results)
}

/// 批量获取多个类型的 popular
pub async fn fetch_popular_list(
    client: &Client,
    types: &[&str],
    limit: u32,
) -> Result<Vec<(String, Vec<ResourceItem>)>, String> {
    let mut results = Vec::with_capacity(types.len());
    for t in types {
        let items = fetch_popular(client, t, limit).await?;
        results.push((t.to_string(), items));
    }
    Ok(results)
}

// ---- Step 4 新增 API ----

/// 获取项目详情
/// GET /v2/project/{id}
pub async fn get_project_detail(
    client: &Client,
    project_id: &str,
) -> Result<ResourceDetail, String> {
    let project = mr_get_no_params::<MrProject>(
        client,
        &format!("/project/{}", project_id),
    )
    .await?;

    let resource_type = match project.project_type.as_str() {
        "mod" => "mod",
        "modpack" => "modpack",
        "shader" => "shader",
        "resourcepack" => "resourcepack",
        _ => "mod",
    };

    Ok(ResourceDetail {
        id: project.id.clone(),
        source: "modrinth".to_string(),
        resource_type: resource_type.to_string(),
        name: project.title.clone(),
        summary: project.description.clone(),
        description: project.body.clone(),
        icon_url: project.icon_url.clone(),
        download_count: project.downloads,
        // Modrinth 详情 API 不直接返回 author，调用 team API 需要额外请求
        // 暂时留空，后续可通过 /v2/project/{id}/members 获取
        author: "Modrinth".to_string(),
        categories: project.categories.clone(),
        game_versions: vec![],
        created_at: project.published.clone(),
        updated_at: project.updated.clone(),
        files: vec![],
        url: Some(format!("https://modrinth.com/project/{}", project.slug)),
    })
}

/// 获取项目版本列表
/// GET /v2/project/{id}/version
pub async fn get_project_versions(
    client: &Client,
    project_id: &str,
) -> Result<Vec<ModFile>, String> {
    let versions = mr_get_no_params::<Vec<MrVersion>>(
        client,
        &format!("/project/{}/version", project_id),
    )
    .await?;

    let files: Vec<ModFile> = versions.iter().map(|v| {
        let first_file = v.files.first().cloned().unwrap_or(MrVersionFile {
            url: String::new(),
            filename: String::new(),
            size: 0,
        });

        ModFile {
            id: v.id.clone(),
            file_name: first_file.filename,
            display_name: format!("{} v{}", v.name, v.version_number),
            game_versions: v.game_versions.clone(),
            mod_loaders: v.loaders.clone(),
            release_type: v.release_type.clone(),
            file_size: first_file.size,
            download_url: Some(first_file.url),
            download_count: 0,
            created_at: v.date_published.clone(),
        }
    }).collect();

    Ok(files)
}
