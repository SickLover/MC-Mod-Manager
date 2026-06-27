use tauri::State;
use crate::AppState;
use crate::types::{CollectionRow, CollectionItemRow, CollectionItemInput};

#[tauri::command]
pub async fn list_collections(state: State<'_, AppState>) -> Result<Vec<CollectionRow>, String> {
    state.db.list_collections()
}

#[tauri::command]
pub async fn create_collection(
    name: String,
    collection_type: String,
    description: Option<String>,
    state: State<'_, AppState>,
) -> Result<CollectionRow, String> {
    state.db.create_collection(&name, &description.unwrap_or_default(), &collection_type)
}

#[tauri::command]
pub async fn update_collection(
    id: String,
    name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.db.update_collection(&id, &name)
}

#[tauri::command]
pub async fn delete_collection(
    id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.db.delete_collection(&id)
}

#[tauri::command]
pub async fn add_item_to_collection(
    collection_id: String,
    item: CollectionItemInput,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.db.add_item(&collection_id, &item)
}

#[tauri::command]
pub async fn remove_item_from_collection(
    collection_id: String,
    item_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.db.remove_item(&collection_id, &item_id)
}

#[tauri::command]
pub async fn list_collection_items(
    collection_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<CollectionItemRow>, String> {
    state.db.list_items(&collection_id)
}
