// OpenWA adapter — implements specs/whatsapp-adapter.md §5.2
// Receives OpenWA-formatted webhooks and sends via REST.
// https://github.com/rmyndharis/OpenWA

import crypto from 'crypto';
import type { Request } from 'express';
import type { WhatsAppWebhookPayload } from '../../../types/index.js';
import type { WhatsAppAdapter } from '../adapter.js';

interface OpenWAWebhookBody {
  event?: string;
  sessionId?: string;
  data?: {
    messageId?: string;
    chatId?: string;
    from?: string;
    body?: string;
    type?: string;
    fromMe?: boolean;
  };
}

export class OpenWAAdapter implements WhatsAppAdapter {
  readonly name = 'openwa';

  parseIncoming(req: Request): WhatsAppWebhookPayload[] {
    const body = req.body as OpenWAWebhookBody;

    // Only process incoming-message events
    if (body?.event && body.event !== 'message.received') return [];

    const data = body?.data;
    if (!data) return [];

    // Ignore messages sent by us
    if (data.fromMe) return [];

    // OpenWA JIDs look like "573123456789@c.us"
    const rawId = data.from ?? data.chatId ?? '';
    const phone = rawId.split('@')[0].replace(/\D/g, '');
    const chatId = data.chatId ?? rawId; // preserve original chatId (lid vs c.us)
    if (!phone) return [];

    return [{
      messageId: data.messageId ?? '',
      from: phone,
      type: 'text',
      text: { body: data.body ?? '' },
      chatId, // pass through for reply routing
    }];
  }

  // Security: verify OpenWA HMAC-SHA256 signature (x-openwa-signature)
  verifyRequest(req: Request): boolean {
    const secret = process.env.WHATSAPP_PROVIDER_WEBHOOK_SECRET;
    if (!secret) {
      console.warn('[OpenWAAdapter] WHATSAPP_PROVIDER_WEBHOOK_SECRET not set — skipping signature verification');
      return true; // allow through but warn; set secret in production
    }

    const signature = req.headers['x-openwa-signature'] as string | undefined;
    if (!signature) return false;

    const expected = 'sha256=' + crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  async sendMessage(to: string, text: string, options?: { chatId?: string }): Promise<void> {
    const baseUrl = process.env.WHATSAPP_PROVIDER_URL;
    const apiKey = process.env.WHATSAPP_PROVIDER_API_KEY;
    const session = process.env.WHATSAPP_OPENWA_SESSION;

    if (!baseUrl || !apiKey || !session) {
      console.warn('[OpenWAAdapter] Missing WHATSAPP_PROVIDER_URL, WHATSAPP_PROVIDER_API_KEY or WHATSAPP_OPENWA_SESSION');
      return;
    }

    const url = `${baseUrl.replace(/\/$/, '')}/api/sessions/${session}/messages/send-text`;
    const chatId = options?.chatId ?? (to.includes('@') ? to : `${to}@c.us`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ chatId, text }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[OpenWAAdapter] Failed to send message:', error);
      throw new Error(`OpenWA API error: ${response.status} ${error}`);
    }

    console.log(`[OpenWAAdapter] Message sent to ${to}`);
  }
}
