// API Routes: Users (admin + delivery) — implements specs/openapi.yaml

import bcrypt from 'bcrypt';
import { Router, type Request, type Response } from 'express';
import { pool } from '../../infrastructure/database/connection.js';
import { requireJWT, requireRole } from '../middleware/auth.js';

const router = Router();

interface UserRow {
  id: number;
  name: string;
  username: string;
  role: 'admin' | 'delivery';
  phone: string | null;
  active: boolean;
  created_at: string;
}

// GET /users — list users, optionally filtered by role (admin only)
router.get('/', requireJWT, requireRole('admin'), async (req: Request, res: Response) => {
  const { role } = req.query as { role?: string };
  try {
    const result = role
      ? await pool.query<UserRow>(
          'SELECT id, name, username, role, phone, active, created_at FROM users WHERE role = $1 ORDER BY created_at DESC',
          [role]
        )
      : await pool.query<UserRow>(
          'SELECT id, name, username, role, phone, active, created_at FROM users ORDER BY created_at DESC'
        );
    res.json(result.rows);
  } catch (error) {
    console.error('[users/GET] Error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /users — create user (admin only)
router.post('/', requireJWT, requireRole('admin'), async (req: Request, res: Response) => {
  const { name, username, password, role, phone } = req.body ?? {};

  if (!name || !username || !password || !role) {
    res.status(400).json({ error: 'name, username, password y role son requeridos' });
    return;
  }
  if (!['admin', 'delivery'].includes(role)) {
    res.status(400).json({ error: 'role debe ser admin o delivery' });
    return;
  }

  try {
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query<UserRow>(
      'INSERT INTO users (name, username, password_hash, role, phone) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, username, role, phone, active, created_at',
      [name, username, hash, role, phone ?? null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'Este nombre de usuario ya existe' });
      return;
    }
    console.error('[users/POST] Error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PATCH /users/:id — update user (admin only)
router.patch('/:id', requireJWT, requireRole('admin'), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, username, password, active, phone } = req.body ?? {};

  try {
    if (password) {
      const hash = await bcrypt.hash(password, 12);
      await pool.query(
        'UPDATE users SET name = COALESCE($1, name), username = COALESCE($2, username), password_hash = $3, phone = COALESCE($4, phone), active = COALESCE($5, active) WHERE id = $6',
        [name, username, hash, phone, active, id]
      );
    } else {
      await pool.query(
        'UPDATE users SET name = COALESCE($1, name), username = COALESCE($2, username), phone = COALESCE($3, phone), active = COALESCE($4, active) WHERE id = $5',
        [name, username, phone, active, id]
      );
    }

    const result = await pool.query<UserRow>(
      'SELECT id, name, username, role, phone, active, created_at FROM users WHERE id = $1',
      [id]
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }
    res.json(result.rows[0]);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'Este nombre de usuario ya existe' });
      return;
    }
    console.error('[users/PATCH] Error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /users/:id/stats — delivery driver stats (admin only)
router.get('/:id/stats', requireJWT, requireRole('admin'), async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const userResult = await pool.query<UserRow>(
      'SELECT id, name, username, role FROM users WHERE id = $1 LIMIT 1',
      [id]
    );
    const user = userResult.rows[0];
    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }

    const statsResult = await pool.query<{
      total_delivered: string;
      delivered_last_30_days: string;
      total_amount: string;
    }>(
      `SELECT
        COUNT(*) AS total_delivered,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS delivered_last_30_days,
        COALESCE(SUM(total), 0) AS total_amount
       FROM orders
       WHERE delivered_by = $1 AND status = 'delivered'`,
      [id]
    );

    const recentResult = await pool.query<{ id: string; total: number; created_at: string; customer_name: string }>(
      `SELECT id, total, created_at, customer_name FROM orders
       WHERE delivered_by = $1 AND status = 'delivered'
       ORDER BY created_at DESC LIMIT 10`,
      [id]
    );

    const stats = statsResult.rows[0];
    res.json({
      user: { id: user.id, name: user.name, username: user.username },
      totalDelivered: parseInt(stats.total_delivered),
      deliveredLast30Days: parseInt(stats.delivered_last_30_days),
      totalAmount: parseInt(stats.total_amount),
      recentOrders: recentResult.rows,
    });
  } catch (error) {
    console.error('[users/stats] Error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
