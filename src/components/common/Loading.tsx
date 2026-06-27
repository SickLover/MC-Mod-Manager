interface LoadingProps {
  /** 加载提示文字，不传则只显示旋转圈 */
  text?: string;
}

export default function Loading({ text }: LoadingProps) {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="flex flex-col items-center gap-3">
        {/* 苦力怕绿色旋转加载圈 */}
        <div className="w-8 h-8 border-2 border-creeper/30 border-t-creeper rounded-full animate-spin" />
        {text && (
          <span className="text-mc-muted text-sm">{text}</span>
        )}
      </div>
    </div>
  );
}
