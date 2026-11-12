import { AppError } from '../../core/error';
import { GameModel } from './game.model';

// Editing a game's build: where its play page, Unity build or download lives.
// Kult World's Game Hub and the Kult browser both read these fields:
//   url                    the play page, Unity build folder or download file
//   metadata.play_url      takes priority over url for playing
//   metadata.download_url  takes priority over url for a downloadable game
//   metadata.modes         a game with several builds, one per mode
//                          (Highway Hustle): [{ id, url, name? }]
// Every change is kept in buildHistory: who, when, and each field's before and after.

export interface BuildMode { id: string; url: string; name?: string }

export interface GameBuildDto {
  identification: string;
  name: string;
  released: boolean;
  isDownloadable: boolean;
  url: string | null;
  playUrl: string | null;
  downloadUrl: string | null;
  modes: BuildMode[] | null;
  updatedAt: Date | null;
  lastChange: { at: Date; by: string } | null;
}

export interface BuildChange { at: Date; by: string; changes: Record<string, { from: unknown; to: unknown }> }

export interface GameAdminRepo {
  findAllForAdmin(): Promise<GameModel[]>;
  findAnyByIdentification(id: string): Promise<GameModel | null>;
  updateBuild(id: string, set: Record<string, unknown>, unset: string[], change: BuildChange): Promise<GameModel | null>;
}

type GameDoc = GameModel & {
  is_released?: boolean;
  buildHistory?: BuildChange[];
  metadata?: { play_url?: unknown; download_url?: unknown; downloadUrl?: unknown; modes?: unknown } & Record<string, unknown>;
};

const FIELDS = new Set(['url', 'playUrl', 'downloadUrl', 'isDownloadable', 'modes']);
const MODE_ID = /^[a-z0-9-]{1,40}$/;
const MAX_URL = 2048;

function httpsUrl(value: unknown, field: string): string {
  if (typeof value !== 'string') throw AppError.badRequest(`${field} must be a link`);
  const v = value.trim();
  if (!v || v.length > MAX_URL) throw AppError.badRequest(`${field} must be a link of at most ${MAX_URL} characters`);
  let u: URL;
  try { u = new URL(v); } catch { throw AppError.badRequest(`${field} is not a valid link`); }
  if (u.protocol !== 'https:') throw AppError.badRequest(`${field} must start with https://`);
  return v;
}

// An empty value removes an optional link; anything else must be an https link.
const optionalUrl = (value: unknown, field: string): string | null =>
  value === null || (typeof value === 'string' && !value.trim()) ? null : httpsUrl(value, field);

function parseModes(value: unknown): BuildMode[] | null {
  if (value === null || (Array.isArray(value) && !value.length)) return null;
  if (!Array.isArray(value) || value.length > 12) throw AppError.badRequest('modes must be a list of at most 12 builds');
  const seen = new Set<string>();
  return value.map((m, i) => {
    if (!m || typeof m !== 'object') throw AppError.badRequest(`modes[${i}] must be { id, url, name? }`);
    const { id, url, name, ...rest } = m as Record<string, unknown>;
    if (Object.keys(rest).length) throw AppError.badRequest(`modes[${i}] has unknown fields: ${Object.keys(rest).join(', ')}`);
    if (typeof id !== 'string' || !MODE_ID.test(id)) throw AppError.badRequest(`modes[${i}].id must be lowercase letters, digits or dashes`);
    if (seen.has(id)) throw AppError.badRequest(`modes has "${id}" twice`);
    seen.add(id);
    const mode: BuildMode = { id, url: httpsUrl(url, `modes[${i}].url`) };
    if (name !== undefined && name !== null && name !== '') {
      if (typeof name !== 'string' || name.trim().length > 40) throw AppError.badRequest(`modes[${i}].name must be at most 40 characters`);
      mode.name = name.trim();
    }
    return mode;
  });
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

export function toBuildDto(raw: GameModel): GameBuildDto {
  const g = raw as GameDoc;
  const md = g.metadata ?? {};
  const modes = Array.isArray(md.modes) ? (md.modes as BuildMode[]) : null;
  const last = Array.isArray(g.buildHistory) && g.buildHistory.length ? g.buildHistory[g.buildHistory.length - 1] : null;
  return {
    identification: g.identification,
    name: (g.name && (g.name.en || Object.values(g.name)[0])) || g.identification,
    released: Boolean(g.isReleased ?? g.is_released),
    isDownloadable: Boolean(g.isDownloadable),
    url: str(g.url),
    playUrl: str(md.play_url),
    downloadUrl: str(md.download_url) ?? str(md.downloadUrl),
    modes,
    updatedAt: g.updatedAt ?? null,
    lastChange: last ? { at: last.at, by: last.by } : null,
  };
}

export class GameAdminService {
  constructor(private readonly repo: GameAdminRepo) {}

  async listBuilds(): Promise<{ games: GameBuildDto[] }> {
    return { games: (await this.repo.findAllForAdmin()).map(toBuildDto) };
  }

  async updateBuild(id: string, body: unknown, adminWallet: string): Promise<{ game: GameBuildDto }> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw AppError.badRequest('Send the fields to change');
    const input = body as Record<string, unknown>;
    const unknown = Object.keys(input).filter((k) => !FIELDS.has(k));
    if (unknown.length) throw AppError.badRequest(`Unknown fields: ${unknown.join(', ')}`);
    if (!Object.keys(input).length) throw AppError.badRequest('Nothing to change');

    const current = await this.repo.findAnyByIdentification(id);
    if (!current) throw AppError.notFound(`Game '${id}' not found`);
    const before = toBuildDto(current);

    const set: Record<string, unknown> = {};
    const unset: string[] = [];
    const changes: BuildChange['changes'] = {};
    const note = (field: string, from: unknown, to: unknown) => {
      if (JSON.stringify(from ?? null) !== JSON.stringify(to ?? null)) changes[field] = { from: from ?? null, to: to ?? null };
    };

    if ('url' in input) {
      const url = httpsUrl(input.url, 'url');
      set['url'] = url; note('url', before.url, url);
    }
    if ('playUrl' in input) {
      const v = optionalUrl(input.playUrl, 'playUrl');
      if (v) set['metadata.play_url'] = v; else unset.push('metadata.play_url');
      note('playUrl', before.playUrl, v);
    }
    if ('downloadUrl' in input) {
      const v = optionalUrl(input.downloadUrl, 'downloadUrl');
      if (v) set['metadata.download_url'] = v; else unset.push('metadata.download_url', 'metadata.downloadUrl');
      note('downloadUrl', before.downloadUrl, v);
    }
    if ('isDownloadable' in input) {
      if (typeof input.isDownloadable !== 'boolean') throw AppError.badRequest('isDownloadable must be true or false');
      set['isDownloadable'] = input.isDownloadable; note('isDownloadable', before.isDownloadable, input.isDownloadable);
    }
    if ('modes' in input) {
      const modes = parseModes(input.modes);
      if (modes) set['metadata.modes'] = modes; else unset.push('metadata.modes');
      note('modes', before.modes, modes);
    }

    if (!Object.keys(changes).length) return { game: before };
    const updated = await this.repo.updateBuild(id, set, unset, { at: new Date(), by: adminWallet.toLowerCase(), changes });
    if (!updated) throw AppError.notFound(`Game '${id}' not found`);
    return { game: toBuildDto(updated) };
  }
}
