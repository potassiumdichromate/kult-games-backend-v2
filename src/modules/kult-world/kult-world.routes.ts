import { Router, Request, Response, NextFunction } from 'express';
import { ok } from '../../core/response';
import { KultWorldReferralService } from './kult-world.service';

export function kultWorldRouter(service: KultWorldReferralService): Router {
  const router = Router();

  // GET /api/kult-world/referrals — every code and how many new wallets joined through it
  router.get('/referrals', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, await service.listCodes());
    } catch (err) {
      next(err);
    }
  });

  // GET /api/kult-world/referrals/:code — wallets that signed up with ?referral=<code>
  router.get('/referrals/:code', async (req: Request, res: Response, next: NextFunction) => {
    try {
      ok(res, await service.listWallets(req.params['code'] ?? ''));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
