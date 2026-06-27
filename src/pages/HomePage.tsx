import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { ResourceItem } from '@/types';
import SearchBar from '@/components/home/SearchBar';
import ResourceCard from '@/components/home/ResourceCard';
import HotSection from '@/components/home/HotSection';
import RecentlyViewed from '@/components/home/RecentlyViewed';
import UpdateAlerts from '@/components/home/UpdateAlerts';
import Loading from '@/components/common/Loading';

export default function HomePage() {
  const [results, setResults] = useState<ResourceItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (query: string) => {
    setSearching(true);
    setError(null);
    try {
      const data = await invoke<ResourceItem[]>('search', { query });
      setResults(data);
    } catch (err) {
      setError(String(err));
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  // 清除搜索，回到热门视图
  const handleClear = () => {
    setResults(null);
    setError(null);
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* 搜索栏 — 始终显示 */}
      <div className="mb-6 pt-2">
        <SearchBar onSearch={handleSearch} onClear={handleClear} />
      </div>

      {/* 搜索结果模式 */}
      {results !== null || searching || error ? (
        <>
          {results !== null && !searching && !error && (
            <div className="mb-4">
              <button
                onClick={handleClear}
                className="inline-flex items-center gap-1 text-sm text-mc-muted hover:text-mc-text
                           transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15 19l-7-7 7-7" />
                </svg>
                返回热门
              </button>
            </div>
          )}
          {searching ? (
            <Loading />
          ) : error ? (
            <div className="text-center py-16 text-red-400 text-sm">{error}</div>
          ) : results && results.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {results.map((r) => (
                <ResourceCard key={`${r.source}-${r.id}`} resource={r} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 text-mc-muted text-sm">
              未找到相关资源，试试其他关键词
            </div>
          )}
        </>
      ) : (
        /* 默认热门模式 */
        <>
          <HotSection />
          <UpdateAlerts />
          <RecentlyViewed />
        </>
      )}
    </div>
  );
}
