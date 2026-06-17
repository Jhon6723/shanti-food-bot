// API Routes: WhatsApp Webhook — implements specs/openapi.yaml

import crypto from 'crypto';
import { Router, type Request, type Response } from 'express';
import { bot } from '../../bot/WhatsAppBot.js';
import { sendWhatsAppMessage } from '../../infrastructure/whatsapp/WhatsAppSender.js';
import type { WhatsAppWebhookPayload } from '../../types/index.js';

const router = Router();

// Security: verify Meta HMAC-SHA256 signature (issue #3 — SECURITY.md)
function verifyMetaSignature(req: Request): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    console.warn('[webhook] WHATSAPP_APP_SECRET not set — skipping signature verification');
    return true; // allow through but warn; set secret in production
  }
  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  if (!signature) return false;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', appSecret)
    .update(JSON.stringify(req.body))
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// POST /webhooks/whatsapp — Receive WhatsApp messages (Meta Cloud API format)
router.post('/whatsapp', async (req: Request, res: Response) => {
  // Always 200 — Meta retries on non-200, causing duplicate messages at unexpected hours
  res.sendStatus(200);

  if (!verifyMetaSignature(req)) {
    console.warn('[webhook] Invalid Meta signature — request ignored');
    return;
  }

  // Meta sends nested payload: entry[].changes[].value.messages[]
  const entries = req.body?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages) continue;

      for (const message of value.messages) {
        const phone = message.from?.replace(/\D/g, '') ?? '';
        if (!phone) continue;

        try {
          const payload: WhatsAppWebhookPayload = {
            messageId: message.id,
            from: phone,
            type: message.type,
            text: message.type === 'text' ? message.text : undefined,
            interactive: message.type === 'interactive' ? message.interactive : undefined,
          };

          const response = await bot.handleMessage(phone, {
            type: payload.type as 'text' || 'text',
            text: payload.text,
            interactive: payload.interactive,
          });

          await sendWhatsAppMessage(message.from, response);
          console.log(`[webhook] OK msgId=${message.id} from=${phone}`);
        } catch (error) {
          console.error(`[webhook] ERROR msgId=${message.id} from=${phone}`, error);
        }
      }
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
