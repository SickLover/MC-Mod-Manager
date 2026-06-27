import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Collection, CollectionItem, ModFile, ResourceDetail } from '@/types';
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

// ----- 导入/导出类型 -----
interface ImportResult {
  added: number;
  skipped: number;
  errors: string[];
}

/// 从 categories JSON 或 resourceType 提取加载器
function extractLoader(item: CollectionItem): string {
  try {
    const cats: string[] = JSON.parse(item.categories);
    const loaderKeywords = ['forge', 'fabric', 'neoforge', 'quilt', 'rift', 'liteloader'];
    const found = cats.find(c => loaderKeywords.some(kw => c.toLowerCase().includes(kw)));
    if (found) {
      const lower = found.toLowerCase();
      if (lower.includes('forge')) return lower.includes('neo') ? 'NeoForge' : 'Forge';
      if (lower.includes('fabric')) return 'Fabric';
      if (lower.includes('quilt')) return 'Quilt';
      return found;
    }
  } catch {}
  return item.resourceType; // fallback
}

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

  // 导入/导出状态
  const [importFilePath, setImportFilePath] = useState<string | null>(null);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [collectionName, setCollectionName] = useState('收藏夹');

  const loadItems = useCallback(async () => {
    if (!id) return;
    try {
      const data = await invoke<CollectionItem[]>('list_collection_items', { collectionId: id });
      setItems(data);
      setLoading(false);

      // 获取收藏夹名称
      try {
        const allColls = await invoke<Collection[]>('list_collections');
        const current = allColls.find(c => c.id === id);
        if (current) setCollectionName(current.name);
      } catch { /* 忽略 */ }

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

  // 获取某个 item 的已筛选文件版本（按游戏版本 + 加载器 + release 类型，最新在前）
  const getFilteredFiles = (itemId: string): ModFile[] => {
    const files = itemFiles[itemId] || [];
    return files
      .filter(f => {
        if (filterVersion !== 'all' && !f.gameVersions.includes(filterVersion)) return false;
        if (filterLoader !== 'all' && !f.modLoaders.some(l => l.toLowerCase() === filterLoader)) return false;
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

  // ----- 导出 -----
  const handleExport = async () => {
    const selectedItems = items.filter(i => selected.has(i.id));
    if (selectedItems.length === 0) {
      toast?.info?.('请先勾选要导出的 Mod');
      return;
    }

    // 调 rfd 保存文件对话框（通过 Rust command）
    const filePath = await invoke<string>('pick_save_file', {
      defaultName: `${collectionName || 'mods'}.mcmodlist.json`,
    });
    if (!filePath) return; // 用户取消

    const exportItems = selectedItems.map(i => ({
      name: i.name,
      loader: extractLoader(i),
    }));

    try {
      await invoke('export_manifest', {
        items: exportItems,
        collectionName: collectionName || '未命名',
        savePath: filePath,
      });
      toast?.success?.(`已导出 ${exportItems.length} 个 Mod`);
    } catch (err) {
      toast?.error?.(`导出失败: ${String(err)}`);
    }
  };

  // ----- 导入 -----
  const handleImportClick = async () => {
    const path = await invoke<string>('pick_open_file');
    if (path) {
      setImportFilePath(path);
    }
  };

  const handleImportToCurrent = async () => {
    if (!importFilePath || !id) return;
    try {
      const result = await invoke<ImportResult>('import_manifest', {
        collectionId: id,
        filePath: importFilePath,
      });
      showImportResult(result);
      loadItems();
    } catch (err) {
      toast?.error?.(`导入失败: ${String(err)}`);
    } finally {
      setImportFilePath(null);
      setNewCollectionName('');
    }
  };

  const handleImportToNew = async () => {
    if (!importFilePath || !newCollectionName.trim()) return;
    try {
      const coll = await invoke<Collection>('create_collection', {
        name: newCollectionName.trim(),
        collectionType: 'mod',
        description: null as unknown as string,
      });
      const result = await invoke<ImportResult>('import_manifest', {
        collectionId: coll.id,
        filePath: importFilePath,
      });
      showImportResult(result);
    } catch (err) {
      toast?.error?.(`导入失败: ${String(err)}`);
    } finally {
      setImportFilePath(null);
      setNewCollectionName('');
    }
  };

  const showImportResult = (result: ImportResult) => {
    const msg = [`新增 ${result.added} 个`];
    if (result.skipped > 0) msg.push(`跳过 ${result.skipped} 个重复`);
    if (result.errors.length > 0) msg.push(`${result.errors.length} 个失败`);
    toast?.success?.(msg.join('，'));
  };

  if (loading) return <Loading text="加载收藏夹..." />;
  if (items.length === 0) return <Empty message="收藏夹是空的" icon="📂" />;

  return (
    <div className="max-w-5xl mx-auto px-6 pb-32">
      {/* sticky header */}
      <div className="sticky top-14 z-40 bg-mc-bg/95 backdrop-blur py-4 border-b border-white/5 mb-4">
        <div className="flex items-start justify-between">
          <div>
            <Link to="/collections" className="text-mc-muted hover:text-mc-text text-sm mb-2 inline-block transition-colors">
              ← 返回收藏夹列表
            </Link>
            <h1 className="text-xl font-bold text-mc-text">
              收藏夹详情{' '}
              <span className="text-mc-muted text-sm font-normal">({items.length} 个资源)</span>
            </h1>
          </div>
          <button
            onClick={handleImportClick}
            className="px-3 py-1.5 bg-mc-card border border-white/5 text-mc-text rounded-md text-sm
                       hover:bg-mc-card-hover transition-colors shrink-0"
          >
            📥 导入清单
          </button>
        </div>
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

      {/* CompatibilityCheck — 仅当所有已选资源都选定了具体版本后才检测 */}
      {selected.size >= 2 && (
        <div className="mt-6 animate-fade-in">
          {(() => {
            const selectedItems = items.filter(i => selected.has(i.id));
            const allHaveVersion = selectedItems.every(i => versionSelections[i.id]);
            if (!allHaveVersion) {
              return (
                <div className="p-4 bg-mc-card rounded-mc border border-white/5 text-center">
                  <p className="text-xs text-mc-muted">
                    请为每个资源选择具体版本后查看兼容性检测
                  </p>
                </div>
              );
            }
            const selectedVersions = selectedItems
              .map(i => {
                const file = itemFiles[i.id]?.find(f => f.id === versionSelections[i.id]);
                return file ? { item: i, file } : null;
              })
              .filter(Boolean) as { item: CollectionItem; file: ModFile }[];
            return <CompatibilityCheck selectedVersions={selectedVersions} />;
          })()}
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

          <button
            onClick={handleExport}
            className="px-4 py-2 bg-mc-card border border-white/5 text-mc-text rounded-md text-sm
                       hover:bg-mc-card-hover transition-colors"
          >
            📤 导出清单
          </button>

          {downloading && (
            <span className="text-sm text-mc-muted">下载中...</span>
          )}

          <div className="ml-auto hidden lg:block text-xs text-mc-muted truncate max-w-xs">
            {items.filter(i => selected.has(i.id)).map(i => i.name).join(', ')}
          </div>
        </div>
      )}

      {/* 导入目标选择 Modal */}
      {importFilePath && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50"
          onClick={() => { setImportFilePath(null); setNewCollectionName(''); }}
        >
          <div
            className="bg-mc-card rounded-mc border border-white/5 p-6 w-96 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-mc-text mb-4">导入到...</h3>

            {/* 导入到当前收藏夹 */}
            <button
              onClick={handleImportToCurrent}
              className="w-full text-left px-3 py-2 rounded-md hover:bg-mc-card-hover mb-2 transition-colors"
            >
              <span className="text-mc-text text-sm">📁 当前收藏夹</span>
            </button>

            {/* 新建收藏夹 */}
            <div className="mt-3">
              <p className="text-xs text-mc-muted mb-2">🆕 新建收藏夹</p>
              <div className="flex gap-2">
                <input
                  value={newCollectionName}
                  onChange={e => setNewCollectionName(e.target.value)}
                  placeholder="输入收藏夹名称"
                  className="flex-1 px-3 py-1.5 rounded-md bg-mc-bg border border-white/10 text-mc-text text-sm
                             focus:outline-none focus:border-mc-green/40 transition-colors"
                />
                <button
                  onClick={handleImportToNew}
                  disabled={!newCollectionName.trim()}
                  className="px-4 py-1.5 bg-mc-green text-white rounded-md text-sm font-medium
                             hover:bg-mc-green-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  创建并导入
                </button>
              </div>
            </div>

            <button
              onClick={() => { setImportFilePath(null); setNewCollectionName(''); }}
              className="mt-4 w-full py-2 text-mc-muted text-sm hover:text-mc-text transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
