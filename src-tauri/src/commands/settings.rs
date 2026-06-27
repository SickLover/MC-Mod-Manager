use tauri::{command, State, AppHandle, Manager};
use crate::AppState;
use std::fs;
use std::path::PathBuf;

/// 获取 settings.json 路径
fn settings_path(app: &AppHandle) -> PathBuf {
    let mut path = app.path().app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("data"));
    fs::create_dir_all(&path).ok();
    path.push("settings.json");
    path
}

/// 加载设置（启动时调用）
pub fn load_settings(app: &AppHandle) -> crate::Settings {
    let path = settings_path(app);
    if path.exists() {
        fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    } else {
        crate::Settings::default()
    }
}

/// 保存设置到文件
fn save_settings(app: &AppHandle, settings: &crate::Settings) -> Result<(), String> {
    let path = settings_path(app);
    let json = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("序列化失败: {}", e))?;
    fs::write(&path, json)
        .map_err(|e| format!("写入失败: {}", e))?;
    Ok(())
}

#[command]
pub async fn get_settings(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<crate::Settings, String> {
    // 从文件重新加载最新设置
    let settings = load_settings(&app);
    // 同步到内存
    if let Ok(mut s) = state.settings.lock() {
        *s = settings.clone();
    }
    Ok(settings)
}

#[command]
pub async fn save_settings_command(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: crate::Settings,
) -> Result<(), String> {
    save_settings(&app, &settings)?;
    // 同步到内存
    if let Ok(mut s) = state.settings.lock() {
        *s = settings;
    }
    Ok(())
}

/// 选择目录（使用 rfd 系统文件夹选择对话框）
#[command]
pub async fn select_directory() -> Result<String, String> {
    let folder = rfd::AsyncFileDialog::new()
        .pick_folder()
        .await
        .map(|handle| handle.path().to_string_lossy().to_string());
    folder.ok_or_else(|| "未选择目录".to_string())
}
