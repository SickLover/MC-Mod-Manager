use tauri::{command, AppHandle, State, Emitter};
use crate::AppState;
use serde::Deserialize;
use futures_util::StreamExt;
use std::io::Write;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchDownloadRequest {
    pub source: String,
    pub mod_id: String,
    pub file_id: String,
    pub file_name: String,
}

#[command]
pub async fn batch_download(
    app: AppHandle,
    state: State<'_, AppState>,
    files: Vec<BatchDownloadRequest>,
    mode: String,  // "zip" | "folder"
) -> Result<String, String> {
    // 1. 准备下载目录
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
    std::fs::create_dir_all(&download_dir).map_err(|e| format!("创建目录失败: {}", e))?;

    let api_key = {
        let settings = state.settings.lock().unwrap();
        settings.curseforge_api_key.clone()
    };

    // 2. 逐个下载到临时目录
    let temp_dir = download_dir.join(format!(".batch_{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&temp_dir).map_err(|e| format!("创建临时目录失败: {}", e))?;

    let total = files.len() as u64;
    for (i, file) in files.iter().enumerate() {
        // 获取下载 URL
        let download_url = match file.source.as_str() {
            "curseforge" => {
                let mid: u32 = file.mod_id.parse().map_err(|_| "无效 Mod ID".to_string())?;
                let fid: u32 = file.file_id.parse().map_err(|_| "无效 File ID".to_string())?;
                crate::curseforge::get_mod_file_download_url(
                    &state.http_client, &api_key, mid, fid
                ).await?
            }
            "modrinth" => file.file_id.clone(), // Modrinth 直接传 URL
            _ => return Err(format!("未知来源: {}", file.source)),
        };

        // 流式下载
        let response = state.http_client.get(&download_url).send().await
            .map_err(|e| format!("下载请求失败: {}", e))?;

        let safe_name = std::path::PathBuf::from(&file.file_name)
            .file_name()
            .unwrap_or_else(|| std::ffi::OsStr::new("unknown"))
            .to_string_lossy()
            .to_string();
        let dest = temp_dir.join(&safe_name);
        let mut dest_file = std::fs::File::create(&dest)
            .map_err(|e| format!("创建文件失败: {}", e))?;

        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("流错误: {}", e))?;
            dest_file.write_all(&chunk)
                .map_err(|e| format!("写入失败: {}", e))?;
        }

        // 推送进度
        app.emit("batch-progress", &serde_json::json!({
            "current": i + 1,
            "total": total,
            "fileName": file.file_name,
        })).ok();
    }

    // 3. 按 mode 输出
    let result_path = match mode.as_str() {
        "zip" => {
            let zip_name = format!("mc-mods-{}.zip",
                chrono::Local::now().format("%Y%m%d-%H%M%S"));
            let zip_path = download_dir.join(&zip_name);

            let zip_file = std::fs::File::create(&zip_path)
                .map_err(|e| format!("创建 zip 失败: {}", e))?;
            let mut zip_writer = zip::ZipWriter::new(zip_file);
            let options = zip::write::FileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated);

            for entry in std::fs::read_dir(&temp_dir).map_err(|e| format!("读取临时目录失败: {}", e))? {
                let entry = entry.map_err(|e| format!("读取条目失败: {}", e))?;
                let path = entry.path();
                if path.is_file() {
                    let name = path.file_name().unwrap().to_string_lossy().to_string();
                    zip_writer.start_file(&name, options)
                        .map_err(|e| format!("zip 创建条目失败: {}", e))?;
                    let mut f = std::fs::File::open(&path)
                        .map_err(|e| format!("读取文件失败: {}", e))?;
                    std::io::copy(&mut f, &mut zip_writer)
                        .map_err(|e| format!("zip 写入失败: {}", e))?;
                }
            }
            zip_writer.finish().map_err(|e| format!("zip 完成失败: {}", e))?;

            // 清理临时目录
            std::fs::remove_dir_all(&temp_dir).ok();

            zip_path.to_string_lossy().to_string()
        }
        "folder" => {
            let folder_name = format!("mc-mods-{}",
                chrono::Local::now().format("%Y%m%d-%H%M%S"));
            let folder_path = download_dir.join(&folder_name);
            std::fs::rename(&temp_dir, &folder_path)
                .map_err(|e| format!("重命名目录失败: {}", e))?;
            folder_path.to_string_lossy().to_string()
        }
        _ => return Err(format!("未知模式: {}", mode)),
    };

    Ok(result_path)
}
