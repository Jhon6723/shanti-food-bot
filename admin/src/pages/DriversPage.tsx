import { useState } from 'react';
import { Plus, ChevronRight } from 'lucide-react';
import * as Switch from '@radix-ui/react-switch';
import { useDrivers, useCreateDriver, useUpdateDriver } from '../hooks/useDrivers';
import { User, ToastState } from '../lib/types';
import { SkeletonCard } from '../components/SkeletonLoader';

interface CreatePayload {
  name: string;
  username: string;
  password: string;
  active: boolean;
}

interface Props {
  onToast: (msg: string, type: ToastState['type']) => void;
}

export function DriversPage({ onToast }: Props) {
  const { data: drivers = [], isLoading } = useDrivers();
  const createDriver = useCreateDriver();
  const updateDriver = useUpdateDriver();
  const [showModal, setShowModal] = useState(false);
  const [editingDriver, setEditingDriver] = useState<User | null>(null);

  const handleSave = async (data: CreatePayload) => {
    try {
      if (editingDriver) {
        await updateDriver.mutateAsync({
          id: editingDriver.id,
          data: { name: data.name, username: data.username, ...(data.password ? { password: data.password } : {}), active: data.active },
        });
        onToast('Repartidor actualizado', 'success');
      } else {
        await createDriver.mutateAsync({ ...data, role: 'delivery' });
        onToast('Repartidor creado', 'success');
      }
      setShowModal(false);
      setEditingDriver(null);
    } catch {
      onToast('No se pudo guardar. Intenta de nuevo.', 'error');
    }
  };

  const handleToggleActive = async (driver: User, active: boolean) => {
    try {
      await updateDriver.mutateAsync({ id: driver.id, data: { active } });
    } catch {
      onToast('No se pudo actualizar el estado.', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white sticky top-0 z-30 shadow-[0_1px_0_rgba(0,0,0,0.06)]">
        <div className="max-w-[480px] mx-auto px-4 pt-12 pb-4 flex items-center justify-between">
          <h1 className="text-slate-900 text-xl font-semibold">Repartidores</h1>
          <button
            onClick={() => { setEditingDriver(null); setShowModal(true); }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 text-white rounded-xl text-sm hover:bg-emerald-700 active:scale-95 transition-all"
          >
            <Plus size={16} />
            Agregar
          </button>
        </div>
      </div>

      <div className="max-w-[480px] mx-auto px-4 py-4 space-y-3 pb-24">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
        ) : drivers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <span className="text-5xl mb-4 select-none">🛵</span>
            <p className="text-slate-500 text-sm">Aún no hay repartidores.</p>
            <p className="text-slate-400 text-xs mt-1">Toca + Agregar para crear el primero.</p>
          </div>
        ) : (
          drivers.map((driver) => (
            <DriverCard
              key={driver.id}
              driver={driver}
              onToggleActive={(active) => handleToggleActive(driver, active)}
              onEdit={() => { setEditingDriver(driver); setShowModal(true); }}
            />
          ))
        )}
      </div>

      {showModal && (
        <DriverFormModal
          driver={editingDriver}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditingDriver(null); }}
        />
      )}
    </div>
  );
}

function DriverCard({
  driver,
  onToggleActive,
  onEdit,
}: {
  driver: User;
  onToggleActive: (active: boolean) => void;
  onEdit: () => void;
}) {
  const initials = driver.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="bg-white rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
          <span className="text-emerald-700 text-sm font-medium">{initials}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-slate-900 text-sm font-medium">{driver.name}</p>
          <p className="text-slate-400 text-xs">@{driver.username}</p>
        </div>
        <Switch.Root
          checked={driver.active}
          onCheckedChange={onToggleActive}
          className="w-11 h-6 bg-slate-200 data-[state=checked]:bg-emerald-600 rounded-full relative transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <Switch.Thumb className="block w-5 h-5 bg-white rounded-full shadow-sm transition-transform translate-x-0.5 data-[state=checked]:translate-x-[22px]" />
        </Switch.Root>
        <ChevronRight size={16} className="text-slate-300 shrink-0" />
      </div>
      <button
        onClick={onEdit}
        className="w-full mt-3 py-2 text-center text-slate-400 text-xs rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors"
      >
        Editar datos
      </button>
    </div>
  );
}

function DriverFormModal({
  driver,
  onSave,
  onClose,
}: {
  driver: User | null;
  onSave: (data: CreatePayload) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(driver?.name ?? '');
  const [username, setUsername] = useState(driver?.username ?? '');
  const [password, setPassword] = useState('');
  const [active, setActive] = useState(driver?.active ?? true);
  const isEdit = !!driver;
  const isValid = name.trim().length > 0 && username.trim().length > 0 && (isEdit || password.trim().length > 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    onSave({ name, username, password, active });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-[480px] rounded-t-3xl p-6 pb-8 shadow-2xl">
        <div className="flex justify-center mb-1">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>
        <div className="flex items-center justify-between mt-3 mb-6">
          <h2 className="text-slate-900 font-semibold">{isEdit ? 'Editar Repartidor' : 'Nuevo Repartidor'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-colors">
            <span className="text-sm">✕</span>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-slate-600 text-sm block mb-1.5">Nombre completo</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Carlos Rodríguez" className="w-full px-4 py-3 bg-slate-50 rounded-xl text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-emerald-500/30 focus:bg-white transition-all" />
          </div>
          <div>
            <label className="text-slate-600 text-sm block mb-1.5">Usuario</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Ej: carlos_r" className="w-full px-4 py-3 bg-slate-50 rounded-xl text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-emerald-500/30 focus:bg-white transition-all" />
          </div>
          <div>
            <label className="text-slate-600 text-sm block mb-1.5">
              Contraseña {isEdit && <span className="text-slate-400">· dejar vacío para no cambiar</span>}
            </label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={isEdit ? 'Dejar vacío para no cambiar' : 'Contraseña'} className="w-full px-4 py-3 bg-slate-50 rounded-xl text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-emerald-500/30 focus:bg-white transition-all" />
          </div>
          {isEdit && (
            <div className="flex items-center justify-between py-1">
              <span className="text-slate-700 text-sm">Estado activo</span>
              <Switch.Root checked={active} onCheckedChange={setActive} className="w-11 h-6 bg-slate-200 data-[state=checked]:bg-emerald-600 rounded-full relative transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30">
                <Switch.Thumb className="block w-5 h-5 bg-white rounded-full shadow-sm transition-transform translate-x-0.5 data-[state=checked]:translate-x-[22px]" />
              </Switch.Root>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3.5 bg-slate-100 text-slate-700 rounded-xl text-sm hover:bg-slate-200 active:scale-[0.98] transition-all">Cancelar</button>
            <button type="submit" disabled={!isValid} className="flex-1 py-3.5 bg-emerald-600 text-white rounded-xl text-sm hover:bg-emerald-700 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed">Guardar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
