use tauri::State;
use crate::AppState;
use crate::types::ResourceItem;

#[tauri::command]
pub async fn list_recently_viewed(
    state: State<'_, AppState>,
) -> Result<Vec<ResourceItem>, String> {
    state.db.list_recently_viewed(12)
}
