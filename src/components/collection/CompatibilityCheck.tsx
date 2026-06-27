import type { CollectionItem } from '@/types';

interface Props {
  selectedItems: CollectionItem[];
}

export default function CompatibilityCheck({ selectedItems }: Props) {
  if (selectedItems.length < 2) return null;

  // 解析每个 item 的 gameVersions JSON → 取交集
  const allVersions = selectedItems.map(item => {
    try { return JSON.parse(item.gameVersions) as string[]; }
    catch { return []; }
  });

  const intersection = allVersions.reduce((acc, vers) =>
    acc.filter(v => vers.includes(v))
  );

  return (
    <div className="grid grid-cols-2 gap-4 p-4 bg-mc-card rounded-mc border border-white/5">
      {/* 左栏：兼容版本交集 */}
      <div>
        <h4 className="text-sm font-medium text-mc-text mb-2">兼容版本</h4>
        <div className="flex flex-wrap gap-1">
          {intersection.length > 0
            ? intersection.map(v => (
                <span
                  key={v}
                  className="text-xs px-2 py-0.5 rounded-full bg-mc-green/10 text-mc-green font-medium"
                >
                  {v}
                </span>
              ))
            : <span className="text-red-400 text-sm">无交集</span>
          }
        </div>
      </div>

      {/* 右栏：各资源版本详情 */}
      <div>
        <h4 className="text-sm font-medium text-mc-text mb-2">各资源版本</h4>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {selectedItems.map(item => (
            <div key={item.id} className="text-xs text-mc-muted">
              {item.name}: {(() => {
                try { return (JSON.parse(item.gameVersions) as string[]).join(', '); }
                catch { return '-'; }
              })()}
              {/* 标红没有交集的资源 */}
              {intersection.length > 0 && (() => {
                try {
                  const versions = JSON.parse(item.gameVersions) as string[];
                  return !versions.some(v => intersection.includes(v));
                } catch { return false; }
              })() && (
                <span className="text-red-400 ml-1">⚠️ 无交集</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
