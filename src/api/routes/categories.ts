// API Routes: Categories — v1.5

import { Router, type Request, type Response } from 'express';
import { categoryRepository } from '../../infrastructure/repositories/CategoryRepository.js';
import { requireJWT, requireRole } from '../middleware/auth.js';

const router = Router();

// GET /categories — List all categories (public)
router.get('/', async (_req: Request, res: Response) => {
  try {
    const categories = await categoryRepository.findAll();
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /categories/:id — Get single category
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const category = await categoryRepository.findById(req.params.id);
    if (!category) return res.status(404).json({ error: 'Category not found' });
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /categories — Create category (admin only)
router.post('/', requireJWT, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { id, name, sortOrder } = req.body;
    if (!id || !name) {
      return res.status(400).json({ error: 'id and name are required' });
    }
    const category = await categoryRepository.create({ id, name, sortOrder });
    res.status(201).json(category);
  } catch (error) {
    if ((error as Error).message.includes('duplicate') || (error as Error).message.includes('unique')) {
      return res.status(409).json({ error: 'Category ID already exists' });
    }
    res.status(400).json({ error: (error as Error).message });
  }
});

// PATCH /categories/:id — Update category (admin only)
router.patch('/:id', requireJWT, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { name, sortOrder } = req.body;
    const category = await categoryRepository.update(req.params.id, { name, sortOrder });
    if (!category) return res.status(404).json({ error: 'Category not found' });
    res.json(category);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// DELETE /categories/:id — Delete category (admin only)
router.delete('/:id', requireJWT, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const existing = await categoryRepository.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Category not found' });

    const hasProducts = await categoryRepository.hasProducts(req.params.id);
    if (hasProducts) {
      return res.status(409).json({ error: 'Cannot delete category with associated products' });
    }

    await categoryRepository.delete(req.params.id);
    res.status(204).send();
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

export default router;
