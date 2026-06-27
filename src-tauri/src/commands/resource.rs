use tauri::State;
use crate::AppState;
use crate::types::{ResourceDetail, ResourceItem};

#[tauri::command]
pub async fn get_resource_detail(
    source: String,
    id: String,
    state: State<'_, AppState>,
) -> Result<ResourceDetail, String> {
    let api_key = {
        let settings = state.settings.lock().unwrap();
        settings.curseforge_api_key.clone()
    };

    let detail = match source.as_str() {
        "curseforge" => {
            let mod_id: u32 = id.parse().map_err(|_| "无效的 CurseForge ID".to_string())?;
            let (detail, files) = tokio::join!(
                crate::curseforge::get_mod_detail(&state.http_client, &api_key, mod_id),
                crate::curseforge::get_mod_files(&state.http_client, &api_key, mod_id),
            );
            let mut detail = detail?;
            if let Err(e) = &files {
                eprintln!("[resource] CurseForge get_mod_files 失败: {}", e);
            }
            detail.files = files.unwrap_or_default();
            detail
        }
        "modrinth" => {
            let (detail, files) = tokio::join!(
                crate::modrinth::get_project_detail(&state.http_client, &id),
                crate::modrinth::get_project_versions(&state.http_client, &id),
            );
            let mut detail = detail?;
            if let Err(e) = &files {
                eprintln!("[resource] Modrinth get_project_versions 失败: {}", e);
            }
            detail.files = files.unwrap_or_default();
            detail
        }
        _ => return Err(format!("未知来源: {}", source)),
    };

    // 记录最近浏览
    let r = ResourceItem {
        id: detail.id.clone(),
        source: detail.source.clone(),
        resource_type: detail.resource_type.clone(),
        name: detail.name.clone(),
        summary: detail.summary.clone(),
        icon_url: detail.icon_url.clone(),
        download_count: detail.download_count,
        author: detail.author.clone(),
        categories: detail.categories.clone(),
        game_versions: detail.game_versions.clone(),
        created_at: detail.created_at.clone(),
        updated_at: detail.updated_at.clone(),
    };
    state.db.record_recently_viewed(&r).ok();

    Ok(detail)
}
