import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Collection } from '@/types';
import CollectionCard from '@/components/collection/CollectionCard';
import Loading from '@/components/common/Loading';
import Empty from '@/components/common/Empty';
import { useToast } from '@/components/common/ToastProvider';

export default function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('mod');

  // 重命名状态
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const loadCollections = useCallback(async () => {
    try {
      const data = await invoke<Collection[]>('list_collections');
      setCollections(data);
    } catch (err) {
      toast?.error(`加载失败: ${err}`);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadCollections(); }, [loadCollections]);

  // 自动聚焦输入框
  useEffect(() => {
    if (showCreate && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showCreate]);

  useEffect(() => {
    if (renamingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [renamingId]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await invoke('create_collection', { name: newName.trim(), collectionType: newType });
      setNewName('');
      setNewType('mod');
      setShowCreate(false);
      toast?.success('收藏夹已创建');
      loadCollections();
    } catch (err) {
      toast?.error(`创建失败: ${err}`);
    }
  };

  const handleCreateKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCreate();
    if (e.key === 'Escape') { setShowCreate(false); setNewName(''); setNewType('mod'); }
  };

  const handleRename = (id: string) => {
    const col = collections.find(c => c.id === id);
    if (col) {
      setRenamingId(id);
      setRenameValue(col.name);
    }
  };

  const handleRenameConfirm = async () => {
    if (!renamingId || !renameValue.trim()) return;
    try {
      await invoke('update_collection', { id: renamingId, name: renameValue.trim() });
      setRenamingId(null);
      toast?.success('已重命名');
      loadCollections();
    } catch (err) {
      toast?.error(`重命名失败: ${err}`);
    }
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleRenameConfirm();
    if (e.key === 'Escape') setRenamingId(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此收藏夹？收藏夹内的资源不会被删除。')) return;
    try {
      await invoke('delete_collection', { id });
      toast?.success('已删除');
      loadCollections();
    } catch (err) {
      toast?.error(`删除失败: ${err}`);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <Loading text="加载收藏夹..." />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-mc-text">收藏夹</h1>
          <p className="text-sm text-mc-muted mt-1">
            管理你的模组收藏
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-mc-green/10 hover:bg-mc-green/20
                     text-mc-green rounded-mc transition-colors text-sm font-medium"
        >
          <span className="text-lg leading-none">+</span>
          新建收藏夹
        </button>
      </div>

      {/* 新建表单 */}
      {showCreate && (
        <div className="mb-6 p-4 bg-mc-card rounded-mc border border-mc-green/20">
          <label className="block text-sm text-mc-text mb-2 font-medium">收藏夹名称</label>
          <div className="flex gap-2 mb-3">
            <input
              ref={inputRef}
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={handleCreateKeyDown}
              placeholder="输入收藏夹名称..."
              className="flex-1 px-3 py-2 bg-mc-bg border border-white/10 rounded-md
                         text-mc-text text-sm placeholder:text-mc-muted/50
                         focus:outline-none focus:border-mc-green/40 transition-colors"
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="px-4 py-2 bg-mc-green text-black rounded-md text-sm font-medium
                         hover:bg-mc-green-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              创建
            </button>
            <button
              onClick={() => { setShowCreate(false); setNewName(''); setNewType('mod'); }}
              className="px-4 py-2 text-mc-muted hover:text-mc-text text-sm transition-colors"
            >
              取消
            </button>
          </div>
          <label className="block text-sm text-mc-text mb-2 font-medium">收藏夹类型</label>
          <div className="flex gap-2">
            {[
              { value: 'mod', label: 'Mod', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
              { value: 'shader', label: '光影', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
              { value: 'resourcepack', label: '资源包', color: 'bg-green-500/10 text-green-400 border-green-500/30' },
            ].map(t => (
              <button
                key={t.value}
                onClick={() => setNewType(t.value)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all border
                  ${newType === t.value
                    ? t.color + ' border'
                    : 'text-mc-muted border-white/5 hover:border-white/20 bg-mc-bg'
                  }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 重命名 Modal */}
      {renamingId && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50"
             onClick={() => setRenamingId(null)}>
          <div className="bg-mc-card rounded-mc border border-mc-border p-6 w-80"
               onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-mc-text mb-4">重命名收藏夹</h3>
            <input
              ref={inputRef}
              type="text"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              className="w-full px-3 py-2 bg-mc-bg border border-white/10 rounded-md
                         text-mc-text text-sm placeholder:text-mc-muted/50
                         focus:outline-none focus:border-mc-green/40 transition-colors"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setRenamingId(null)}
                className="px-4 py-2 text-mc-muted hover:text-mc-text text-sm transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleRenameConfirm}
                disabled={!renameValue.trim()}
                className="px-4 py-2 bg-mc-green text-black rounded-md text-sm font-medium
                           hover:bg-mc-green-light transition-colors disabled:opacity-40"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 收藏夹列表 */}
      {collections.length === 0 ? (
        <Empty message="还没有收藏夹，创建一个吧" icon="📁" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {collections.map(col => (
            <CollectionCard
              key={col.id}
              collection={col}
              onRename={handleRename}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
