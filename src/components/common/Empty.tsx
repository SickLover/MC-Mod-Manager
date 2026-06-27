interface EmptyProps {
  message?: string;
  icon?: string;
}

export default function Empty({ message = '暂无数据', icon = '📭' }: EmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-mc-muted">
      <span className="text-4xl mb-3">{icon}</span>
      <p className="text-sm">{message}</p>
    </div>
  );
}
