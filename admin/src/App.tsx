import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { Toast } from './components/Toast';
import { useAuth } from './hooks/useAuth';
import { useOrders } from './hooks/useOrders';
import type { AdminScreen, ToastState } from './lib/types';
import { DeliveryPage } from './pages/DeliveryPage';
import { DriversPage } from './pages/DriversPage';
import { LoginPage } from './pages/LoginPage';
import { MenuPage } from './pages/MenuPage';
import { OrdersPage } from './pages/OrdersPage';
import { StatsPage } from './pages/StatsPage';

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { data: orders = [] } = useOrders();
  const [screen, setScreen] = useState<AdminScreen>('orders');
  const [toast, setToast] = useState<ToastState>({ message: '', type: 'success', visible: false });

  const showToast = useCallback((message: string, type: ToastState['type']) => {
    setToast({ message, type, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const pendingCount = orders.filter((o) => o.status === 'pending').length;

  if (user!.role === 'delivery') {
    return (
      <>
        <DeliveryPage driverName={user!.name} onLogout={handleLogout} onToast={showToast} />
        <Toast toast={toast} />
      </>
    );
  }

  return (
    <>
      {screen === 'orders' && <OrdersPage onToast={showToast} onLogout={handleLogout} />}
      {screen === 'stats' && <StatsPage onLogout={handleLogout} />}
      {screen === 'drivers' && <DriversPage onToast={showToast} />}
      {screen === 'menu' && <MenuPage onToast={showToast} onLogout={handleLogout} />}
      <BottomNav currentScreen={screen} onNavigate={(s: AdminScreen) => setScreen(s)} pendingCount={pendingCount} />
      <Toast toast={toast} />
    </>
  );
}

function LoginGuard() {
  const { user } = useAuth();
  if (user) return <Navigate to="/orders" replace />;
  return <LoginPage />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginGuard />} />
      <Route path="/orders" element={<ProtectedRoute><AdminShell /></ProtectedRoute>} />
      <Route path="/stats" element={<ProtectedRoute><AdminShell /></ProtectedRoute>} />
      <Route path="/drivers" element={<ProtectedRoute><AdminShell /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
