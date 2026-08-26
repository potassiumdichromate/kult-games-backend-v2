import { nanoid } from 'nanoid';
import { AppError } from '../../core/error';
import { logger } from '../../db/logger';
import { ValkyQueue } from '../../db/redis';
import { PlayerRepository } from '../player/player.repository';
import { ReferralRepository } from './referral.repository';

export class ReferralService {
  constructor(
    private readonly playerRepo: PlayerRepository,
    private readonly referralRepo: ReferralRepository,
    private readonly clickQueue: ValkyQueue,
  ) {}

  async getOrCreateCode(wallet: string): Promise<string> {
    const player = await this.playerRepo.findByWallet(wallet);
    if (!player) throw AppError.notFound('Player not found');

    if (player.referralCode) return player.referralCode;

    // Generate a short unique code and persist it
    const code = nanoid(6);
    await this.playerRepo.updateReferralCode(wallet, code);
    logger.info({ wallet, code }, 'Referral code generated');
    return code;
  }

  async regenerateCode(wallet: string): Promise<string> {
    const player = await this.playerRepo.findByWallet(wallet);
    if (!player) throw AppError.notFound('Player not found');

    const code = nanoid(6);
    await this.playerRepo.updateReferralCode(wallet, code);
    logger.info({ wallet, previousCode: player.referralCode, code }, 'Referral code regenerated');
    return code;
  }

  async trackClick(code: string, ip: string): Promise<void> {
    await this.clickQueue.push({ code, ip, timestamp: Date.now() });
  }

  async processSignup(referredWallet: string, code: string): Promise<void> {
    // Codes may belong to a player (their personal link) or be a standalone
    // campaign tag with no owning player — either way, record the signup.
    const referrer = await this.playerRepo.findByReferralCode(code);

    if (referrer && referrer.walletAddress === referredWallet) {
      logger.warn({ code, referredWallet }, 'Blocked self-referral');
      return;
    }

    await this.referralRepo.recordSignup(code, referrer?.walletAddress ?? null, referredWallet);
    logger.info({ code, referrer: referrer?.walletAddress ?? null, referredWallet }, 'Referral signup recorded');
  }
}
