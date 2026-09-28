import { CircleAlert, CircleCheck, Info } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import s from './ui.module.css';

type ToastTone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

const ToastContext = createContext<(message: string, tone?: ToastTone) => void>(() => {});

const ICONS = {
  success: <CircleCheck aria-hidden color="var(--green)" />,
  error: <CircleAlert aria-hidden color="var(--red)" />,
  info: <Info aria-hidden color="var(--blue)" />,
};

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = ++nextId;
    setToasts((current) => [...current.slice(-2), { id, message, tone }]);
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 3500);
  }, []);

  return (
    <ToastContext value={show}>
      {children}
      {createPortal(
        <div className={s.toastHost} aria-live="polite">
          {toasts.map((toast) => (
            <div key={toast.id} className={s.toast} role={toast.tone === 'error' ? 'alert' : 'status'}>
              {ICONS[toast.tone]}
              {toast.message}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext>
  );
}

export const useToast = () => useContext(ToastContext);
