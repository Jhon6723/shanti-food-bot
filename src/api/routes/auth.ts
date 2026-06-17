// API Routes: Auth — implements specs/openapi.yaml POST /auth/login

import bcrypt from 'bcrypt';
import { Router, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../../infrastructure/database/connection.js';

const router = Router();

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: 'admin' | 'delivery';
  active: boolean;
  name: string;
}

// POST /auth/login
router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body ?? {};

  if (!username || !password) {
    res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('[auth] JWT_SECRET not set');
    res.status(500).json({ error: 'Error de configuración del servidor' });
    return;
  }

  try {
    const result = await pool.query<UserRow>(
      'SELECT id, username, password_hash, role, active, name FROM users WHERE username = $1 LIMIT 1',
      [username]
    );
    const user = result.rows[0];

    if (!user || !user.active) {
      res.status(401).json({ error: 'Credenciales inválidas' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Credenciales inválidas' });
      return;
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      secret,
      { expiresIn: '8h' }
    );

    res.json({ token, role: user.role, name: user.name });
  } catch (error) {
    console.error('[auth/login] Error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
