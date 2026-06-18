// WhatsApp message sender — delegates to the active provider adapter.
// Kept as a thin wrapper so existing callers (e.g. order status
// notifications) stay provider-agnostic. See specs/whatsapp-adapter.md.

import { getAdapter } from './index.js';

export async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  await getAdapter().sendMessage(to, text);
}
