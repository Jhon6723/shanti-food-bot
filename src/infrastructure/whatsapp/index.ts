// WhatsApp adapter factory — implements specs/whatsapp-adapter.md §6
// Selects the active provider based on WHATSAPP_PROVIDER env var.

import type { WhatsAppAdapter } from './adapter.js';
import { MetaAdapter } from './meta/MetaAdapter.js';
import { OpenWAAdapter } from './openwa/OpenWAAdapter.js';

export type { WhatsAppAdapter } from './adapter.js';

export function getAdapter(): WhatsAppAdapter {
  const provider = process.env.WHATSAPP_PROVIDER ?? 'meta';

  let adapter: WhatsAppAdapter;
  switch (provider) {
    case 'meta':
      adapter = new MetaAdapter();
      break;
    case 'openwa':
      adapter = new OpenWAAdapter();
      break;
    default:
      throw new Error(`Unknown WhatsApp provider: ${provider}`);
  }

  return adapter;
}
