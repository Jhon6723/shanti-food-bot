import { useState, useCallback } from 'react';
import { api } from '../lib/api';
import type { AuthPayload, UserRole } from '../lib/types';

export interface AuthUser {
  userId: number;
  name: string;
  role: UserRole;
  token: string;
}

function loadUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(loadUser);

  const login = useCallback(async (username: string, password: string): Promise<void> => {
    const payload = await api.post<AuthPayload>('/auth/login', { username, password });
    const authUser: AuthUser = {
      userId: payload.userId,
      name: payload.name,
      role: payload.role,
      token: payload.token,
    };
    localStorage.setItem('token', payload.token);
    localStorage.setItem('user', JSON.stringify(authUser));
    setUser(authUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  return { user, login, logout };
}
