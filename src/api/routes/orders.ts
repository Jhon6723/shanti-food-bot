// API Routes: Orders — implements specs/openapi.yaml

import { Router, type Request, type Response } from 'express';
import PDFDocument from 'pdfkit';
import { orderService } from '../../application/OrderService.js';
import { sseService } from '../../application/SSEService.js';
import { Order } from '../../domain/models/Order.js';
import { getProductById } from '../../domain/models/Product.js';
import { sendWhatsAppMessage } from '../../infrastructure/whatsapp/WhatsAppSender.js';
import type { OrderRequestData, OrderStatus } from '../../types/index.js';
import { requireJWT, requireRole } from '../middleware/auth.js';

function formatCurrency(value: number): string {
  return '$' + value.toLocaleString('es-CO');
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-CO');
}

const router = Router();

const statusNotificationMessages: Record<OrderStatus, ((order: Order) => string) | null> = {
  pending: null,
  confirmed: (order) => `✅ *¡Tu pedido ha sido confirmado!*\n\nPedido: *#${order.id}*\n\nTu orden está en preparación. Te notificaremos cuando esté lista. 🍳`,
  preparing: (order) => `🍳 *Tu pedido está en preparación*\n\nPedido: *#${order.id}*\n\nTiempo estimado de preparación: ~25 minutos.\n\nTe avisaremos cuando esté listo. 🎉`,
  ready: (order) => {
    if (order.type === 'delivery') {
      return `🎉 *¡Tu pedido está listo!*\n\nPedido: *#${order.id}*\n\nUn repartidor está en camino a tu dirección. 🛵\n\nGracias por preferir Arrocería Shanti 🍚`;
    }
    return `🎉 *¡Tu pedido está listo!*\n\nPedido: *#${order.id}*\n\nPuedes pasar a recogerlo en nuestro restaurante. 🏪\n\nGracias por preferir Arrocería Shanti 🍚`;
  },
  delivered: (order) => `✅ *¡Pedido entregado!*\n\nPedido: *#${order.id}*\n\nGracias por tu compra. Esperamos verte pronto. 🍚`,
  cancelled: (order) => `❌ *Pedido cancelado*\n\nPedido: *#${order.id}*\n\nTu pedido ha sido cancelado. Si tienes dudas, escríbenos.`,
};

async function notifyCustomer(order: Order, status: OrderStatus): Promise<void> {
  const messageBuilder = statusNotificationMessages[status];
  if (!messageBuilder) return;

  const text = messageBuilder(order);
  const phone = order.customer.phone;
  const chatId = order.customer.chatId;

  try {
    await sendWhatsAppMessage(phone, text, chatId);
  } catch {
    // fire-and-forget: don't fail the status update if WhatsApp fails
    console.error(`[orders/notify] Failed to send ${status} notification for order ${order.id}`);
  }
}

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
    await orderService.createOrder(order);

    sseService.broadcast({ type: 'orderCreated', data: order.toJSON() });

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

    const orders = await orderService.getOrders(filters);
    res.json(orders.map((o) => o.toJSON()));
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /orders/stats/dashboard — Admin statistics (must be before /:id)
router.get('/stats/dashboard', requireJWT, requireRole('admin'), async (_req: Request, res: Response) => {
  try {
    res.json(await orderService.getDashboardStats());
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /orders/:id — Get single order (admin: any; delivery: only if status=ready)
router.get('/:id', requireJWT, async (req: Request, res: Response) => {
  try {
    const order = await orderService.getOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order.toJSON());
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// PATCH /orders/:id — Update order status (admin: any transition; delivery: only delivered)
router.patch('/:id', requireJWT, async (req: Request, res: Response) => {
  try {
    const order = await orderService.getOrderById(req.params.id);
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
          order.deliver(req.user!.userId);
          break;
        case 'cancelled':
          order.cancel();
          break;
        default:
          order.status = status;
      }
    }
    if (notes) order.notes = notes;

    await orderService.updateOrder(order);

    sseService.broadcast({ type: 'orderUpdated', data: order.toJSON() });

    if (status) {
      await notifyCustomer(order, status);
    }

    res.json(order.toJSON());
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// GET /orders/reports/sales — Sales report with pagination (admin only)
router.get('/reports/sales', requireJWT, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { from, to, status, paymentMethod, type, page, limit } = req.query;

    if (!from || !to) {
      return res.status(400).json({ error: 'from and to dates are required' });
    }

    const report = await orderService.getSalesReport({
      from: String(from),
      to: String(to),
      status: status ? String(status) : undefined,
      paymentMethod: paymentMethod ? String(paymentMethod) : undefined,
      type: type ? String(type) : undefined,
      page: page ? parseInt(String(page), 10) : undefined,
      limit: limit ? parseInt(String(limit), 10) : undefined,
    });

    res.json(report);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /orders/reports/export — Export CSV or PDF (admin only)
router.post('/reports/export', requireJWT, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { format, filters } = req.body as {
      format: 'csv' | 'pdf';
      filters: { from: string; to: string; status?: string; paymentMethod?: string; type?: string };
    };

    if (!format || !filters || !filters.from || !filters.to) {
      return res.status(400).json({ error: 'format and filters (from, to) are required' });
    }

    const report = await orderService.getSalesReport({
      ...filters,
      page: 1,
      limit: 99999,
    });

    if (format === 'csv') {
      const lines = [
        'Fecha,Orden,Cliente,Total,Metodo,Tipo,Estado',
        ...report.orders.map((o) =>
          [
            formatDate(o.date),
            o.id,
            `"${o.customer}"`,
            o.total,
            o.paymentMethod,
            o.type,
            o.status,
          ].join(',')
        ),
      ];
      const csv = lines.join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="ventas-${filters.from}-${filters.to}.csv"`);
      res.send(csv);
      return;
    }

    if (format === 'pdf') {
      const doc = new PDFDocument({ margin: 40 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => {
        const pdf = Buffer.concat(chunks);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="ventas-${filters.from}-${filters.to}.pdf"`);
        res.send(pdf);
      });

      // Header
      doc.fontSize(18).text('Arrocería Shanti', 40, 40);
      doc.fontSize(12).text(`Reporte de Ventas — ${formatDate(filters.from)} a ${formatDate(filters.to)}`, 40, 65);
      doc.moveDown(2);

      // Summary table
      const summary = report.summary;
      doc.fontSize(11).text('Resumen', 40, doc.y);
      doc.moveDown(0.5);

      const drawRow = (label: string, value: string) => {
        doc.fontSize(10).text(label, 40, doc.y, { width: 200 });
        doc.text(value, 240, doc.y - 12, { width: 200, align: 'right' });
        doc.moveDown(0.3);
      };

      drawRow('Total órdenes:', String(summary.totalOrders));
      drawRow('Ingresos totales:', formatCurrency(summary.totalRevenue));
      drawRow('Tarifas de envío:', formatCurrency(summary.totalDeliveryFees));
      drawRow('Ticket promedio:', formatCurrency(summary.averageOrderValue));
      doc.moveDown(1);

      // By payment method
      if (summary.byPaymentMethod.length > 0) {
        doc.fontSize(11).text('Por método de pago', 40, doc.y);
        doc.moveDown(0.5);
        for (const row of summary.byPaymentMethod) {
          drawRow(row.method === 'cash' ? 'Efectivo' : 'Nequi', `${row.count} — ${formatCurrency(row.revenue)}`);
        }
        doc.moveDown(1);
      }

      // By order type
      if (summary.byOrderType.length > 0) {
        doc.fontSize(11).text('Por tipo de orden', 40, doc.y);
        doc.moveDown(0.5);
        for (const row of summary.byOrderType) {
          drawRow(row.type === 'delivery' ? 'Domicilio' : 'Recoger', `${row.count} — ${formatCurrency(row.revenue)}`);
        }
        doc.moveDown(1);
      }

      // By day
      if (summary.byDay.length > 0) {
        doc.fontSize(11).text('Ingresos por día', 40, doc.y);
        doc.moveDown(0.5);
        for (const row of summary.byDay) {
          drawRow(formatDate(row.date), `${row.count} — ${formatCurrency(row.revenue)}`);
        }
      }

      // Footer
      doc.fontSize(8).text(`Generado el ${new Date().toLocaleString('es-CO')}`, 40, doc.page.height - 60, { align: 'center' });

      doc.end();
      return;
    }

    res.status(400).json({ error: "format must be 'csv' or 'pdf'" });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
