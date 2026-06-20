// Application Service: WebhookService
// Encapsulates WhatsApp webhook processing so API Routes (Presentation)
// do not depend directly on Infrastructure adapters.
// Implements specs/ARCHITECTURE.md § Dependency Rules.

import type { Request } from 'express';
import type { WhatsAppBot } from '../bot/WhatsAppBot.js';
import type { WhatsAppAdapter } from '../infrastructure/whatsapp/adapter.js';

export class WebhookService {
  constructor(
    private readonly adapter: WhatsAppAdapter,
    private readonly bot: WhatsAppBot
  ) {}

  async process(req: Request): Promise<void> {
    if (this.adapter.verifyRequest && !this.adapter.verifyRequest(req)) {
      console.warn(`[webhook] Invalid ${this.adapter.name} signature — request ignored`);
      return;
    }

    const payloads = this.adapter.parseIncoming(req);
    for (const payload of payloads) {
      try {
        const response = await this.bot.handleMessage(payload.from, {
          type: payload.type as 'text',
          text: payload.text,
          interactive: payload.interactive,
        }, payload.chatId);

        await this.adapter.sendMessage(
          payload.from,
          response,
          payload.chatId ? { chatId: payload.chatId } : undefined
        );
        console.log(`[webhook] OK provider=${this.adapter.name} msgId=${payload.messageId} from=${payload.from}`);
      } catch (error) {
        console.error(`[webhook] ERROR msgId=${payload.messageId} from=${payload.from}`, error);
      }
    }
  }
}
