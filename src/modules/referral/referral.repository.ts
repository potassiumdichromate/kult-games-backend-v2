import { Db } from 'mongodb';
import { BaseRepository } from '../../core/types';
import { config } from '../../config';
import type { ReferralModel } from './referral.model';

export class ReferralRepository extends BaseRepository {
  constructor(db: Db) {
    super(db, config.db.col.referrals);
  }

  /** One record per referred wallet — repeat signups (shouldn't happen) don't double-count. */
  async recordSignup(code: string, referrerWallet: string, referredWallet: string): Promise<void> {
    await this.collection.updateOne(
      { referredWallet },
      { $setOnInsert: { code, referrerWallet, referredWallet, createdAt: new Date() } },
      { upsert: true },
    );
  }

  async countByCode(code: string): Promise<number> {
    return this.collection.countDocuments({ code });
  }
}
