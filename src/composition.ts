// Composition Root — Dependency Injection wiring
// This is the ONLY file in Application / Bot / API layers that imports from Infrastructure.
// All concrete implementations are wired here and injected into the layers above.

import { sseService } from './application/SSEService.js';
import { WebhookService } from './application/WebhookService.js';
import { WhatsAppBot } from './bot/WhatsAppBot.js';
import { orderRepository } from './infrastructure/repositories/OrderRepository.js';
import { productRepository } from './infrastructure/repositories/ProductRepository.js';
import { getAdapter } from './infrastructure/whatsapp/index.js';

export const bot = new WhatsAppBot(orderRepository, productRepository);
export const webhookService = new WebhookService(getAdapter(), bot);
export { sseService };
