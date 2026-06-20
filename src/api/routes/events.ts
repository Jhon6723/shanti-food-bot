// API Routes: Server-Sent Events — real-time order updates for admin dashboard

import { Router, type Request, type Response } from 'express';
import { sseService, type SSEEvent } from '../../application/SSEService.js';

const router = Router();

// GET /events — SSE stream for real-time order updates
router.get('/', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Send initial connection event
  res.write('data: {"type":"connected"}\n\n');

  const unsubscribe = sseService.subscribe((event: SSEEvent) => {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
  });

  req.on('close', () => {
    unsubscribe();
    res.end();
  });
});

export default router;
