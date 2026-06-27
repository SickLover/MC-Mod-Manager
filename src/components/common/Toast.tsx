import { useEffect, useState } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface ToastProps {
  message: string;
  type?: ToastType;
  /** 外部控制显示/隐藏 */
  visible: boolean;
  /** 消失后回调，用于重置外部 visible 状态 */
  onClose: () => void;
  /** 自动消失时长（毫秒），默认 3000 */
  duration?: number;
}

const ICON_MAP: Record<ToastType, string> = {
  success: '✅',
  error: '❌',
  info: 'ℹ️',
};

const COLOR_MAP: Record<ToastType, string> = {
  success: 'border-creeper/40 bg-creeper/10',
  error: 'border-red-500/40 bg-red-500/10',
  info: 'border-blue-400/40 bg-blue-400/10',
};

export function Toast({
  message,
  type = 'info',
  visible,
  onClose,
  duration = 3000,
}: ToastProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (visible) {
      setShow(true);
      const timer = setTimeout(() => {
        setShow(false);
        // 等淡出动画结束再通知父组件
        setTimeout(onClose, 200);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [visible, duration, onClose]);

  if (!visible && !show) return null;

  return (
    <div
      className={`fixed bottom-6 right-6 z-[9999] max-w-sm px-4 py-3 rounded-mc border shadow-lg
        flex items-center gap-3 transition-all duration-200
        ${COLOR_MAP[type]}
        ${show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}
      `}
    >
      <span className="text-base flex-shrink-0">{ICON_MAP[type]}</span>
      <span className="text-mc-text text-sm flex-1">{message}</span>
      <button
        onClick={() => {
          setShow(false);
          setTimeout(onClose, 200);
        }}
        className="text-mc-muted hover:text-mc-text transition-colors flex-shrink-0"
      >
        ✕
      </button>
    </div>
  );
}

export default Toast;
