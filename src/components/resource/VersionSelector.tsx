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

const FILTER_STYLES =
  'px-3 py-1.5 bg-mc-card border border-white/5 rounded-md text-sm text-mc-text focus:outline-none focus:border-mc-green/40 transition-colors cursor-pointer';

const RELEASE_TYPES = [
  { value: 'all', label: '全部版本类型' },
  { value: 'release', label: '正式版' },
  { value: 'beta', label: 'Beta' },
  { value: 'alpha', label: 'Alpha' },
];

export default function VersionSelector({ files, source, modId }: VersionSelectorProps) {
  const [filterGameVersion, setFilterGameVersion] = useState<string>('all');
  const [filterLoader, setFilterLoader] = useState<string>('all');
  const [filterReleaseType, setFilterReleaseType] = useState<string>('all');

  // 收集所有去重的游戏版本
  const allGameVersions = useMemo(() => {
    const set = new Set<string>();
    files.forEach((f) => f.gameVersions.forEach((gv) => set.add(gv)));
    return Array.from(set).sort().reverse();
  }, [files]);

  // 收集所有去重的加载器
  const allLoaders = useMemo(() => {
    const set = new Set<string>();
    files.forEach((f) => f.modLoaders.forEach((l) => set.add(l)));
    return Array.from(set);
  }, [files]);

  // 筛选后的文件列表（版本 + 加载器 + release 类型叠加筛选）
  const filteredFiles = useMemo(() => {
    let result = files;
    if (filterGameVersion && filterGameVersion !== 'all') {
      result = result.filter((f) => f.gameVersions.includes(filterGameVersion));
    }
    if (filterLoader && filterLoader !== 'all') {
      const lower = filterLoader.toLowerCase();
      result = result.filter((f) =>
        f.modLoaders.some((l) => l.toLowerCase() === lower)
      );
    }
    if (filterReleaseType && filterReleaseType !== 'all') {
      result = result.filter((f) => f.releaseType === filterReleaseType);
    }
    return result;
  }, [files, filterGameVersion, filterLoader, filterReleaseType]);

  return (
    <div>
      {/* 筛选栏 */}
      <div className="flex flex-wrap gap-3 mb-4">
        {/* 游戏版本筛选 */}
        <select
          value={filterGameVersion}
          onChange={e => setFilterGameVersion(e.target.value)}
          className={FILTER_STYLES}
        >
          <option value="all">全部版本</option>
          {allGameVersions.map((gv) => (
            <option key={gv} value={gv}>{gv}</option>
          ))}
        </select>

        {/* 加载器筛选 */}
        <select
          value={filterLoader}
          onChange={e => setFilterLoader(e.target.value)}
          className={FILTER_STYLES}
        >
          <option value="all">全部加载器</option>
          {allLoaders.length > 0 ? (
            allLoaders.map((loader) => (
              <option key={loader} value={loader}>
                {LOADER_BADGES[loader.toLowerCase()] || loader}
              </option>
            ))
          ) : (
            <option value="" disabled>暂无数据</option>
          )}
        </select>

        {/* 版本类型筛选 */}
        <select
          value={filterReleaseType}
          onChange={e => setFilterReleaseType(e.target.value)}
          className={FILTER_STYLES}
        >
          {RELEASE_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* 文件列表 — 表格布局 */}
      {filteredFiles.length === 0 ? (
        <p className="text-sm text-mc-muted py-8 text-center">暂无版本</p>
      ) : (
        <div className="max-h-[600px] overflow-y-auto pr-1">
          {/* 表头 */}
          <div className="hidden md:flex items-center gap-3 px-3 py-2 text-xs text-mc-muted border-b border-white/5 mb-1">
            <span className="flex-1">文件名</span>
            <span className="w-28 shrink-0">游戏版本</span>
            <span className="w-20 shrink-0">加载器</span>
            <span className="w-16 shrink-0">类型</span>
            <span className="w-16 shrink-0 text-right">大小</span>
            <span className="w-20 shrink-0 text-right">操作</span>
          </div>
          <div className="space-y-1">
            {filteredFiles.map((file) => {
              const typeInfo = RELEASE_TYPE_STYLE[file.releaseType] || RELEASE_TYPE_STYLE.release;
              return (
                <div
                  key={file.id}
                  className="flex flex-wrap md:flex-nowrap items-center gap-2 md:gap-3 p-3 rounded-mc border border-white/5 bg-mc-card hover:border-white/10 transition-all duration-200"
                >
                  {/* 文件名 */}
                  <div className="flex-1 min-w-0 w-full md:w-auto">
                    <span className="text-sm text-mc-text font-medium truncate block">
                      {file.displayName || file.fileName}
                    </span>
                  </div>

                  {/* 游戏版本标签 */}
                  <div className="w-full md:w-28 shrink-0">
                    <span className="md:hidden text-xs text-mc-muted mr-1">游戏版本:</span>
                    <div className="flex flex-wrap gap-1">
                      {file.gameVersions.slice(0, 3).map((gv) => (
                        <span key={gv} className="text-xs text-mc-muted bg-mc-bg px-1.5 py-0.5 rounded">
                          {gv}
                        </span>
                      ))}
                      {file.gameVersions.length > 3 && (
                        <span className="text-xs text-mc-muted">+{file.gameVersions.length - 3}</span>
                      )}
                    </div>
                  </div>

                  {/* 加载器标签 */}
                  <div className="w-full md:w-20 shrink-0">
                    <span className="md:hidden text-xs text-mc-muted mr-1">加载器:</span>
                    {file.modLoaders.length > 0 ? (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-mc-green/15 text-mc-green-light">
                        {LOADER_BADGES[file.modLoaders[0]?.toLowerCase()] || file.modLoaders[0]}
                      </span>
                    ) : (
                      <span className="text-xs text-mc-muted">-</span>
                    )}
                  </div>

                  {/* 版本类型 */}
                  <div className="w-full md:w-16 shrink-0">
                    <span className="md:hidden text-xs text-mc-muted mr-1">类型:</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded border ${typeInfo.color}`}>
                      {typeInfo.label}
                    </span>
                  </div>

                  {/* 文件大小 */}
                  <div className="w-full md:w-16 shrink-0 text-right">
                    <span className="md:hidden text-xs text-mc-muted mr-1">大小:</span>
                    <span className="text-xs text-mc-muted">{formatFileSize(file.fileSize)}</span>
                  </div>

                  {/* 下载按钮 */}
                  <div className="w-full md:w-20 shrink-0 text-right">
                    <DownloadButton source={source} modId={modId} file={file} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
