use tauri::{command, AppHandle, State, Emitter};
use crate::AppState;
use crate::types::DownloadProgress;
use futures_util::StreamExt;
use std::io::Write;

#[command]
pub async fn download_file(
    app: AppHandle,
    state: State<'_, AppState>,
    source: String,
    mod_id: String,
    file_id: String,
    file_name: String,
    download_url: Option<String>,
) -> Result<String, String> {
    // 1. 获取下载目录
    let download_dir = {
        let settings = state.settings.lock().unwrap();
        if settings.default_download_dir.is_empty() {
            dirs_next::download_dir()
                .unwrap_or_else(|| std::path::PathBuf::from("."))
                .join("mc-mod-hub")
        } else {
            std::path::PathBuf::from(&settings.default_download_dir)
        }
    };
    std::fs::create_dir_all(&download_dir)
        .map_err(|e| format!("创建目录失败: {}", e))?;

    // 2. 获取实际下载 URL
    let api_key = {
        let settings = state.settings.lock().unwrap();
        settings.curseforge_api_key.clone()
    };

    let actual_url = match source.as_str() {
        "curseforge" => {
            let mid: u32 = mod_id.parse().map_err(|_| "无效 Mod ID".to_string())?;
            let fid: u32 = file_id.parse().map_err(|_| "无效 File ID".to_string())?;
            crate::curseforge::get_mod_file_download_url(
                &state.http_client, &api_key, mid, fid
            ).await?
        }
        "modrinth" => {
            download_url.ok_or_else(|| "Modrinth 需要提供 download_url".to_string())?
        }
        _ => return Err(format!("未知来源: {}", source)),
    };

    // 3. 流式下载
    let response = state.http_client
        .get(&actual_url)
        .send()
        .await
        .map_err(|e| format!("下载请求失败: {}", e))?;

    let total = response.content_length().unwrap_or(0);
    let safe_name = std::path::PathBuf::from(&file_name)
        .file_name()
        .unwrap_or_else(|| std::ffi::OsStr::new("unknown"))
        .to_string_lossy()
        .to_string();
    let dest_path = download_dir.join(&safe_name);

    let mut dest_file = std::fs::File::create(&dest_path)
        .map_err(|e| format!("创建文件失败: {}", e))?;

    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("下载流错误: {}", e))?;
        dest_file.write_all(&chunk)
            .map_err(|e| format!("写入文件失败: {}", e))?;
        downloaded += chunk.len() as u64;

        // 推送进度事件到前端
        let progress = DownloadProgress {
            file_id: file_id.clone(),
            file_name: file_name.clone(),
            downloaded,
            total,
            finished: false,
            error: None,
        };
        app.emit("download-progress", &progress).ok();
    }

    // 完成
    app.emit("download-progress", &DownloadProgress {
        file_id: file_id.clone(),
        file_name: file_name.clone(),
        downloaded: total,
        total,
        finished: true,
        error: None,
    }).ok();

    Ok(dest_path.to_string_lossy().to_string())
}
