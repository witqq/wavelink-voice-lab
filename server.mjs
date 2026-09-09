import http from 'node:http';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUNDLE_SCHEMA, buildBundle, readBundle, slugify, validatePreset } from './lib/presets.mjs';
import { PresetStore } from './lib/storage.mjs';
import { analyzePreset, enrichRequirements, scanInstalledPlugins } from './lib/plugins.mjs';
import { platformLabel } from './lib/paths.mjs';
import { WaveLink } from './lib/wavelink.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const recordingsDir = process.env.VOICE_LAB_RECORDINGS || path.join(root, 'recordings');
const presetsDir = process.env.VOICE_LAB_PRESETS || path.join(root, 'presets');
const port = Number(process.env.VOICE_LAB_PORT || 8765);

await mkdir(recordingsDir, { recursive: true });
const store = await new PresetStore(presetsDir).init();

const mimeByExt = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webm': 'audio/webm', '.ogg': 'audio/ogg', '.mp4': 'audio/mp4'
};

const waveLink = new WaveLink();
waveLink.connect();

/** The plugin inventory changes only when the user installs something, so it is cached briefly. */
let inventoryCache = { value: null, at: 0 };
async function inventory({ force = false } = {}) {
  if (!force && inventoryCache.value && Date.now() - inventoryCache.at < 15_000) return inventoryCache.value;
  inventoryCache = { value: await scanInstalledPlugins(), at: Date.now() };
  return inventoryCache.value;
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': mimeByExt['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function readBody(req, max = 80 * 1024 * 1024) {
  const parts = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw new Error('Request is too large');
    parts.push(chunk);
  }
  return Buffer.concat(parts);
}

async function readJson(req, max = 2 * 1024 * 1024) {
  return JSON.parse((await readBody(req, max)).toString('utf8'));
}

function safePart(value, fallback) {
  return String(value || fallback).toLowerCase().replace(/[^a-zа-яё0-9_-]+/giu, '-').replace(/^-|-$/g, '').slice(0, 50) || fallback;
}

async function listRecordings() {
  const files = (await readdir(recordingsDir)).filter(name => /\.(webm|ogg|mp4)$/i.test(name));
  const rows = await Promise.all(files.map(async name => ({
    name,
    url: `/recordings/${encodeURIComponent(name)}`,
    created: (await stat(path.join(recordingsDir, name))).birthtimeMs
  })));
  return rows.sort((a, b) => b.created - a.created);
}

async function resolvePreset(id, list) {
  if (id === 'current') return waveLink.original || waveLink.currentPreset(await inventory());
  return (list || await store.list()).find(preset => preset.id === id) || null;
}

/** Everything the interface needs about one preset, including its plugin readiness. */
function describePreset(preset, plugins) {
  const report = analyzePreset(preset, plugins);
  return {
    title: preset.title,
    hint: preset.description || 'Переносимый пресет Wave Link',
    character: preset.character,
    bestFor: preset.bestFor,
    processing: preset.processing,
    tradeoffs: preset.tradeoffs,
    measurements: preset.measurements,
    inputGainDb: preset.inputGainDb,
    activeEffectCount: preset.effects.filter(effect => effect.enabled).length,
    portable: preset.id !== 'current',
    plugins: report.plugins,
    missingRequired: report.missingRequired,
    missingOptional: report.missingOptional,
    unsupported: report.unsupported,
    ready: report.ready
  };
}

async function statusPayload() {
  const plugins = await inventory();
  const stored = await store.list();
  const current = waveLink.original || (waveLink.input ? waveLink.currentPreset(plugins) : null);
  const list = current ? [current, ...stored] : stored;
  return {
    waveLink: waveLink.status(),
    platform: { id: plugins.platform, label: platformLabel(plugins.platform) },
    inventory: {
      count: plugins.installed.length,
      cacheFiles: plugins.cacheFiles,
      scannedDirectories: plugins.scannedDirectories,
      installed: plugins.installed
    },
    presets: Object.fromEntries(list.map(preset => [preset.id, describePreset(preset, plugins)])),
    recordings: await listRecordings()
  };
}

const routes = [
  ['GET', '/api/status', async () => ({ status: 200, body: await statusPayload() })],

  ['GET', '/api/plugins', async url => {
    const plugins = await inventory({ force: url.searchParams.get('refresh') === '1' });
    return {
      status: 200,
      body: {
        platform: { id: plugins.platform, label: platformLabel(plugins.platform) },
        installed: plugins.installed,
        cacheFiles: plugins.cacheFiles,
        scannedDirectories: plugins.scannedDirectories
      }
    };
  }],

  ['POST', '/api/preset', async (url, req) => {
    const payload = await readJson(req, 32 * 1024);
    const preset = await resolvePreset(payload.id);
    if (!preset) return { status: 404, body: { error: 'Preset not found' } };
    const missingEffects = await waveLink.apply(preset);
    return { status: 200, body: { ok: true, waveLink: { ...waveLink.status(), missingEffects } } };
  }],

  ['POST', '/api/presets/capture', async (url, req) => {
    if (!waveLink.ready) throw new Error(waveLink.error || 'Wave Link is not connected');
    const payload = await readJson(req, 32 * 1024);
    const plugins = await inventory();
    const captured = waveLink.snapshot(payload.description || 'Сохранено из Voice Lab', plugins);
    const saved = await store.save({
      ...captured,
      id: payload.id || payload.title,
      title: payload.title,
      description: payload.description || 'Сохранено из Voice Lab',
      character: payload.character || captured.character
    });
    return { status: 201, body: { ok: true, ...saved } };
  }],

  ['POST', '/api/presets/import', async (url, req) => {
    const payload = await readJson(req);
    const presets = readBundle(payload);
    const overwrite = url.searchParams.get('overwrite') === '1';
    const saved = [];
    for (const preset of presets) saved.push(await store.save(preset, { overwrite }));
    const plugins = await inventory();
    return {
      status: 201,
      body: {
        ok: true,
        imported: saved.map(item => ({
          id: item.preset.id,
          title: item.preset.title,
          fileName: item.fileName,
          ...analyzePreset(item.preset, plugins)
        }))
      }
    };
  }],

  ['GET', '/api/presets/export', async url => {
    const id = url.searchParams.get('id');
    const plugins = await inventory();
    if (id === 'all') {
      const presets = (await store.list()).map(preset => enrichRequirements(preset, plugins));
      return {
        status: 200,
        download: `voice-lab-presets-${new Date().toISOString().slice(0, 10)}.json`,
        body: buildBundle(presets)
      };
    }
    const preset = await resolvePreset(id);
    if (!preset) return { status: 404, body: { error: 'Preset not found' } };
    return {
      status: 200,
      download: `${slugify(preset.id)}.voicepreset.json`,
      body: validatePreset(enrichRequirements(preset, plugins))
    };
  }],

  ['POST', '/api/presets/delete', async (url, req) => {
    const payload = await readJson(req, 8 * 1024);
    const removed = await store.remove(payload.id);
    return { status: removed ? 200 : 404, body: removed ? { ok: true } : { error: 'Preset not found' } };
  }]
];

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    const route = routes.find(([method, pathname]) => method === req.method && pathname === url.pathname);
    if (route) {
      const result = await route[2](url, req);
      if (result.download) {
        res.writeHead(result.status, {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${result.download}"`
        });
        return res.end(`${JSON.stringify(result.body, null, 2)}\n`);
      }
      return json(res, result.status, result.body);
    }

    if (req.method === 'POST' && url.pathname === '/api/recordings') {
      const body = await readBody(req);
      if (!body.length) throw new Error('Empty recording');
      const preset = safePart(url.searchParams.get('preset'), waveLink.activePreset);
      const phrase = safePart(url.searchParams.get('phrase'), 'phrase');
      const take = safePart(url.searchParams.get('take'), '1');
      const mime = String(req.headers['content-type'] || 'audio/webm');
      const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'mp4' : 'webm';
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const name = `${stamp}__${preset}__${phrase}__take-${take}.${ext}`;
      await writeFile(path.join(recordingsDir, name), body);
      return json(res, 201, { ok: true, name, url: `/recordings/${encodeURIComponent(name)}` });
    }

    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    if (relative.startsWith('recordings/')) {
      const name = path.basename(relative);
      const file = await readFile(path.join(recordingsDir, name));
      res.writeHead(200, {
        'Content-Type': mimeByExt[path.extname(name)] || 'application/octet-stream',
        'Content-Length': file.length
      });
      return res.end(file);
    }

    const allowed = new Set(['index.html', 'app.js', 'styles.css']);
    if (!allowed.has(relative)) return json(res, 404, { error: 'Not found' });
    const file = await readFile(path.join(root, relative));
    res.writeHead(200, { 'Content-Type': mimeByExt[path.extname(relative)] || 'application/octet-stream' });
    res.end(file);
  } catch (error) {
    json(res, 500, { error: error.message });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Voice Lab: http://127.0.0.1:${port}`);
  console.log(`Platform: ${platformLabel()}`);
  console.log(`Presets: ${presetsDir}`);
  console.log(`Recordings: ${recordingsDir}`);
  console.log(`Bundle schema: ${BUNDLE_SCHEMA}`);
});
