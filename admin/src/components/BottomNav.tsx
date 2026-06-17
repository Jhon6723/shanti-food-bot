import { ClipboardList, BarChart2, Users } from 'lucide-react';
import type { AdminScreen } from '../lib/types';

interface Props {
  currentScreen: AdminScreen;
  onNavigate: (screen: AdminScreen) => void;
  pendingCount: number;
}

export function BottomNav({ currentScreen, onNavigate, pendingCount }: Props) {
  const tabs = [
    { id: 'orders' as AdminScreen, icon: ClipboardList, label: 'Pedidos' },
    { id: 'stats' as AdminScreen, icon: BarChart2, label: 'Stats' },
    { id: 'drivers' as AdminScreen, icon: Users, label: 'Equipo' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white shadow-[0_-1px_0_rgba(0,0,0,0.06)] z-40">
      <div className="max-w-[480px] mx-auto flex pb-safe">
        {tabs.map(({ id, icon: Icon, label }) => {
          const isActive = currentScreen === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors ${
                isActive ? 'text-emerald-600' : 'text-slate-400'
              }`}
            >
              <div className="relative">
                <Icon size={22} strokeWidth={isActive ? 2.5 : 1.75} />
                {id === 'orders' && pendingCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center px-0.5 leading-none">
                    {pendingCount > 9 ? '9+' : pendingCount}
                  </span>
                )}
              </div>
              <span className="text-xs">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
