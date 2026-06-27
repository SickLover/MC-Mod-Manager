import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { CollectionItem, ModFile, ResourceDetail } from '@/types';
import ItemRow from '@/components/collection/ItemRow';
import CompatibilityCheck from '@/components/collection/CompatibilityCheck';
import Loading from '@/components/common/Loading';
import Empty from '@/components/common/Empty';
import { useToast } from '@/components/common/ToastProvider';

const LOADERS = [
  { value: 'all', label: '全部加载器' },
  { value: 'forge', label: 'Forge' },
  { value: 'fabric', label: 'Fabric' },
  { value: 'neoforge', label: 'NeoForge' },
  { value: 'quilt', label: 'Quilt' },
];

const RELEASE_TYPES = [
  { value: 'all', label: '全部版本类型' },
  { value: 'release', label: 'Release' },
  { value: 'beta', label: 'Beta' },
  { value: 'alpha', label: 'Alpha' },
];

const SOURCES = [
  { value: 'all', label: '全部来源' },
  { value: 'curseforge', label: 'CurseForge' },
  { value: 'modrinth', label: 'Modrinth' },
];

export default function CollectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filterVersion, setFilterVersion] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [filterLoader, setFilterLoader] = useState('all');
  const [filterReleaseType, setFilterReleaseType] = useState('all');
  const [versionSelections, setVersionSelections] = useState<Record<string, string>>({});
  const [itemFiles, setItemFiles] = useState<Record<string, ModFile[]>>({});
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const toast = useToast();

  const loadItems = useCallback(async () => {
    if (!id) return;
    try {
      const data = await invoke<CollectionItem[]>('list_collection_items', { collectionId: id });
      setItems(data);
      setLoading(false);

      // 后台加载每个资源的文件版本列表（串行，避免 API 限速）
      setLoadingVersions(true);
      const files: Record<string, ModFile[]> = {};
      for (const item of data) {
        try {
          const detail = await invoke<ResourceDetail>('get_resource_detail', {
            source: item.source,
            id: item.resourceId,
          });
          files[item.id] = detail.files || [];
        } catch (e) {
          files[item.id] = [];
        }
      }
      setItemFiles(files);
      setLoadingVersions(false);
    } catch (err) {
      toast?.error(`加载失败: ${String(err)}`);
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => { loadItems(); }, [loadItems]);

  // 提取所有游戏版本用于筛选（最新在前）
  const allVersions = [...new Set(items.flatMap(i => {
    try { return JSON.parse(i.gameVersions) as string[]; }
    catch { return []; }
  }))].sort().reverse();

  // 获取某个 item 的已筛选文件版本（按游戏版本 + release 类型，最新在前）
  const getFilteredFiles = (itemId: string): ModFile[] => {
    const files = itemFiles[itemId] || [];
    return files
      .filter(f => {
        if (filterVersion !== 'all' && !f.gameVersions.includes(filterVersion)) return false;
        if (filterReleaseType !== 'all' && f.releaseType !== filterReleaseType) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  };

  // 筛选资源列表
  const filtered = items.filter(item => {
    if (filterSource !== 'all' && item.source !== filterSource) return false;
    if (filterVersion !== 'all') {
      try {
        const versions: string[] = JSON.parse(item.gameVersions);
        if (!versions.includes(filterVersion)) return false;
      } catch { return false; }
    }
    if (filterLoader !== 'all') {
      try {
        const cats: string[] = JSON.parse(item.categories);
        if (!cats.some(c => c.toLowerCase() === filterLoader)) return false;
      } catch { return false; }
    }
    return true;
  });

  const allSelected = filtered.length > 0 && selected.size === filtered.length;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(i => i.id)));
    }
  };

  const handleBatchDownload = async (mode: 'zip' | 'folder') => {
    const selectedItems = items.filter(i => selected.has(i.id));
    if (selectedItems.length === 0) return;
    setDownloading(true);
    try {
      const files = selectedItems.map(i => ({
        source: i.source,
        modId: i.resourceId,
        fileId: i.resourceId,
        fileName: `${i.name}.jar`,
      }));

      const unlisten = await listen<{ current: number; total: number; fileName: string }>(
        'batch-progress',
        (_event) => {},
      );

      const resultPath = await invoke<string>('batch_download', { files, mode });
      toast?.success(`已保存到: ${resultPath}`);
      unlisten();
    } catch (err) {
      toast?.error(`批量下载失败: ${String(err)}`);
    } finally {
      setDownloading(false);
    }
  };

  const handleRemove = async (itemId: string) => {
    try {
      await invoke('remove_item_from_collection', { collectionId: id, itemId });
      setItems(prev => prev.filter(i => i.id !== itemId));
      setSelected(prev => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
      toast?.success('已移除');
    } catch (err) {
      toast?.error(`移除失败: ${String(err)}`);
    }
  };

  const handleVersionChange = (itemId: string, fileId: string) => {
    setVersionSelections(prev => ({ ...prev, [itemId]: fileId }));
  };

  if (loading) return <Loading text="加载收藏夹..." />;
  if (items.length === 0) return <Empty message="收藏夹是空的" icon="📂" />;

  return (
    <div className="max-w-5xl mx-auto px-6 pb-32">
      {/* sticky header */}
      <div className="sticky top-14 z-40 bg-mc-bg/95 backdrop-blur py-4 border-b border-white/5 mb-4">
        <Link to="/collections" className="text-mc-muted hover:text-mc-text text-sm mb-2 inline-block transition-colors">
          ← 返回收藏夹列表
        </Link>
        <h1 className="text-xl font-bold text-mc-text">
          收藏夹详情{' '}
          <span className="text-mc-muted text-sm font-normal">({items.length} 个资源)</span>
        </h1>
      </div>

      {/* 筛选栏 */}
      <div className="flex flex-wrap gap-3 mb-4">
        {/* 来源筛选 */}
        <select
          value={filterSource}
          onChange={e => setFilterSource(e.target.value)}
          className="px-3 py-1.5 bg-mc-card border border-white/5 rounded-md text-sm text-mc-text
                     focus:outline-none focus:border-mc-green/40 transition-colors cursor-pointer"
        >
          {SOURCES.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        {/* 游戏版本筛选 */}
        <select
          value={filterVersion}
          onChange={e => setFilterVersion(e.target.value)}
          className="px-3 py-1.5 bg-mc-card border border-white/5 rounded-md text-sm text-mc-text
                     focus:outline-none focus:border-mc-green/40 transition-colors cursor-pointer"
        >
          <option value="all">全部版本</option>
          {allVersions.map(v => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>

        {/* 加载器筛选 */}
        <select
          value={filterLoader}
          onChange={e => setFilterLoader(e.target.value)}
          className="px-3 py-1.5 bg-mc-card border border-white/5 rounded-md text-sm text-mc-text
                     focus:outline-none focus:border-mc-green/40 transition-colors cursor-pointer"
        >
          {LOADERS.map(l => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>

        {/* 版本类型筛选（影响每行版本下拉选项） */}
        <select
          value={filterReleaseType}
          onChange={e => setFilterReleaseType(e.target.value)}
          className="px-3 py-1.5 bg-mc-card border border-white/5 rounded-md text-sm text-mc-text
                     focus:outline-none focus:border-mc-green/40 transition-colors cursor-pointer"
        >
          {RELEASE_TYPES.map(r => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>

        {loadingVersions && (
          <span className="text-xs text-mc-muted self-center">加载版本中...</span>
        )}

        {/* 筛选结果计数 */}
        {filtered.length !== items.length && (
          <span className="text-xs text-mc-muted self-center">
            筛选出 {filtered.length} 个
          </span>
        )}
      </div>

      {/* 全选 bar */}
      <div className="flex items-center gap-3 mb-2 px-2">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={toggleAll}
          className="w-4 h-4 rounded border-mc-muted/30 bg-mc-bg
                     accent-mc-green cursor-pointer"
        />
        <span className="text-sm text-mc-muted">
          {selected.size > 0
            ? `已选 ${selected.size}/${filtered.length} 个`
            : '全选'
          }
        </span>
      </div>

      {/* ItemRow 列表 */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center text-mc-muted text-sm">
          没有符合筛选条件的资源
        </div>
      ) : (
        <div className="space-y-0.5">
          {filtered.map(item => {
            const filteredFiles = getFilteredFiles(item.id);
            const currentVersion = versionSelections[item.id] ?? '';
            return (
              <ItemRow
                key={item.id}
                item={item}
                checked={selected.has(item.id)}
                onToggle={(checked) => {
                  setSelected(prev => {
                    const next = new Set(prev);
                    checked ? next.add(item.id) : next.delete(item.id);
                    return next;
                  });
                }}
                onRemove={() => handleRemove(item.id)}
                fileVersions={filteredFiles}
                selectedVersion={currentVersion}
                onVersionChange={(fileId) => handleVersionChange(item.id, fileId)}
              />
            );
          })}
        </div>
      )}

      {/* CompatibilityCheck */}
      {selected.size >= 2 && (
        <div className="mt-6 animate-fade-in">
          <CompatibilityCheck
            selectedItems={items.filter(i => selected.has(i.id))}
          />
        </div>
      )}

      {/* sticky 底部栏 */}
      {selected.size > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50 bg-mc-bg/95 backdrop-blur
                     border-t border-white/5 px-6 py-3 flex items-center gap-4 flex-wrap"
        >
          <span className="text-sm text-mc-muted font-medium">已选 {selected.size} 个</span>

          <button
            onClick={() => handleBatchDownload('zip')}
            disabled={downloading}
            className="px-4 py-2 bg-mc-green text-black rounded-md text-sm font-medium
                       hover:bg-mc-green-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            📦 下载为 ZIP
          </button>

          <button
            onClick={() => handleBatchDownload('folder')}
            disabled={downloading}
            className="px-4 py-2 bg-mc-card border border-white/5 text-mc-text rounded-md text-sm
                       hover:bg-mc-card-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            📁 下载为文件夹
          </button>

          {downloading && (
            <span className="text-sm text-mc-muted">下载中...</span>
          )}

          <div className="ml-auto hidden lg:block text-xs text-mc-muted truncate max-w-xs">
            {items.filter(i => selected.has(i.id)).map(i => i.name).join(', ')}
          </div>
        </div>
      )}
    </div>
  );
}
