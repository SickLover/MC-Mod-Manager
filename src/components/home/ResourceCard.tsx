import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ResourceItem } from '@/types';
import { formatDownloads } from '@/lib/format';
import ContextMenu, { type ContextMenuItem } from './ContextMenu';
import CollectionSelectModal from '@/components/collection/CollectionSelectModal';

interface ResourceCardProps {
  resource: ResourceItem;
  compact?: boolean;
}

export default function ResourceCard({ resource, compact = false }: ResourceCardProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const navigate = useNavigate();

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const fallbackIcon = () => {
    switch (resource.type) {
      case 'shader':
        return '✨';
      case 'modpack':
        return '📦';
      case 'resourcepack':
        return '🎨';
      default:
        return '🔧';
    }
  };

  const sourceLabel = resource.source === 'curseforge' ? 'CF' : 'MR';
  const sourceColor =
    resource.source === 'curseforge'
      ? 'bg-orange-500/20 text-orange-400'
      : 'bg-blue-500/20 text-blue-400';

  const menuItems: ContextMenuItem[] = [
    {
      label: '查看详情',
      icon: '📋',
      onClick: () => navigate(`/resource/${resource.source}/${resource.id}`),
    },
    {
      label: '添加到收藏夹',
      icon: '📁',
      onClick: () => {
        setShowCollectionModal(true);
      },
    },
  ];

  const cardContent = (
    <div
      className={`relative bg-mc-card border border-white/5 rounded-mc
                  transition-all duration-200 hover:bg-mc-card-hover hover:border-mc-green/20
                  hover:-translate-y-1 hover:shadow-lg hover:shadow-mc-green/5
                  ${compact ? 'p-3' : 'p-4'}`}
    >
      {/* 图标 + 标题行 */}
      <div className={`flex items-start gap-3 ${compact ? 'mb-2' : 'mb-3'}`}>
        {/* 图标 */}
        <div className={`${compact ? 'w-10 h-10' : 'w-12 h-12'} rounded-lg bg-mc-bg border border-white/5 flex items-center justify-center flex-shrink-0 overflow-hidden`}>
          {resource.iconUrl ? (
            <img
              src={resource.iconUrl}
              alt={resource.name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <span className="text-xl">{fallbackIcon()}</span>
          )}
        </div>

        {/* 标题 + 作者 */}
        <div className="flex-1 min-w-0">
          <h3 className={`font-semibold text-mc-text truncate group-hover:text-mc-green-light transition-colors ${compact ? 'text-xs' : 'text-sm'}`}>
            {resource.name}
          </h3>
          <p className="text-xs text-mc-muted mt-0.5 truncate">
            {resource.author}
          </p>
        </div>
      </div>

      {/* 描述（compact 模式下隐藏） */}
      {!compact && (
        <p className="text-xs text-mc-muted line-clamp-2 mb-3 leading-relaxed">
          {resource.summary || '暂无描述'}
        </p>
      )}

      {/* 底部信息行 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* 平台标签 */}
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${sourceColor}`}>
            {sourceLabel}
          </span>
          {/* 下载量 */}
          <span className="text-xs text-mc-muted">
            {formatDownloads(resource.downloadCount)} ↓
          </span>
        </div>
        {/* 收藏按钮 */}
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowCollectionModal(true);
          }}
          className="text-mc-muted hover:text-mc-green transition-colors p-1"
          title="添加到收藏夹"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 4v16m-8-8h16" />
          </svg>
        </button>
      </div>
    </div>
  );

  return (
    <div onContextMenu={handleContextMenu} className="group">
      <Link
        to={`/resource/${resource.source}/${resource.id}`}
        className="block"
      >
        {cardContent}
      </Link>

      {contextMenu && (
        <ContextMenu
          items={menuItems}
          position={contextMenu}
          onClose={() => setContextMenu(null)}
        />
      )}

      {showCollectionModal && (
        <CollectionSelectModal
          resource={resource}
          onClose={() => setShowCollectionModal(false)}
        />
      )}
    </div>
  );
}
