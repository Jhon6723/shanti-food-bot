// Meta Cloud API adapter — implements specs/whatsapp-adapter.md §5.1
// Receives Meta-formatted webhooks and sends via Graph API.

import crypto from 'crypto';
import type { Request } from 'express';
import type { WhatsAppWebhookPayload } from '../../../types/index.js';
import type { WhatsAppAdapter } from '../adapter.js';
import { parseMetaWebhook } from './parseWebhook.js';

export class MetaAdapter implements WhatsAppAdapter {
  readonly name = 'meta';

  parseIncoming(req: Request): WhatsAppWebhookPayload[] {
    return parseMetaWebhook(req.body);
  }

  // Security: verify Meta HMAC-SHA256 signature (issue #3 — SECURITY.md)
  verifyRequest(req: Request): boolean {
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (!appSecret) {
      console.warn('[MetaAdapter] WHATSAPP_APP_SECRET not set — skipping signature verification');
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

  async sendMessage(to: string, text: string, _options?: { chatId?: string }): Promise<void> {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const apiVersion = process.env.WHATSAPP_API_VERSION ?? 'v18.0';

    if (!phoneNumberId || !accessToken) {
      console.warn('[MetaAdapter] Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN');
      return;
    }

    const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body: text },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[MetaAdapter] Failed to send message:', error);
      throw new Error(`WhatsApp API error: ${response.status} ${error}`);
    }

    console.log(`[MetaAdapter] Message sent to ${to}`);
  }
}
