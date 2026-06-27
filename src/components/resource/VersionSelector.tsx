import { useState, useMemo } from 'react';
import type { ModFile } from '@/types';
import { formatFileSize } from '@/lib/format';
import DownloadButton from '@/components/resource/DownloadButton';

interface VersionSelectorProps {
  files: ModFile[];
  source: string;
  modId: string;
}

const LOADER_BADGES: Record<string, string> = {
  fabric: 'Fabric',
  forge: 'Forge',
  neoforge: 'NeoForge',
  quilt: 'Quilt',
};

const RELEASE_TYPE_STYLE: Record<string, { label: string; color: string }> = {
  release: { label: '正式版', color: 'text-green-400 bg-green-400/10 border-green-400/20' },
  beta: { label: 'Beta', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' },
  alpha: { label: 'Alpha', color: 'text-red-400 bg-red-400/10 border-red-400/20' },
};

export default function VersionSelector({ files, source, modId }: VersionSelectorProps) {
  const [filterGameVersion, setFilterGameVersion] = useState<string | null>(null);

  // 收集所有去重的游戏版本
  const allGameVersions = useMemo(() => {
    const set = new Set<string>();
    files.forEach((f) => f.gameVersions.forEach((gv) => set.add(gv)));
    return Array.from(set).sort().reverse();
  }, [files]);

  // 筛选后的文件列表
  const filteredFiles = filterGameVersion
    ? files.filter((f) => f.gameVersions.includes(filterGameVersion))
    : files;

  return (
    <div>
      {/* 游戏版本筛选 chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setFilterGameVersion(null)}
          className={`px-3 py-1 text-xs rounded-full transition-all duration-200 ${
            !filterGameVersion
              ? 'bg-mc-green/15 text-mc-green-light border border-mc-green/20'
              : 'bg-mc-card text-mc-muted border border-white/5 hover:text-mc-text'
          }`}
        >
          全部
        </button>
        {allGameVersions.slice(0, 15).map((gv) => (
          <button
            key={gv}
            onClick={() => setFilterGameVersion(gv === filterGameVersion ? null : gv)}
            className={`px-3 py-1 text-xs rounded-full transition-all duration-200 ${
              filterGameVersion === gv
                ? 'bg-mc-green/15 text-mc-green-light border border-mc-green/20'
                : 'bg-mc-card text-mc-muted border border-white/5 hover:text-mc-text'
            }`}
          >
            {gv}
          </button>
        ))}
        {allGameVersions.length > 15 && (
          <span className="px-2 py-1 text-xs text-mc-muted">
            +{allGameVersions.length - 15}
          </span>
        )}
      </div>

      {/* 文件列表 */}
      {filteredFiles.length === 0 ? (
        <p className="text-sm text-mc-muted py-8 text-center">暂无版本</p>
      ) : (
        <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
          {filteredFiles.map((file) => {
            const typeInfo = RELEASE_TYPE_STYLE[file.releaseType] || RELEASE_TYPE_STYLE.release;
            return (
              <div
                key={file.id}
                className="flex items-center gap-3 p-3 rounded-mc border border-white/5 bg-mc-card hover:border-white/10 transition-all duration-200"
              >
                {/* 文件信息 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm text-mc-text font-medium truncate">
                      {file.displayName || file.fileName}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded border ${typeInfo.color}`}>
                      {typeInfo.label}
                    </span>
                  </div>

                  {/* 游戏版本标签 */}
                  <div className="flex flex-wrap gap-1 mb-1">
                    {file.gameVersions.slice(0, 4).map((gv) => (
                      <span
                        key={gv}
                        className="text-xs text-mc-muted bg-mc-bg px-1.5 py-0.5 rounded"
                      >
                        {gv}
                      </span>
                    ))}
                    {file.gameVersions.length > 4 && (
                      <span className="text-xs text-mc-muted">
                        +{file.gameVersions.length - 4}
                      </span>
                    )}
                  </div>

                  {/* 加载器标签 */}
                  {file.modLoaders.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {file.modLoaders.slice(0, 3).map((l) => (
                        <span
                          key={l}
                          className="text-xs px-1.5 py-0.5 rounded bg-mc-green/15 text-mc-green-light"
                        >
                          {LOADER_BADGES[l.toLowerCase()] || l}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* 文件大小 + 下载按钮 */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-mc-muted hidden sm:block">
                    {formatFileSize(file.fileSize)}
                  </span>
                  <DownloadButton source={source} modId={modId} file={file} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
