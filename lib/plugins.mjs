import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { catalogEntry, isBuiltin, knownNames, pluginNameFromKey } from './catalog.mjs';
import { expectedFormats, pluginCacheCandidates, pluginDirectories } from './paths.mjs';

const PLUGIN_TAG = /<PLUGIN\b([^>]*)\/?>/gi;

function attribute(source, name) {
  const match = new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(source);
  return match ? match[1] : '';
}

/**
 * Wave Link writes its inventory as a JUCE known-plugin list. Attributes are parsed
 * with a targeted regex so the project stays dependency-free; the file is produced by
 * Wave Link itself and is not user-authored markup.
 */
export function parsePluginCache(xml) {
  const found = [];
  for (const [, body] of String(xml).matchAll(PLUGIN_TAG)) {
    const name = attribute(body, 'name');
    if (!name) continue;
    found.push({
      name,
      format: attribute(body, 'format') || 'VST3',
      manufacturer: attribute(body, 'manufacturer'),
      version: attribute(body, 'version'),
      file: attribute(body, 'file'),
      source: 'cache'
    });
  }
  return found;
}

function dedupe(entries) {
  const unique = new Map();
  for (const entry of entries) {
    const key = `${entry.name.toLowerCase()}|${entry.format.toUpperCase()}`;
    const existing = unique.get(key);
    if (!existing || (existing.source !== 'cache' && entry.source === 'cache')) unique.set(key, entry);
  }
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

async function fromCaches(platform) {
  const entries = [];
  const readFiles = [];
  for (const file of await pluginCacheCandidates(platform)) {
    try {
      entries.push(...parsePluginCache(await readFile(file, 'utf8')));
      readFiles.push(file);
    } catch {
      // A missing or unreadable cache simply contributes nothing.
    }
  }
  return { entries, readFiles };
}

async function fromDirectories(platform) {
  const entries = [];
  const scanned = [];
  for (const { dir, format, suffix } of pluginDirectories(platform)) {
    try {
      const names = await readdir(dir);
      scanned.push(dir);
      for (const name of names) {
        if (!name.toLowerCase().endsWith(suffix)) continue;
        entries.push({
          name: name.slice(0, -suffix.length),
          format,
          manufacturer: '',
          version: '',
          file: path.join(dir, name),
          // File names do not always equal the plugin name Wave Link reports, so a
          // directory hit is weaker evidence than a cache entry.
          source: 'directory'
        });
      }
    } catch {
      // Directory absent on this machine.
    }
  }
  return { entries, scanned };
}

/**
 * Fill in manufacturer and format on a preset's requirements before it leaves this
 * machine. Presets upgraded from schema v1 carry bare plugin names, and the receiving
 * machine has a much easier job when it also knows the vendor and format.
 */
export function enrichRequirements(preset, inventory) {
  const installed = inventory?.installed || [];
  return {
    ...preset,
    requires: (preset.requires || []).map(item => {
      if (item.manufacturer && item.format) return item;
      const match = matches(installed, item.name)[0];
      const catalog = catalogEntry(item.name);
      return {
        name: item.name,
        manufacturer: item.manufacturer || catalog?.manufacturer || match?.manufacturer || '',
        format: item.format || match?.format || ''
      };
    })
  };
}

export async function scanInstalledPlugins(platform = process.platform) {
  const cache = await fromCaches(platform);
  const directories = await fromDirectories(platform);
  return {
    platform,
    installed: dedupe([...cache.entries, ...directories.entries]),
    cacheFiles: cache.readFiles,
    scannedDirectories: directories.scanned
  };
}

function matches(installed, name) {
  const wanted = new Set(knownNames(name));
  return installed.filter(entry => wanted.has(entry.name.trim().toLowerCase()));
}

/**
 * Compare the plugins a preset needs against what this machine has. Built-in Wave Link
 * effects and hardware DSP are never reported as missing.
 */
export function analyzePreset(preset, inventory) {
  const platform = inventory.platform || process.platform;
  const formats = expectedFormats(platform);
  const seen = new Map();
  const effects = [
    ...(preset.effects || []).map(effect => ({ ...effect, hardware: false })),
    ...(preset.dspEffects || []).map(effect => ({ ...effect, hardware: true }))
  ];

  for (const effect of effects) {
    const name = pluginNameFromKey(effect.key);
    if (!name) continue;
    const record = seen.get(name.toLowerCase()) || {
      name,
      required: false,
      hardware: effect.hardware,
      catalog: catalogEntry(name)
    };
    record.required = record.required || Boolean(effect.enabled);
    record.hardware = record.hardware && effect.hardware;
    seen.set(name.toLowerCase(), record);
  }

  const plugins = [...seen.values()].map(record => {
    const found = matches(inventory.installed || [], record.name);
    const builtin = record.hardware || isBuiltin(record.name);
    const usableFormat = found.some(entry => formats.includes(entry.format.toUpperCase()));
    const supported = !record.catalog || record.catalog.platforms.includes(platform);
    return {
      name: record.name,
      required: record.required,
      builtin,
      installed: builtin || found.length > 0,
      formats: [...new Set(found.map(entry => entry.format.toUpperCase()))],
      formatMismatch: found.length > 0 && !usableFormat,
      manufacturer: record.catalog?.manufacturer || found[0]?.manufacturer || '',
      kind: record.catalog?.kind || 'unknown',
      url: record.catalog?.url || null,
      note: record.catalog?.note || '',
      supportedOnPlatform: supported
    };
  }).sort((a, b) => Number(b.required) - Number(a.required) || a.name.localeCompare(b.name, 'en'));

  const blocking = plugins.filter(plugin => plugin.required && !plugin.installed);
  return {
    plugins,
    missingRequired: blocking.map(plugin => plugin.name),
    missingOptional: plugins.filter(plugin => !plugin.required && !plugin.installed).map(plugin => plugin.name),
    unsupported: plugins.filter(plugin => plugin.required && !plugin.supportedOnPlatform).map(plugin => plugin.name),
    ready: blocking.length === 0
  };
}
