import { Link } from 'react-router-dom';
import type { Collection } from '@/types';

interface CollectionCardProps {
  collection: Collection;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function CollectionCard({ collection, onRename, onDelete }: CollectionCardProps) {
  const typeLabel = (() => {
    switch (collection.collectionType) {
      case 'mod': return 'Mod';
      case 'shader': return '光影';
      case 'resourcepack': return '资源包';
      default: return collection.collectionType;
    }
  })();

  const typeColor = (() => {
    switch (collection.collectionType) {
      case 'mod': return 'bg-blue-500/10 text-blue-400';
      case 'shader': return 'bg-purple-500/10 text-purple-400';
      case 'resourcepack': return 'bg-green-500/10 text-green-400';
      default: return 'bg-mc-green/10 text-mc-green';
    }
  })();

  return (
    <div className="relative bg-mc-card border border-white/5 rounded-mc p-5
                    transition-all duration-200 hover:bg-mc-card-hover hover:border-mc-green/20
                    hover:-translate-y-1 hover:shadow-lg hover:shadow-mc-green/5 group">
      <Link to={`/collections/${collection.id}`} className="block">
        {/* 图标 + 名称 */}
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-mc-bg border border-white/5 flex items-center justify-center text-xl flex-shrink-0">
            📁
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-mc-text truncate text-sm group-hover:text-mc-green-light transition-colors">
              {collection.name}
            </h3>
            <p className="text-xs text-mc-muted mt-0.5">
              创建于 {collection.createdAt ? new Date(collection.createdAt).toLocaleDateString() : '未知'}
            </p>
          </div>
        </div>

        {/* 描述 */}
        {collection.description && (
          <p className="text-xs text-mc-muted line-clamp-2 mb-3 leading-relaxed">
            {collection.description}
          </p>
        )}

        {/* 底部：项目数量 + 类型标签 */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs px-2 py-0.5 rounded-full bg-mc-green/10 text-mc-green font-medium">
            {collection.itemCount} 个项目
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${typeColor}`}>
            {typeLabel}
          </span>
        </div>
      </Link>

      {/* 操作按钮（悬停显示） */}
      <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <button
          onClick={(e) => { e.preventDefault(); onRename(collection.id); }}
          className="w-7 h-7 rounded-md bg-mc-bg border border-white/5 flex items-center justify-center
                     text-mc-muted hover:text-mc-text hover:border-mc-green/30 transition-all text-xs"
          title="重命名"
        >
          ✏️
        </button>
        <button
          onClick={(e) => { e.preventDefault(); onDelete(collection.id); }}
          className="w-7 h-7 rounded-md bg-mc-bg border border-white/5 flex items-center justify-center
                     text-mc-muted hover:text-red-400 hover:border-red-400/30 transition-all text-xs"
          title="删除"
        >
          🗑️
        </button>
      </div>
    </div>
  );
}
