use tauri::State;
use crate::AppState;
use crate::types::ResourceItem;

#[tauri::command]
pub async fn popular(
    state: State<'_, AppState>,
) -> Result<Vec<(String, Vec<ResourceItem>)>, String> {
    let api_key = {
        let settings = state.settings.lock().unwrap();
        settings.curseforge_api_key.clone()
    };

    let types = vec!["mod", "resourcepack", "shader"];

    let (cf_result, mr_result) = tokio::join!(
        crate::curseforge::fetch_popular_list(&state.http_client, &api_key, &types, 6),
        crate::modrinth::fetch_popular_list(&state.http_client, &types, 6),
    );

    let cf_list = match cf_result {
        Ok(r) => r,
        Err(e) => { eprintln!("[popular] CurseForge 请求失败: {}", e); vec![] }
    };
    let mr_list = match mr_result {
        Ok(r) => r,
        Err(e) => { eprintln!("[popular] Modrinth 请求失败: {}", e); vec![] }
    };

    // 对每个 type 合并 CF + MR 结果
    let merged: Vec<(String, Vec<ResourceItem>)> = types
        .iter()
        .map(|t| {
            let cf_items = cf_list.iter()
                .find(|(tp, _)| tp == t)
                .map(|(_, items)| items.clone())
                .unwrap_or_default();
            let mr_items = mr_list.iter()
                .find(|(tp, _)| tp == t)
                .map(|(_, items)| items.clone())
                .unwrap_or_default();
            let merged_items = crate::merger::merge_results(&cf_items, &mr_items);
            (t.to_string(), merged_items)
        })
        .collect();

    Ok(merged)
}
