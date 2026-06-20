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
    /** Resolved phone number when OpenWA's RESOLVE_LID_TO_PHONE=true (MSISDN digits or null) */
    senderPhone?: string | null;
    /** True when the sender is identified by a WhatsApp privacy id (@lid) */
    isLidSender?: boolean;
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

    // OpenWA JIDs look like "573123456789@c.us" or "178327646171353@lid"
    // When OpenWA has RESOLVE_LID_TO_PHONE=true, senderPhone carries the real MSISDN
    const rawId = data.from ?? data.chatId ?? '';
    const resolvedPhone = data.senderPhone?.replace(/\D/g, '') ?? '';
    const phone = resolvedPhone || rawId.split('@')[0].replace(/\D/g, '');
    const chatId = data.chatId ?? rawId; // preserve original chatId (lid vs c.us)

    if (data.isLidSender && resolvedPhone) {
      console.log(`[OpenWAAdapter] Resolved LID ${rawId} → phone ${resolvedPhone}`);
    } else if (data.isLidSender) {
      console.warn(`[OpenWAAdapter] Received LID sender without resolved phone. Set RESOLVE_LID_TO_PHONE=true in OpenWA.`);
    }

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
    console.log(`[OpenWAAdapter] Received signature: ${signature ?? 'MISSING'}`);

    if (!signature) return false;

    // Use rawBody (captured by express.json verify callback) to match the exact payload OpenWA signed
    const rawBody = req.rawBody ?? JSON.stringify(req.body);
    console.log(`[OpenWAAdapter] rawBody present: ${req.rawBody ? 'YES' : 'NO'}`);
    console.log(`[OpenWAAdapter] rawBody length: ${rawBody.length}`);
    console.log(`[OpenWAAdapter] rawBody content: ${rawBody.slice(0, 200)}...`);

    const expected = 'sha256=' + crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    console.log(`[OpenWAAdapter] Expected signature: ${expected}`);
    console.log(`[OpenWAAdapter] Signature match: ${signature === expected}`);

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
