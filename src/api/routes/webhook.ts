// API Routes: WhatsApp Webhook — implements specs/openapi.yaml

import { Router, type Request, type Response } from 'express';
import { bot } from '../../bot/WhatsAppBot.js';
import { sendWhatsAppMessage } from '../../infrastructure/whatsapp/WhatsAppSender.js';
import type { WhatsAppWebhookPayload } from '../../types/index.js';

const router = Router();

// POST /webhooks/whatsapp — Receive WhatsApp messages (Meta Cloud API format)
router.post('/whatsapp', async (req: Request, res: Response) => {
  try {
    // Meta sends nested payload: entry[].changes[].value.messages[]
    const entries = req.body?.entry ?? [];
    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value?.messages) continue;

        for (const message of value.messages) {
          const phone = message.from?.replace(/\D/g, '') ?? '';
          if (!phone) continue;

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

          // Send response back to user via WhatsApp API
          await sendWhatsAppMessage(message.from, response);
        }
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: (error as Error).message });
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

// GET /webhooks/test — Test endpoint for bot without WhatsApp
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
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
