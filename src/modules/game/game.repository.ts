import { Db, Document } from 'mongodb';
import { BaseRepository } from '../../core/types';
import { config } from '../../config';
import { GameModel } from './game.model';
import { getMongoClient } from '../../db/mongo';
import { BuildChange, GameAdminRepo } from './game-admin.service';

// Only the fields the admin build editor shows, and the last few changes.
const BUILD_PROJECTION = {
  identification: 1, name: 1, url: 1, isDownloadable: 1, isReleased: 1, is_released: 1, updatedAt: 1,
  'metadata.play_url': 1, 'metadata.download_url': 1, 'metadata.downloadUrl': 1, 'metadata.modes': 1,
  buildHistory: { $slice: -5 },
};

export class GameRepository extends BaseRepository implements GameAdminRepo {
  constructor(private readonly db: Db) {
    super(db, config.db.col.games);
  }

  private releasedFilter() {
    return { $or: [{ isReleased: true }, { is_released: true }] };
  }

  async findAllPaginated(
    search: string | undefined,
    skip: number,
    limit: number,
  ): Promise<{ games: GameModel[]; totalCount: number }> {
    const filter: Document = this.releasedFilter();

    if (search) {
      const re = new RegExp(search, 'i');
      (filter as Document)['$and'] = [
        this.releasedFilter(),
        { $or: [{ identification: re }, { 'name.en': re }, { category: re }] },
      ];
      delete (filter as Document)['$or'];
    }

    const [games, totalCount] = await Promise.all([
      this.collection.find<GameModel>(filter).skip(skip).limit(limit).toArray(),
      this.collection.countDocuments(filter),
    ]);

    return { games, totalCount };
  }

  async findByIdentification(id: string): Promise<GameModel | null> {
    return this.collection.findOne<GameModel>({ ...this.releasedFilter(), identification: id });
  }

  // ── Admin: game builds (released or not) ─────────────────────────────────────

  async findAllForAdmin(): Promise<GameModel[]> {
    return this.collection.find<GameModel>({}, { projection: BUILD_PROJECTION }).sort({ identification: 1 }).toArray();
  }

  async findAnyByIdentification(id: string): Promise<GameModel | null> {
    return this.collection.findOne<GameModel>({ identification: id }, { projection: BUILD_PROJECTION });
  }

  /** Applies a build change and records it in buildHistory (the last 50 are kept). */
  async updateBuild(id: string, set: Record<string, unknown>, unset: string[], change: BuildChange): Promise<GameModel | null> {
    const update: Document = {
      $set: { ...set, updatedAt: change.at },
      $push: { buildHistory: { $each: [change], $slice: -50 } },
    };
    if (unset.length) update['$unset'] = Object.fromEntries(unset.map((k) => [k, '']));
    return this.collection.findOneAndUpdate({ identification: id }, update, { returnDocument: 'after', projection: BUILD_PROJECTION }) as Promise<GameModel | null>;
  }

  async getDistinctCategories(): Promise<string[]> {
    const results = await this.collection
      .distinct('category', { ...this.releasedFilter(), category: { $exists: true, $ne: null } });
    return results.filter((c): c is string => typeof c === 'string' && c.trim().length > 0);
  }

  async getPlayCount(dbName: string, collectionName: string): Promise<number> {
    const client = getMongoClient();
    const targetDb = client.db(dbName);
    return targetDb.collection(collectionName).countDocuments({});
  }

  async getVectorFacts(gameId: string, limit: number): Promise<string[]> {
    const coll = this.db.collection<Document>('vector_facts');
    const docs = await coll
      .find({ 'metadata.game_id': gameId, 'metadata.category': 'developer_knowledge' })
      .sort({ _id: 1 })
      .limit(limit)
      .toArray();

    return docs
      .map((d) => String(d['text'] ?? '').trim())
      .filter((t) => t.length > 0);
  }
}
