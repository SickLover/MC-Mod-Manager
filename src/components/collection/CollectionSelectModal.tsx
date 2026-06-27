import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { createPortal } from 'react-dom';
import type { Collection, ResourceItem } from '@/types';
import { useToast } from '@/components/common/ToastProvider';

interface Props {
  resource: ResourceItem;
  onClose: () => void;
}

export default function CollectionSelectModal({ resource, onClose }: Props) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    invoke<Collection[]>('list_collections')
      .then(all => {
        // 只显示类型匹配的收藏夹
        setCollections(all.filter(c => c.collectionType === resource.type));
      })
      .catch(() => toast?.error('加载收藏夹失败'))
      .finally(() => setLoading(false));
  }, [resource.type]);

  const handleSelect = async (collectionId: string) => {
    setAdding(collectionId);
    try {
      await invoke('add_item_to_collection', {
        collectionId,
        item: {
          resourceId: resource.id,
          source: resource.source,
          name: resource.name,
          summary: resource.summary || '',
          iconUrl: resource.iconUrl || null,
          downloadCount: resource.downloadCount,
          author: resource.author || '',
          resourceType: resource.type,
          categories: JSON.stringify(resource.categories || []),
          gameVersions: JSON.stringify(resource.gameVersions || []),
        },
      });
      toast?.success(`已添加到「${collections.find(c => c.id === collectionId)?.name}」`);
      onClose();
    } catch (err) {
      toast?.error(`添加失败: ${String(err)}`);
    } finally {
      setAdding(null);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50"
         onClick={onClose}>
      <div className="bg-mc-card rounded-mc border border-mc-border p-6 w-96 max-h-96 overflow-y-auto"
           onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-mc-text mb-1">添加到收藏夹</h3>
        <p className="text-sm text-mc-muted mb-4 truncate">{resource.name}</p>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-mc-green border-t-transparent rounded-full animate-spin" />
            <span className="text-mc-muted text-sm ml-2">加载中...</span>
          </div>
        ) : collections.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-mc-muted text-sm mb-2">暂无收藏夹</p>
            <p className="text-xs text-mc-muted">请先在收藏夹页面创建一个</p>
          </div>
        ) : (
          <div className="space-y-1">
            {collections.map(c => (
              <button
                key={c.id}
                onClick={() => handleSelect(c.id)}
                disabled={adding === c.id}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-mc-card-hover
                           transition-colors duration-200 text-mc-text text-sm border border-transparent
                           hover:border-white/5 disabled:opacity-50"
              >
                <span className="text-base">📁</span>
                <span className="flex-1 text-left truncate">{c.name}</span>
                <span className="text-mc-muted text-xs">({c.itemCount})</span>
                {adding === c.id && (
                  <div className="w-4 h-4 border-2 border-mc-green border-t-transparent rounded-full animate-spin" />
                )}
              </button>
            ))}
          </div>
        )}

        <button onClick={onClose}
          className="mt-4 w-full py-2 text-mc-muted text-sm hover:text-mc-text transition-colors rounded-md hover:bg-white/5">
          取消
        </button>
      </div>
    </div>,
    document.body,
  );
}
