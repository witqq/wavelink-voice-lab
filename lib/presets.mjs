import { isBuiltin, pluginNameFromKey } from './catalog.mjs';

export const PRESET_SCHEMA = 'voice-lab/preset/v2';
export const BUNDLE_SCHEMA = 'voice-lab/bundle/v1';

/** Schemas this build can import. v1 had no `requires` block. */
const ACCEPTED_PRESET_SCHEMAS = new Set([PRESET_SCHEMA, 'voice-lab/preset/v1']);

export function slugify(value, fallback = 'preset') {
  return String(value || fallback)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9а-яё_-]+/giu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || fallback;
}

export function effectKey(effect, index, effects) {
  const name = String(effect.name || effect.id || 'Unknown');
  const occurrence = effects.slice(0, index + 1).filter(item => item.name === effect.name).length;
  const total = effects.filter(item => item.name === effect.name).length;
  return total > 1 ? `${name}#${occurrence}` : name;
}

function normalizeEffect(item) {
  if (!item || typeof item !== 'object' || typeof item.key !== 'string') {
    throw new Error('Every effect must contain a string key');
  }
  return { key: item.key.slice(0, 160), enabled: Boolean(item.enabled) };
}

function stringList(value, limit = 12) {
  return Array.isArray(value) ? value.map(item => String(item).trim().slice(0, 240)).filter(Boolean).slice(0, limit) : [];
}

function measurements(value) {
  if (!value || typeof value !== 'object') return null;
  const result = {};
  for (const key of ['integratedLufs', 'loudnessRangeLu', 'truePeakDbfs']) {
    if (Number.isFinite(Number(value[key]))) result[key] = Number(value[key]);
  }
  if (value.sourceRecording) result.sourceRecording = String(value.sourceRecording).slice(0, 240);
  return Object.keys(result).length ? result : null;
}

/**
 * `requires` records what the preset's author had installed, so the receiving machine
 * can name the manufacturer and format even for a plugin it has never seen.
 */
function normalizeRequirement(item) {
  if (!item || typeof item !== 'object') return null;
  const name = pluginNameFromKey(item.name);
  if (!name) return null;
  return {
    name: name.slice(0, 120),
    manufacturer: String(item.manufacturer || '').trim().slice(0, 120),
    format: String(item.format || '').trim().toUpperCase().slice(0, 12)
  };
}

/** Plugin names a preset needs, derived from its chain. Built-ins are excluded. */
export function derivedRequirements(preset) {
  const names = new Map();
  for (const effect of [...(preset.effects || []), ...(preset.dspEffects || [])]) {
    const name = pluginNameFromKey(effect?.key);
    if (!name || isBuiltin(name)) continue;
    if (!names.has(name.toLowerCase())) names.set(name.toLowerCase(), { name, manufacturer: '', format: '' });
  }
  return [...names.values()];
}

function mergeRequirements(declared, derived) {
  const merged = new Map(derived.map(item => [item.name.toLowerCase(), item]));
  for (const item of declared) {
    const key = item.name.toLowerCase();
    merged.set(key, { ...merged.get(key), ...item, name: merged.get(key)?.name || item.name });
  }
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

export function validatePreset(input) {
  if (!input || typeof input !== 'object') throw new Error('Preset must be a JSON object');
  if (!ACCEPTED_PRESET_SCHEMAS.has(input.schema)) {
    throw new Error(`Unsupported preset schema: ${input.schema || 'missing'}`);
  }
  if (typeof input.title !== 'string' || !input.title.trim()) throw new Error('Preset title is required');
  if (!Array.isArray(input.effects)) throw new Error('Preset effects must be an array');
  const title = input.title.trim().slice(0, 100);
  const preset = {
    schema: PRESET_SCHEMA,
    revision: Math.max(1, Math.floor(Number(input.revision) || 1)),
    id: slugify(input.id || title),
    title,
    description: String(input.description || '').trim().slice(0, 400),
    character: String(input.character || '').trim().slice(0, 160),
    createdAt: typeof input.createdAt === 'string' ? input.createdAt : new Date().toISOString(),
    platforms: ['win32', 'darwin'],
    inputGainDb: Number.isFinite(Number(input.inputGainDb)) ? Math.max(0, Math.min(75, Number(input.inputGainDb))) : null,
    effects: input.effects.map(normalizeEffect),
    dspEffects: Array.isArray(input.dspEffects) ? input.dspEffects.map(normalizeEffect) : [],
    bestFor: stringList(input.bestFor, 8),
    processing: stringList(input.processing, 16),
    tradeoffs: stringList(input.tradeoffs, 8),
    measurements: measurements(input.measurements),
    notes: stringList(input.notes, 20)
  };
  const declared = Array.isArray(input.requires) ? input.requires.map(normalizeRequirement).filter(Boolean) : [];
  preset.requires = mergeRequirements(declared, derivedRequirements(preset));
  return preset;
}

/** Snapshot the live Wave Link chain as a portable preset. */
export function capturePreset({
  id, title, description = '', character = '', bestFor = [], processing = [], tradeoffs = [],
  input, gainDb = null, inventory = null
}) {
  const keyed = (input.effects || []).map((effect, index, effects) => ({
    key: effectKey(effect, index, effects),
    enabled: Boolean(effect.isEnabled)
  }));
  const active = keyed.filter(item => item.enabled).map(item => item.key);
  return validatePreset({
    schema: PRESET_SCHEMA,
    id,
    title,
    description,
    character: character || 'Сохранённое состояние цепочки Wave Link',
    createdAt: new Date().toISOString(),
    inputGainDb: gainDb,
    effects: keyed,
    dspEffects: (input.dspEffects || []).map((effect, index, effects) => ({
      key: effectKey(effect, index, effects),
      enabled: Boolean(effect.isEnabled)
    })),
    bestFor,
    processing: processing.length ? processing : [
      ...(gainDb == null ? [] : [`Входное усиление: ${gainDb} дБ`]),
      active.length ? `Активные эффекты: ${active.join(', ')}` : 'Программные эффекты отключены'
    ],
    tradeoffs,
    requires: describeRequirements(keyed, input.dspEffects || [], inventory),
    notes: ['Plugin parameter chunks are host-specific; this portable preset stores chain state and input gain.']
  });
}

/** Attach manufacturer and format from the local inventory to each required plugin. */
function describeRequirements(effects, dspEffects, inventory) {
  const installed = inventory?.installed || [];
  const names = new Map();
  for (const effect of [...effects, ...dspEffects.map(item => ({ key: item.name || item.key }))]) {
    const name = pluginNameFromKey(effect.key);
    if (!name || isBuiltin(name)) continue;
    const match = installed.find(entry => entry.name.toLowerCase() === name.toLowerCase());
    names.set(name.toLowerCase(), {
      name,
      manufacturer: match?.manufacturer || '',
      format: match?.format || ''
    });
  }
  return [...names.values()];
}

/** One file holding every preset, for moving a whole setup between machines. */
export function buildBundle(presets, app = 'voice-lab') {
  return {
    schema: BUNDLE_SCHEMA,
    app,
    exportedAt: new Date().toISOString(),
    presets: presets.map(preset => validatePreset(preset))
  };
}

export function readBundle(input) {
  if (!input || typeof input !== 'object') throw new Error('Bundle must be a JSON object');
  if (input.schema === BUNDLE_SCHEMA) {
    if (!Array.isArray(input.presets)) throw new Error('Bundle must contain a presets array');
    return input.presets.map(preset => validatePreset(preset));
  }
  // A single preset file is accepted wherever a bundle is, so users need not care which they have.
  return [validatePreset(input)];
}
