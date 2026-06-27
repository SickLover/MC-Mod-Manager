import Empty from '@/components/common/Empty';

export default function UpdatesPage() {
  // 更新提醒列表 — 本步用最简版，真实版本对比逻辑留给后续扩展
  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-mc-text mb-6">更新提醒</h1>
      <Empty message="暂无更新提醒" icon="🎉" />
    </div>
  );
}
