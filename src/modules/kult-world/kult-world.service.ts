import { AppError } from '../../core/error';
import { logger } from '../../db/logger';
import { KultWorldReferralRepository } from './kult-world.repository';
import type { KultWorldReferralCodeSummary, KultWorldReferralWallet } from './kult-world.model';

/** Referral codes: 1-64 chars of letters, digits, _ and -. Anything else is ignored. */
export function normalizeReferralCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(code) ? code : null;
}

export class KultWorldReferralService {
  constructor(private readonly repo: KultWorldReferralRepository) {}

  /** Credit a Kult World link, for a brand-new wallet only. Never throws for a bad or duplicate code. */
  async recordSignup(walletAddress: string, rawCode: string): Promise<void> {
    const code = normalizeReferralCode(rawCode);
    if (!code) return;
    await this.repo.recordSignup(code, walletAddress);
    logger.info({ code, walletAddress }, 'Kult World referral signup recorded');
  }

  async listCodes(): Promise<{ total: number; codes: KultWorldReferralCodeSummary[] }> {
    const codes = await this.repo.listCodes();
    const total = codes.reduce((sum, entry) => sum + entry.count, 0);
    return { total, codes };
  }

  async listWallets(rawCode: string): Promise<{ code: string; count: number; wallets: KultWorldReferralWallet[] }> {
    const code = normalizeReferralCode(rawCode);
    if (!code) throw AppError.badRequest('Invalid referral code');
    const rows = await this.repo.listByCode(code);
    return {
      code,
      count: rows.length,
      wallets: rows.map((row) => ({ walletAddress: row.walletAddress, createdAt: row.createdAt })),
    };
  }
}
