use tauri::State;
use crate::AppState;

#[tauri::command]
pub async fn search(
    query: String,
    state: State<'_, AppState>,
) -> Result<Vec<crate::types::ResourceItem>, String> {
    let api_key = {
        let settings = state.settings.lock().unwrap();
        settings.curseforge_api_key.clone()
    };

    if api_key.is_empty() {
        // 仅搜索 Modrinth
        let mr = crate::modrinth::search_projects(&state.http_client, &query, 16).await?;
        return Ok(mr);
    }

    let (cf_result, mr_result) = tokio::join!(
        crate::curseforge::search_mods(&state.http_client, &api_key, &query, 16),
        crate::modrinth::search_projects(&state.http_client, &query, 16),
    );

    let cf = match cf_result {
        Ok(r) => r,
        Err(e) => { eprintln!("[search] CurseForge 搜索失败: {}", e); vec![] }
    };
    let mr = match mr_result {
        Ok(r) => r,
        Err(e) => { eprintln!("[search] Modrinth 搜索失败: {}", e); vec![] }
    };

    Ok(crate::merger::merge_results(&cf, &mr))
}
