// API Routes: Products — implements specs/openapi.yaml
// v1.5: DB-backed, replaces hardcoded ProductCatalog

import { Router, type Request, type Response } from 'express';
import { categoryRepository } from '../../infrastructure/repositories/CategoryRepository.js';
import { productRepository } from '../../infrastructure/repositories/ProductRepository.js';
import { requireJWT, requireRole } from '../middleware/auth.js';
import { handleError } from '../middleware/errorHandler.js';

const router = Router();

// GET /products — List all products (public, only available by default)
router.get('/', async (req: Request, res: Response) => {
  try {
    const includeUnavailable = req.query.admin === 'true' && req.user?.role === 'admin';
    const category = req.query.category as string | undefined;
    
    let rows;
    if (category) {
      rows = await productRepository.findByCategory(category, !includeUnavailable);
    } else {
      rows = await productRepository.findAll(includeUnavailable);
    }
    res.json(rows);
  } catch (error) {
    handleError(res, 500, error, 'Internal server error');
  }
});

// GET /products/:id — Get single product
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const product = await productRepository.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (error) {
    handleError(res, 500, error, 'Internal server error');
  }
});

// GET /products/menu/whatsapp — Formatted menu for WhatsApp bot
router.get('/menu/whatsapp', async (_req: Request, res: Response) => {
  try {
    const categories = await categoryRepository.findAll();
    const products = await productRepository.findAll(false);
    const menu: Record<string, { id: string; name: string; price: number }[]> = {};
    for (const cat of categories) {
      menu[cat.id] = products
        .filter((p) => p.category_id === cat.id)
        .map((p) => ({ id: p.id, name: p.name, price: p.price }));
    }
    res.json(menu);
  } catch (error) {
    handleError(res, 500, error, 'Internal server error');
  }
});

// POST /products — Create product (admin only)
router.post('/', requireJWT, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { id, name, categoryId, price, description, available, preparationMinutes, customizationOptions } = req.body;
    if (!id || !name || !categoryId || price === undefined) {
      return res.status(400).json({ error: 'id, name, categoryId and price are required' });
    }
    const product = await productRepository.create({
      id,
      name,
      categoryId,
      price,
      description,
      available,
      preparationMinutes,
      customizationOptions,
    });
    res.status(201).json(product);
  } catch (error) {
    if ((error as Error).message.includes('duplicate') || (error as Error).message.includes('unique')) {
      return res.status(409).json({ error: 'Product ID already exists' });
    }
    handleError(res, 400, error, 'Failed to create product');
  }
});

// PATCH /products/:id — Update product (admin only)
router.patch('/:id', requireJWT, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { name, categoryId, price, description, available, preparationMinutes, customizationOptions } = req.body;
    const product = await productRepository.update(req.params.id, {
      name,
      categoryId,
      price,
      description,
      available,
      preparationMinutes,
      customizationOptions,
    });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (error) {
    handleError(res, 400, error, 'Failed to update product');
  }
});

// DELETE /products/:id — Delete product (admin only)
router.delete('/:id', requireJWT, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const existing = await productRepository.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Product not found' });
    await productRepository.delete(req.params.id);
    res.status(204).send();
  } catch (error) {
    handleError(res, 400, error, 'Failed to delete product');
  }
});

export default router;
