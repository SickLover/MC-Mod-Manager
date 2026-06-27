use serde::{Deserialize, Serialize};

/// 统一的资源条目 — 与前端 types/index.ts ResourceItem 对等
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceItem {
    pub id: String,
    pub source: String,
    #[serde(rename = "type")]
    pub resource_type: String,
    pub name: String,
    pub summary: String,
    pub icon_url: Option<String>,
    pub download_count: u64,
    pub author: String,
    pub categories: Vec<String>,
    pub game_versions: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

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
    pub description: String,
    pub icon_url: Option<String>,
    pub download_count: u64,
    pub author: String,
    pub categories: Vec<String>,
    pub game_versions: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    pub files: Vec<ModFile>,
    pub url: Option<String>,
}

/// 模组文件/版本
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModFile {
    pub id: String,
    pub file_name: String,
    pub display_name: String,
    pub game_versions: Vec<String>,
    pub mod_loaders: Vec<String>,
    pub release_type: String,
    pub file_size: u64,
    pub download_url: Option<String>,
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

// ==================== Collections ====================

/// 收藏夹行（从数据库读出）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionRow {
    pub id: String,
    pub name: String,
    pub description: String,
    pub created_at: String,
    pub updated_at: String,
    pub item_count: u32,
    pub collection_type: String,
}

/// 收藏项目行（从数据库读出）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionItemRow {
    pub id: String,
    pub collection_id: String,
    pub resource_id: String,
    pub source: String,
    pub name: String,
    pub summary: String,
    pub icon_url: Option<String>,
    pub download_count: u64,
    pub author: String,
    pub resource_type: String,
    pub categories: String,       // JSON 字符串
    pub game_versions: String,    // JSON 字符串
    pub added_at: String,
}

/// 添加收藏的输入
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionItemInput {
    pub resource_id: String,
    pub source: String,
    pub name: String,
    pub summary: String,
    pub icon_url: Option<String>,
    pub download_count: u64,
    pub author: String,
    pub resource_type: String,
    pub categories: String,       // JSON 字符串
    pub game_versions: String,    // JSON 字符串
}
