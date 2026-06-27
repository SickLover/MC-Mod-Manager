import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import type { ResourceItem } from '@/types';

function fallbackIcon(type: string) {
  switch (type) {
    case 'shader':
      return '✨';
    case 'modpack':
      return '📦';
    case 'resourcepack':
      return '🎨';
    default:
      return '🔧';
  }
}

export default function RecentlyViewed() {
  const [items, setItems] = useState<ResourceItem[]>([]);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  useEffect(() => {
    invoke<ResourceItem[]>('list_recently_viewed')
      .then(setItems)
      .catch(() => {});
  }, []);

  const handleImageError = (key: string) => {
    setFailedImages(prev => new Set(prev).add(key));
  };

  if (items.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-mc-text mb-3">最近浏览</h2>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
        {items.map(r => {
          const key = `${r.source}-${r.id}`;
          const imgFailed = failedImages.has(key) || !r.iconUrl;

          return (
            <Link
              key={key}
              to={`/resource/${r.source}/${r.id}`}
              className="flex-shrink-0 w-32 p-2 rounded-lg bg-mc-card hover:bg-mc-card-hover
                         transition-all duration-200 hover:-translate-y-1 text-center"
            >
              {imgFailed ? (
                <div className="w-12 h-12 mx-auto rounded-lg mb-1 flex items-center justify-center bg-mc-bg border border-white/5 text-xl">
                  {fallbackIcon(r.type)}
                </div>
              ) : (
                <img
                  src={r.iconUrl ?? undefined}
                  alt={r.name}
                  className="w-12 h-12 mx-auto rounded-lg mb-1 object-cover"
                  onError={() => handleImageError(key)}
                />
              )}
              <p className="text-xs text-mc-text truncate">{r.name}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
