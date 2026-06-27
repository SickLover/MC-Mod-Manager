import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { Toast } from '@/components/common/Toast';

type ToastType = 'success' | 'error' | 'info';

interface ToastState {
  message: string;
  type: ToastType;
  visible: boolean;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState>({ message: '', type: 'info', visible: false });

  const show = useCallback((message: string, type: ToastType) => {
    setToast({ message, type, visible: true });
  }, []);

  const close = useCallback(() => {
    setToast((prev) => ({ ...prev, visible: false }));
  }, []);

  return (
    <ToastContext.Provider value={{ success: (m) => show(m, 'success'), error: (m) => show(m, 'error'), info: (m) => show(m, 'info') }}>
      {children}
      <Toast message={toast.message} type={toast.type} visible={toast.visible} onClose={close} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue | null {
  return useContext(ToastContext);
}
