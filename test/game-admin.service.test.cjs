const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET ||= 'x'.repeat(64);
process.env.ADMIN_WALLETS = '0xAdmin1, 0xadmin2';

const { GameAdminService } = require('../dist/modules/game/game-admin.service.js');
const { requireAdmin } = require('../dist/middleware/auth.js');

function createRepo() {
  const games = {
    zerogpool: { identification: 'zerogpool', name: { en: 'Zero G Pool' }, url: 'https://old.example/pool/index.html', isDownloadable: false, isReleased: true, metadata: { play_url: 'https://old.example/pool/play' } },
    highwayhustle: { identification: 'highwayhustle', name: { en: 'Highway Hustle' }, url: 'https://www.highwayhustle.xyz/', isDownloadable: false, isReleased: true, metadata: {} },
  };
  const calls = [];
  return {
    calls,
    games,
    async findAllForAdmin() { return Object.values(games); },
    async findAnyByIdentification(id) { return games[id] ? structuredClone(games[id]) : null; },
    async updateBuild(id, set, unset, change) {
      calls.push({ id, set, unset, change });
      const g = games[id];
      for (const [k, v] of Object.entries(set)) {
        if (k.startsWith('metadata.')) g.metadata[k.slice(9)] = v; else g[k] = v;
      }
      for (const k of unset) if (k.startsWith('metadata.')) delete g.metadata[k.slice(9)];
      g.buildHistory = [...(g.buildHistory || []), change];
      g.updatedAt = change.at;
      return structuredClone(g);
    },
  };
}

test('lists every game with its build fields', async () => {
  const svc = new GameAdminService(createRepo());
  const { games } = await svc.listBuilds();
  const pool = games.find((g) => g.identification === 'zerogpool');
  assert.equal(pool.name, 'Zero G Pool');
  assert.equal(pool.url, 'https://old.example/pool/index.html');
  assert.equal(pool.playUrl, 'https://old.example/pool/play');
  assert.equal(pool.downloadUrl, null);
  assert.equal(pool.modes, null);
});

test('updates a build, clears an optional link and records the change', async () => {
  const repo = createRepo();
  const svc = new GameAdminService(repo);
  const { game } = await svc.updateBuild('zerogpool', { url: ' https://cdn.example/pool/v11/index.html ', playUrl: '' }, '0xADMIN1');
  assert.equal(game.url, 'https://cdn.example/pool/v11/index.html');
  assert.equal(game.playUrl, null);
  const call = repo.calls[0];
  assert.deepEqual(call.set, { url: 'https://cdn.example/pool/v11/index.html' });
  assert.deepEqual(call.unset, ['metadata.play_url']);
  assert.equal(call.change.by, '0xadmin1');
  assert.deepEqual(call.change.changes.url, { from: 'https://old.example/pool/index.html', to: 'https://cdn.example/pool/v11/index.html' });
  assert.equal(game.lastChange.by, '0xadmin1');
});

test('stores per-mode builds and rejects bad ones', async () => {
  const repo = createRepo();
  const svc = new GameAdminService(repo);
  const modes = [{ id: 'one-way', url: 'https://cdn.example/OneWay/10/index.html' }, { id: 'time-bomb', url: 'https://cdn.example/TimeBomb/6/index.html', name: 'Time Bomb' }];
  const { game } = await svc.updateBuild('highwayhustle', { modes }, '0xadmin2');
  assert.deepEqual(game.modes, modes);

  await assert.rejects(svc.updateBuild('highwayhustle', { modes: [{ id: 'One Way', url: 'https://x.example/' }] }, '0xadmin2'), /lowercase/);
  await assert.rejects(svc.updateBuild('highwayhustle', { modes: [{ id: 'a', url: 'https://x.example/' }, { id: 'a', url: 'https://y.example/' }] }, '0xadmin2'), /twice/);
  await assert.rejects(svc.updateBuild('highwayhustle', { modes: [{ id: 'a', url: 'https://x.example/', extra: 1 }] }, '0xadmin2'), /unknown fields/);
  // Clearing modes removes them.
  const cleared = await svc.updateBuild('highwayhustle', { modes: [] }, '0xadmin2');
  assert.equal(cleared.game.modes, null);
});

test('rejects anything that is not an https build or a known field', async () => {
  const repo = createRepo();
  const svc = new GameAdminService(repo);
  await assert.rejects(svc.updateBuild('zerogpool', { url: 'http://insecure.example/' }, '0xadmin1'), /https/);
  await assert.rejects(svc.updateBuild('zerogpool', { url: 'javascript:alert(1)' }, '0xadmin1'), /https|valid/);
  await assert.rejects(svc.updateBuild('zerogpool', { url: '' }, '0xadmin1'), /link/);
  await assert.rejects(svc.updateBuild('zerogpool', { isDownloadable: 'yes' }, '0xadmin1'), /true or false/);
  await assert.rejects(svc.updateBuild('zerogpool', { name: 'x' }, '0xadmin1'), /Unknown fields: name/);
  await assert.rejects(svc.updateBuild('zerogpool', {}, '0xadmin1'), /Nothing to change/);
  await assert.rejects(svc.updateBuild('nope', { url: 'https://x.example/' }, '0xadmin1'), /not found/);
  assert.equal(repo.calls.length, 0);
});

test('an unchanged build writes nothing', async () => {
  const repo = createRepo();
  const svc = new GameAdminService(repo);
  const { game } = await svc.updateBuild('zerogpool', { url: 'https://old.example/pool/index.html' }, '0xadmin1');
  assert.equal(game.url, 'https://old.example/pool/index.html');
  assert.equal(repo.calls.length, 0);
});

test('admin routes admit only wallets in ADMIN_WALLETS', () => {
  const run = (player) => { let err = 'unset'; requireAdmin({ player }, {}, (e) => { err = e; }); return err; };
  assert.equal(run({ walletAddress: '0xADMIN1' }), undefined);
  assert.equal(run({ walletAddress: '0xadmin2' }), undefined);
  assert.equal(run({ walletAddress: '0xsomeone' }).statusCode ?? run({ walletAddress: '0xsomeone' }).status, 403);
  assert.equal((run(undefined).statusCode ?? run(undefined).status), 403);
});
