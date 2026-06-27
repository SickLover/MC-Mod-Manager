use tauri::State;
use crate::AppState;
use crate::types::ResourceItem;

const PAGE_SIZE: u32 = 20;

/// 分类浏览 — 按类型分页展示 CF+MR 热门资源
/// 使用客户端分页（取合并结果后切片），简化实现
#[tauri::command]
pub async fn browse_category(
    resource_type: String,
    page: u32,
    state: State<'_, AppState>,
) -> Result<(Vec<ResourceItem>, u32), String> {
    let api_key = {
        let settings = state.settings.lock().unwrap();
        settings.curseforge_api_key.clone()
    };

    // 取多一些数据用于客户端分页（最多 2 页）
    let fetch_limit = PAGE_SIZE * 2;

    let (cf, mr) = tokio::join!(
        crate::curseforge::fetch_popular(&state.http_client, &api_key, &resource_type, fetch_limit),
        crate::modrinth::fetch_popular(&state.http_client, &resource_type, fetch_limit),
    );

    let cf_results = match cf {
        Ok(r) => r,
        Err(e) => { eprintln!("[category] CurseForge 请求失败: {}", e); vec![] }
    };
    let mr_results = match mr {
        Ok(r) => r,
        Err(e) => { eprintln!("[category] Modrinth 请求失败: {}", e); vec![] }
    };
    let merged = crate::merger::merge_results(&cf_results, &mr_results);

    let total = merged.len() as u32;
    let offset = ((page.saturating_sub(1)) * PAGE_SIZE) as usize;
    let paged: Vec<ResourceItem> = merged
        .into_iter()
        .skip(offset)
        .take(PAGE_SIZE as usize)
        .collect();

    Ok((paged, total))
}
