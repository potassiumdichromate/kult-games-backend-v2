import { Db } from 'mongodb';
import { BaseRepository } from '../../core/types';
import { config } from '../../config';
import type { KultWorldReferral, KultWorldReferralCodeSummary } from './kult-world.model';

export class KultWorldReferralRepository extends BaseRepository {
  constructor(db: Db) {
    super(db, config.db.col.kultWorldReferrals);
  }

  /** One row per wallet. A repeat signup does not move the wallet to another code. */
  async recordSignup(code: string, walletAddress: string): Promise<void> {
    await this.collection.updateOne(
      { walletAddress },
      { $setOnInsert: { code, walletAddress, createdAt: new Date() } },
      { upsert: true },
    );
  }

  async listCodes(): Promise<KultWorldReferralCodeSummary[]> {
    const groups = await this.collection.aggregate<{ _id: string; count: number }>([
      { $group: { _id: '$code', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
    ]).toArray();
    return groups.map((group) => ({ code: group._id, count: group.count }));
  }

  async listByCode(code: string): Promise<KultWorldReferral[]> {
    return this.collection
      .find<KultWorldReferral>({ code })
      .sort({ createdAt: 1 })
      .toArray();
  }
}
