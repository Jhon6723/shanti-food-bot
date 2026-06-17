// Unit tests: requireJWT and requireRole middleware

import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { requireJWT, requireRole } from '../../src/api/middleware/auth.js';

const TEST_SECRET = 'test-secret-for-tests';
process.env.JWT_SECRET = TEST_SECRET;

function makeReq(overrides: Partial<Request> = {}): Request {
  return { headers: {}, ...overrides } as unknown as Request;
}

function makeRes(): { res: Response; status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;
  return { res, status, json };
}

// ─── requireJWT ───────────────────────────────────────────────────────────────

describe('requireJWT', () => {
  it('calls next() with valid token', () => {
    const token = jwt.sign({ userId: 1, role: 'admin' }, TEST_SECRET);
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
    const { res } = makeRes();
    const next = vi.fn() as NextFunction;

    requireJWT(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toEqual(expect.objectContaining({ userId: 1, role: 'admin' }));
  });

  it('returns 401 when no Authorization header', () => {
    const req = makeReq({ headers: {} });
    const { res, status, json } = makeRes();
    const next = vi.fn() as NextFunction;

    requireJWT(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'Token requerido' });
  });

  it('returns 401 when Authorization is not Bearer', () => {
    const req = makeReq({ headers: { authorization: 'Basic abc123' } });
    const { res, status, json } = makeRes();
    const next = vi.fn() as NextFunction;

    requireJWT(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
  });

  it('returns 401 when token is expired', () => {
    const token = jwt.sign({ userId: 1, role: 'admin' }, TEST_SECRET, { expiresIn: -1 });
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
    const { res, status } = makeRes();
    const next = vi.fn() as NextFunction;

    requireJWT(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
  });

  it('returns 401 when token signed with wrong secret', () => {
    const token = jwt.sign({ userId: 1, role: 'admin' }, 'wrong-secret');
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
    const { res, status } = makeRes();
    const next = vi.fn() as NextFunction;

    requireJWT(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
  });

  it('returns 401 for malformed token', () => {
    const req = makeReq({ headers: { authorization: 'Bearer not.a.token' } });
    const { res, status } = makeRes();
    const next = vi.fn() as NextFunction;

    requireJWT(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
  });
});

// ─── requireRole ──────────────────────────────────────────────────────────────

describe('requireRole', () => {
  it('calls next() when role matches', () => {
    const req = makeReq({ user: { userId: 1, role: 'admin' } } as unknown as Partial<Request>);
    const { res } = makeRes();
    const next = vi.fn() as NextFunction;

    requireRole('admin')(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('returns 403 when role does not match', () => {
    const req = makeReq({ user: { userId: 2, role: 'delivery' } } as unknown as Partial<Request>);
    const { res, status, json } = makeRes();
    const next = vi.fn() as NextFunction;

    requireRole('admin')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: 'Sin permisos suficientes' });
  });

  it('returns 403 when user is undefined', () => {
    const req = makeReq({ user: undefined });
    const { res, status } = makeRes();
    const next = vi.fn() as NextFunction;

    requireRole('admin')(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
  });
});
