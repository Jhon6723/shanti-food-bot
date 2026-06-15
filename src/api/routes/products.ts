// API Routes: Products — implements specs/openapi.yaml

import { Router, type Request, type Response } from 'express';
import { ProductCatalog, getAvailableProducts, getProductsByCategory } from '../../domain/models/Product.js';
import type { ProductCategory } from '../../types/index.js';

const router = Router();

// GET /products — List all products
router.get('/', (req: Request, res: Response) => {
  try {
    let products;
    if (req.query.category) {
      products = getProductsByCategory(req.query.category as ProductCategory);
    } else if (req.query.available === 'true') {
      products = getAvailableProducts();
    } else {
      products = ProductCatalog;
    }
    res.json(products.map((p) => p.toJSON()));
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /products/:id — Get single product
router.get('/:id', (req: Request, res: Response) => {
  try {
    const product = ProductCatalog.find((p) => p.id === req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product.toJSON());
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /products/menu/whatsapp — Formatted menu for WhatsApp bot
router.get('/menu/whatsapp', (_req: Request, res: Response) => {
  try {
    const available = getAvailableProducts();
    const menu = {
      arroces_chinos: available
        .filter((p) => p.category === 'arroz_chino')
        .map((p) => ({ id: p.id, name: p.name, price: p.price })),
      bandejas: available
        .filter((p) => p.category === 'bandeja_paisa')
        .map((p) => ({ id: p.id, name: p.name, price: p.price })),
      bebidas: available
        .filter((p) => p.category === 'bebidas')
        .map((p) => ({ id: p.id, name: p.name, price: p.price })),
    };
    res.json(menu);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
