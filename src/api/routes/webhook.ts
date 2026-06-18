// API Routes: WhatsApp Webhook — implements specs/openapi.yaml

import { Router, type Request, type Response } from 'express';
import { bot } from '../../bot/WhatsAppBot.js';
import { getAdapter } from '../../infrastructure/whatsapp/index.js';

const router = Router();

// POST /webhooks/whatsapp — Receive WhatsApp messages (provider-agnostic)
router.post('/whatsapp', async (req: Request, res: Response) => {
  const adapter = getAdapter();

  // Always 200 — providers retry on non-200, causing duplicate messages at unexpected hours
  res.sendStatus(200);

  if (adapter.verifyRequest && !adapter.verifyRequest(req)) {
    console.warn(`[webhook] Invalid ${adapter.name} signature — request ignored`);
    return;
  }

  const payloads = adapter.parseIncoming(req);
  for (const payload of payloads) {
    try {
      const response = await bot.handleMessage(payload.from, {
        type: payload.type as 'text',
        text: payload.text,
        interactive: payload.interactive,
      });

      await adapter.sendMessage(payload.from, response, payload.chatId ? { chatId: payload.chatId } : undefined);
      console.log(`[webhook] OK provider=${adapter.name} msgId=${payload.messageId} from=${payload.from}`);
    } catch (error) {
      console.error(`[webhook] ERROR msgId=${payload.messageId} from=${payload.from}`, error);
    }
  }
});

// GET /webhooks/whatsapp — Verification endpoint (for WhatsApp API setup)
router.get('/whatsapp', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'] as string | undefined;
  const token = req.query['hub.verify_token'] as string | undefined;
  const challenge = req.query['hub.challenge'] as string | undefined;

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN && challenge) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// GET /webhooks/test — Only available in development (issue #1 — SECURITY.md)
if (process.env.NODE_ENV !== 'production') {
  router.get('/test', async (req: Request, res: Response) => {
    const { phone, message } = req.query as { phone?: string; message?: string };

    if (!phone || !message) {
      return res.status(400).json({ error: 'Missing phone or message query params' });
    }

    try {
      const response = await bot.handleMessage(phone.replace(/\D/g, ''), {
        type: 'text',
        text: { body: message },
      });
      res.json({ from: phone, input: message, response });
    } catch (error) {
      console.error('[webhook/test] Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
}

export default router;
