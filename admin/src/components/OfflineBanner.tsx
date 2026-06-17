import { WifiOff } from 'lucide-react';

interface Props {
  lastUpdate: string;
}

export function OfflineBanner({ lastUpdate }: Props) {
  return (
    <div className="sticky top-0 z-50 bg-amber-400 text-amber-900 px-4 py-2 flex items-center justify-center gap-2 text-sm">
      <WifiOff size={14} className="shrink-0" />
      <span>Sin conexión — última actualización: {lastUpdate}</span>
    </div>
  );
}
