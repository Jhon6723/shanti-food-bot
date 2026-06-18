// WhatsApp Provider Adapter — implements specs/whatsapp-adapter.md
// Abstracts incoming webhook parsing and outgoing message delivery
// so the bot remains agnostic of the underlying WhatsApp provider.

import type { Request } from 'express';
import type { WhatsAppWebhookPayload } from '../../types/index.js';

export interface WhatsAppAdapter {
  /** Human-readable provider name (used in logs) */
  readonly name: string;

  /** Extract and normalize incoming messages from the webhook body */
  parseIncoming(req: Request): WhatsAppWebhookPayload[];

  /** Send a text message to the destination number */
  sendMessage(to: string, text: string, options?: { chatId?: string }): Promise<void>;

  /** Validate request authenticity (optional per provider) */
  verifyRequest?(req: Request): boolean;
}
