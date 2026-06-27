import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import type { ResourceItem } from '@/types';
import ResourceCard from '@/components/home/ResourceCard';
import Loading from '@/components/common/Loading';
import Empty from '@/components/common/Empty';

const PAGE_SIZE = 20;

const TYPE_LABELS: Record<string, string> = {
  mod: 'Mod',
  modpack: '整合包',
  resourcepack: '资源包',
  shader: '光影',
  world: '世界',
  datapack: '数据包',
};

export default function CategoryPage() {
  const { type } = useParams<{ type: string }>();
  const [items, setItems] = useState<ResourceItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [jumpPage, setJumpPage] = useState('');

  useEffect(() => {
    if (!type) return;
    setLoading(true);
    invoke<[ResourceItem[], number]>('browse_category', { resourceType: type, page })
      .then(([data, totalCount]) => {
        setItems(data);
        setTotal(totalCount);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [type, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-mc-text mb-6">
        分类浏览 · {TYPE_LABELS[type || 'mod'] || type}
      </h1>

      {loading ? <Loading /> : items.length === 0 ? <Empty message="该分类暂无内容" /> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
            {items.map(r => <ResourceCard key={`${r.source}-${r.id}`} resource={r} />)}
          </div>

          {/* 分页控件 */}
          <div className="flex items-center justify-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 rounded-md text-sm bg-mc-card hover:bg-mc-card-hover
                         disabled:opacity-30 transition-colors"
            >
              上一页
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
              .map((p, i, arr) => (
                <span key={p}>
                  {i > 0 && arr[i - 1] !== p - 1 && <span className="text-mc-muted mx-0.5">...</span>}
                  <button
                    onClick={() => setPage(p)}
                    className={`w-8 h-8 rounded-md text-sm transition-colors
                      ${p === page ? 'bg-mc-green text-white' : 'bg-mc-card hover:bg-mc-card-hover text-mc-text'}`}
                  >{p}</button>
                </span>
              ))}

            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 rounded-md text-sm bg-mc-card hover:bg-mc-card-hover
                         disabled:opacity-30 transition-colors"
            >
              下一页
            </button>

            {/* 跳页 */}
            <form
              onSubmit={e => {
                e.preventDefault();
                const n = parseInt(jumpPage);
                if (n >= 1 && n <= totalPages) {
                  setPage(n);
                  setJumpPage('');
                }
              }}
              className="flex items-center gap-1 ml-4"
            >
              <span className="text-xs text-mc-muted">跳至</span>
              <input
                value={jumpPage}
                onChange={e => setJumpPage(e.target.value)}
                className="w-10 h-7 rounded text-xs text-center bg-mc-card border border-mc-border text-mc-text"
                placeholder={`${page}`}
              />
              <span className="text-xs text-mc-muted">/ {totalPages} 页</span>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
