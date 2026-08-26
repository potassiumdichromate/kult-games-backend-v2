import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../middleware/auth';
import { ok } from '../../core/response';
import { config } from '../../config';
import { ReferralService } from './referral.service';

const PUBLIC_APP_URL = 'https://app.kult.games';

function buildReferralLink(code: string): string {
  const base = (config.share.publicAppUrl || PUBLIC_APP_URL).replace(/\/+$/, '');
  return `${base}?referral=${code}`;
}

export function referralRouter(service: ReferralService): Router {
  const router = Router();

  // GET /api/referral/me — get or create referral link for logged-in player
  router.get('/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const code = await service.getOrCreateCode(req.player!.walletAddress);
      ok(res, { code, link: buildReferralLink(code) });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/referral/regenerate — issue a fresh referral code/link, invalidating the old one
  router.post('/regenerate', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const code = await service.regenerateCode(req.player!.walletAddress);
      ok(res, { code, link: buildReferralLink(code) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export function referralRedirectRouter(service: ReferralService): Router {
  const router = Router();

  // GET /r/:code — legacy path-style link: track click and redirect to the app
  router.get('/:code', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ip = (req.headers['x-forwarded-for'] as string) ?? req.ip ?? '0.0.0.0';
      const code = req.params['code']!;
      await service.trackClick(code, ip).catch(() => {});
      res.redirect(302, buildReferralLink(code));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
