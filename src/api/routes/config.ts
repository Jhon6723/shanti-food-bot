// API Routes: Config — public feature flags (P8: delivery dashboard optional)

import { Router, type Request, type Response } from 'express';

const router = Router();

function isDeliveryDashboardEnabled(): boolean {
  const val = process.env.DELIVERY_DASHBOARD_ENABLED;
  if (val === undefined) return true; // enabled by default
  return val !== 'false' && val !== '0';
}

// GET /config/public — no auth required
router.get('/public', (_req: Request, res: Response) => {
  res.json({
    deliveryDashboardEnabled: isDeliveryDashboardEnabled(),
  });
});

export default router;
export { isDeliveryDashboardEnabled };
