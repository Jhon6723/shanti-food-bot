// Helper: extract normalized payloads from a Meta Cloud API webhook body
// Meta sends a nested structure: entry[].changes[].value.messages[]

import type { WhatsAppWebhookPayload } from '../../../types/index.js';

export function parseMetaWebhook(body: unknown): WhatsAppWebhookPayload[] {
  const payloads: WhatsAppWebhookPayload[] = [];
  const entries = (body as { entry?: unknown[] })?.entry ?? [];

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes ?? [];
    for (const change of changes) {
      const value = (change as { value?: { messages?: unknown[] } })?.value;
      if (!value?.messages) continue;

      for (const message of value.messages) {
        const msg = message as {
          id?: string;
          from?: string;
          type?: string;
          text?: { body: string };
          interactive?: WhatsAppWebhookPayload['interactive'];
        };

        const phone = (msg.from ?? '').replace(/\D/g, '');
        if (!phone) continue;

        payloads.push({
          messageId: msg.id ?? '',
          from: phone,
          type: (msg.type ?? 'text') as WhatsAppWebhookPayload['type'],
          text: msg.type === 'text' ? msg.text : undefined,
          interactive: msg.type === 'interactive' ? msg.interactive : undefined,
        });
      }
    }
  }

  return payloads;
}
