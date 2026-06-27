pub mod commands;
pub mod curseforge;
pub mod db;
pub mod merger;
pub mod modrinth;
pub mod types;

use std::sync::Mutex;
use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Settings {
    #[serde(default)]
    pub curseforge_api_key: String,
    #[serde(default)]
    pub default_download_dir: String,
    #[serde(default = "default_true")]
    pub check_updates_on_startup: bool,
}

fn default_true() -> bool {
    true
}

pub struct AppState {
    pub http_client: reqwest::Client,
    pub settings: Mutex<Settings>,
    pub db: db::Database,
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let db_path = db::get_db_path(&app.handle());
            let database = db::Database::new(&db_path)
                .expect("初始化数据库失败");

            // 从 settings.json 加载设置（替代硬编码 API Key）
            let settings = commands::settings::load_settings(&app.handle());

            let app_state = AppState {
                http_client: reqwest::Client::builder()
                    .timeout(std::time::Duration::from_secs(30))
                    .build()
                    .expect("创建 HTTP 客户端失败"),
                settings: Mutex::new(settings),
                db: database,
            };

            app.manage(app_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::search::search,
            commands::popular::popular,
            commands::resource::get_resource_detail,
            commands::download::download_file,
            commands::collections::list_collections,
            commands::collections::create_collection,
            commands::collections::update_collection,
            commands::collections::delete_collection,
            commands::collections::add_item_to_collection,
            commands::collections::remove_item_from_collection,
            commands::collections::list_collection_items,
            commands::batch_download::batch_download,
            commands::category::browse_category,
            commands::recently_viewed::list_recently_viewed,
            commands::settings::get_settings,
            commands::settings::save_settings_command,
            commands::settings::select_directory,
            commands::manifest::export_manifest,
            commands::manifest::import_manifest,
            commands::manifest::pick_save_file,
            commands::manifest::pick_open_file,
        ])
        .run(tauri::generate_context!())
        .expect("启动 Tauri 失败");
}
