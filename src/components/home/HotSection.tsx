import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import type { ResourceItem } from '@/types';
import ResourceCard from './ResourceCard';
import Loading from '@/components/common/Loading';
import Empty from '@/components/common/Empty';

const TABS = [
  { key: 'mod', label: 'Mod' },
  { key: 'resourcepack', label: '资源包' },
  { key: 'shader', label: '光影' },
] as const;

export default function HotSection() {
  const [activeTab, setActiveTab] = useState<string>('mod');
  const [data, setData] = useState<Record<string, ResourceItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await invoke<[string, ResourceItem[]][]>('popular');
        const map: Record<string, ResourceItem[]> = {};
        for (const [key, items] of result) {
          map[key] = items;
        }
        setData(map);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const currentItems = data[activeTab] || [];

  return (
    <section className="mt-6">
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-4 border-b border-mc-border">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-all duration-200 border-b-2 -mb-px
              ${activeTab === tab.key
                ? 'border-mc-green text-mc-green-light'
                : 'border-transparent text-mc-muted hover:text-mc-text'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <Loading />
      ) : error ? (
        <div className="text-center py-8 text-red-400 text-sm">{error}</div>
      ) : currentItems.length > 0 ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {currentItems.map(r => (
              <ResourceCard key={`${r.source}-${r.id}`} resource={r} compact />
            ))}
          </div>
          {currentItems.length > 0 && (
            <div className="mt-4 text-center">
              <Link
                to={`/category/${activeTab}`}
                className="inline-flex items-center gap-1 text-sm text-mc-green hover:text-mc-green-light
                           transition-colors"
              >
                查看全部
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          )}
        </>
      ) : (
        <Empty message="暂无热门内容" />
      )}
    </section>
  );
}
