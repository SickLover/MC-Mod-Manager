import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { ModFile, DownloadProgress } from '@/types';
import { useToast } from '@/components/common/ToastProvider';
import { formatFileSize } from '@/lib/format';

interface DownloadButtonProps {
  source: string;
  modId: string;
  file: ModFile;
}

export default function DownloadButton({ source, modId, file }: DownloadButtonProps) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const toast = useToast();

  const handleDownload = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    setProgress(0);

    // 监听下载进度事件
    let unlisten: UnlistenFn | undefined;
    try {
      unlisten = await listen<DownloadProgress>('download-progress', (event) => {
        const p = event.payload;
        if (p.fileId === file.id) {
          if (p.finished) {
            setProgress(100);
            toast?.success(`${p.fileName} 下载完成`);
            setDownloading(false);
            unlisten?.();
          } else if (p.error) {
            toast?.error(`下载失败: ${p.error}`);
            setDownloading(false);
            unlisten?.();
          } else if (p.total > 0) {
            setProgress(Math.round((p.downloaded / p.total) * 100));
          }
        }
      });
    } catch {
      // listen 失败时继续
    }

    try {
      const destPath = await invoke<string>('download_file', {
        source,
        modId,
        fileId: file.id,
        fileName: file.fileName,
        downloadUrl: file.downloadUrl,
      });
      toast?.success(`已保存到: ${destPath}`);
    } catch (err) {
      toast?.error(`下载失败: ${String(err)}`);
    } finally {
      setDownloading(false);
      unlisten?.();
    }
  }, [downloading, source, modId, file, toast]);

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      className={`px-3 py-1.5 text-xs rounded-mc font-medium transition-all duration-200 flex items-center gap-1.5 ${
        downloading
          ? 'bg-mc-card text-mc-muted cursor-wait border border-white/5'
          : 'bg-mc-green hover:bg-mc-green-dark text-white active:scale-[0.97]'
      }`}
    >
      {downloading ? (
        <>
          <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          {progress}%
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          {formatFileSize(file.fileSize)}
        </>
      )}
    </button>
  );
}
