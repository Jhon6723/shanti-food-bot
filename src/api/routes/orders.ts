// API Routes: Orders — implements specs/openapi.yaml

import { Router, type Request, type Response } from 'express';
import { Order } from '../../domain/models/Order.js';
import { getProductById } from '../../domain/models/Product.js';
import { orderRepository } from '../../infrastructure/repositories/OrderRepository.js';
import type { OrderRequestData, OrderStatus } from '../../types/index.js';
import { requireJWT, requireRole } from '../middleware/auth.js';

const router = Router();

// POST /orders — Create new order
router.post('/', async (req: Request, res: Response) => {
  try {
    const { customer, items, type, address, paymentMethod, notes } = req.body as OrderRequestData;

    if (!customer || !customer.name || !customer.phone) {
      return res.status(400).json({ error: 'Customer name and phone are required' });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required' });
    }
    if (!['delivery', 'pickup'].includes(type)) {
      return res.status(400).json({ error: 'Type must be delivery or pickup' });
    }
    if (type === 'delivery' && !address) {
      return res.status(400).json({ error: 'Address is required for delivery orders' });
    }
    if (!['cash', 'nequi'].includes(paymentMethod)) {
      return res.status(400).json({ error: 'Payment method must be cash or nequi' });
    }

    const enrichedItems = [];
    for (const item of items) {
      const product = getProductById(item.productId);
      if (!product) {
        return res.status(400).json({ error: `Product ${item.productId} not found` });
      }
      if (!product.available) {
        return res.status(409).json({ error: `Product ${product.name} is not available` });
      }
      enrichedItems.push({
        ...item,
        unitPrice: product.price,
        preparationMinutes: product.preparationMinutes,
      });
    }

    const order = new Order({
      customer,
      items: enrichedItems,
      type,
      address,
      paymentMethod,
      notes,
    });

    const shouldAutoConfirm = order.total < 50000 && items.length <= 3;
    if (shouldAutoConfirm) order.confirm();
    await orderRepository.save(order);

    res.status(201).json(order.toJSON());
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /orders — List orders (admin: all; delivery: only ready)
router.get('/', requireJWT, async (req: Request, res: Response) => {
  try {
    const filters: { status?: OrderStatus; type?: 'delivery' | 'pickup' } = {};

    if (req.user!.role === 'delivery') {
      // delivery drivers only see ready orders
      filters.status = 'ready';
    } else {
      if (req.query.status) filters.status = req.query.status as OrderStatus;
      if (req.query.type) filters.type = req.query.type as 'delivery' | 'pickup';
    }

    const orders = await orderRepository.findAll(filters);
    res.json(orders.map((o) => o.toJSON()));
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /orders/stats/dashboard — Admin statistics (must be before /:id)
router.get('/stats/dashboard', requireJWT, requireRole('admin'), async (_req: Request, res: Response) => {
  try {
    res.json(await orderRepository.getStats());
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /orders/:id — Get single order (admin: any; delivery: only if status=ready)
router.get('/:id', requireJWT, async (req: Request, res: Response) => {
  try {
    const order = await orderRepository.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order.toJSON());
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// PATCH /orders/:id — Update order status (admin: any transition; delivery: only delivered)
router.patch('/:id', requireJWT, async (req: Request, res: Response) => {
  try {
    const order = await orderRepository.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const { status, notes } = req.body as { status?: OrderStatus; notes?: string };

    // delivery role can only mark an order as delivered
    if (req.user!.role === 'delivery') {
      if (status !== 'delivered') {
        return res.status(403).json({ error: 'Delivery drivers can only mark orders as delivered' });
      }
      if (order.status !== 'ready') {
        return res.status(409).json({ error: 'Order must be ready before marking as delivered' });
      }
    }

    const validStatuses: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'];

    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    if (status) {
      switch (status) {
        case 'confirmed':
          order.confirm();
          break;
        case 'preparing':
          order.prepare();
          break;
        case 'ready':
          order.markReady();
          break;
        case 'delivered':
          order.deliver();
          break;
        case 'cancelled':
          order.cancel();
          break;
        default:
          order.status = status;
      }
    }
    if (notes) order.notes = notes;

    await orderRepository.update(order);
    res.json(order.toJSON());
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

export default router;
