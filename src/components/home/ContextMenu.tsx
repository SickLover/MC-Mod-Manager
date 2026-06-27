import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface ContextMenuItem {
  label: string;
  icon?: string;
  onClick: () => void;
  danger?: boolean;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
}

export default function ContextMenu({ items, position, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // 用 mousedown 而非 click，避免与右键点击冒泡冲突
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // ESC 关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // 边界检测：菜单不超出视口
  const adjustedPos = { ...position };
  if (menuRef.current) {
    const rect = menuRef.current.getBoundingClientRect();
    if (adjustedPos.x + rect.width > window.innerWidth) {
      adjustedPos.x = window.innerWidth - rect.width - 8;
    }
    if (adjustedPos.y + rect.height > window.innerHeight) {
      adjustedPos.y = window.innerHeight - rect.height - 8;
    }
  }

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[100] min-w-[160px] bg-mc-card border border-white/10 rounded-mc shadow-xl shadow-black/30 py-1 overflow-hidden"
      style={{ left: adjustedPos.x, top: adjustedPos.y }}
    >
      {items.map((item, idx) => (
        <button
          key={idx}
          onClick={() => {
            item.onClick();
            onClose();
          }}
          className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-colors duration-150
            ${item.danger
              ? 'text-red-400 hover:bg-red-500/10'
              : 'text-mc-text hover:bg-white/5'
            }`}
        >
          {item.icon && <span className="text-base w-5 text-center flex-shrink-0">{item.icon}</span>}
          <span className="flex-1">{item.label}</span>
        </button>
      ))}
    </div>,
    document.body
  );
}
