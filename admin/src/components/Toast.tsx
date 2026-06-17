import { CheckCircle, XCircle } from 'lucide-react';
import type { ToastState } from '../lib/types';

interface Props {
  toast: ToastState;
}

export function Toast({ toast }: Props) {
  return (
    <div
      className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-lg text-white max-w-[340px] w-[calc(100%-2rem)] transition-all duration-300 ${
        toast.visible
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-3 pointer-events-none'
      } ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-500'}`}
    >
      {toast.type === 'success' ? (
        <CheckCircle size={18} className="shrink-0" />
      ) : (
        <XCircle size={18} className="shrink-0" />
      )}
      <span className="text-sm">{toast.message}</span>
    </div>
  );
}
