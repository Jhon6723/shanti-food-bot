// Error handler helper — sanitizes error messages in production (issue #4 — SECURITY.md)
import { type Response } from 'express';

export function handleError(res: Response, status: number, error: unknown, fallback: string): void {
  console.error(`[api] Error:`, error);
  if (process.env.NODE_ENV === 'production') {
    res.status(status).json({ error: fallback });
  } else {
    res.status(status).json({ error: (error as Error).message });
  }
}
