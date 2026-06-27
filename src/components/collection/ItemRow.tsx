import { Link } from 'react-router-dom';
import type { CollectionItem, ModFile } from '@/types';

interface ItemRowProps {
  item: CollectionItem;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  onRemove: () => void;
  fileVersions: ModFile[];
  selectedVersion: string;
  onVersionChange: (fileId: string) => void;
}

export default function ItemRow({
  item, checked, onToggle, onRemove,
  fileVersions = [], selectedVersion, onVersionChange,
}: ItemRowProps) {
  const sourceLabel = item.source === 'curseforge' ? 'CF' : 'MR';
  const sourceColor = item.source === 'curseforge'
    ? 'bg-orange-500/10 text-orange-400'
    : 'bg-green-500/10 text-green-400';

  return (
    <div
      className={`group flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors
        ${checked ? 'bg-mc-green/5 border border-mc-green/20' : 'bg-mc-card border border-transparent'}
        hover:bg-mc-card-hover`}
    >
      {/* 复选框 */}
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onToggle(e.target.checked)}
        className="w-4 h-4 rounded border-mc-muted/30 bg-mc-bg
                   accent-mc-green cursor-pointer flex-shrink-0"
      />

      {/* 图标 */}
      <div className="w-8 h-8 rounded-md bg-mc-bg border border-white/5 flex items-center justify-center overflow-hidden flex-shrink-0">
        {item.iconUrl ? (
          <img src={item.iconUrl} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-sm">📦</span>
        )}
      </div>

      {/* 中间：名称 + 来源标签 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Link
            to={`/resource/${item.source}/${item.resourceId}`}
            className="text-sm text-mc-text hover:text-mc-green-light transition-colors truncate"
          >
            {item.name}
          </Link>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase flex-shrink-0 ${sourceColor}`}>
            {sourceLabel}
          </span>
        </div>
        {item.summary && (
          <p className="text-xs text-mc-muted truncate mt-0.5">{item.summary}</p>
        )}
      </div>

      {/* 版本选择 */}
      <div className="flex-shrink-0 w-[160px]">
        <select
          value={selectedVersion}
          onChange={(e) => onVersionChange(e.target.value)}
          className="w-full px-2 py-1 bg-mc-bg border border-white/10 rounded text-xs text-mc-text
                     focus:outline-none focus:border-mc-green/40 transition-colors cursor-pointer"
        >
          <option value="">自动（最新版）</option>
          {fileVersions.map(f => (
            <option key={f.id} value={f.id}>
              {f.displayName || f.fileName}
            </option>
          ))}
        </select>
        {fileVersions.length > 0 && (
          <div className="text-[10px] text-mc-muted/60 text-right mt-0.5">
            {fileVersions.length} 个版本
          </div>
        )}
      </div>

      {/* 下载数 */}
      <div className="hidden sm:block text-xs text-mc-muted flex-shrink-0 w-16 text-right">
        ⬇ {item.downloadCount.toLocaleString()}
      </div>

      {/* 移除按钮 */}
      <button
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-md bg-mc-bg border border-white/5
                   flex items-center justify-center text-mc-muted hover:text-red-400
                   hover:border-red-400/30 transition-all text-xs flex-shrink-0"
        title="从收藏夹移除"
      >
        🚫
      </button>
    </div>
  );
}
