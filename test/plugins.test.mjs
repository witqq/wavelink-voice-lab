import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePreset, enrichRequirements, parsePluginCache } from '../lib/plugins.mjs';
import { catalogEntry, isBuiltin, knownNames, pluginNameFromKey } from '../lib/catalog.mjs';
import { expectedFormats, platformLabel } from '../lib/paths.mjs';
import { PRESET_SCHEMA, validatePreset } from '../lib/presets.mjs';

const CACHE = `<?xml version="1.0" encoding="UTF-8"?>
<KNOWNPLUGINS>
  <PLUGIN name="IVGI2" format="VST3" category="Fx|Distortion" manufacturer="Klanghelm"
          version="2.5.0" file="C:\\Program Files\\Common Files\\VST3\\IVGI2.vst3"
          uniqueId="2e7544e" isInstrument="0"/>
  <PLUGIN name="TDR Nova" format="VST3" category="Fx" manufacturer="Tokyo Dawn Labs"
          version="2.1.0" file="C:\\Program Files\\Common Files\\VST3\\TDR Nova.vst3"/>
  <PLUGIN name="Broken" format="VST3"/>
</KNOWNPLUGINS>`;

const preset = validatePreset({
  schema: PRESET_SCHEMA,
  title: 'Radio',
  effects: [
    { key: 'TDR Nova#1', enabled: true },
    { key: 'IVGI2', enabled: true },
    { key: 'MJUCjr', enabled: true },
    { key: 'Saturn 2', enabled: false },
    { key: 'Voice Focus', enabled: false }
  ],
  dspEffects: [{ key: 'Clipguard', enabled: true }]
});

const inventory = {
  platform: 'win32',
  installed: parsePluginCache(CACHE).filter(entry => entry.name !== 'Broken')
};

test('parsePluginCache reads the Wave Link inventory', () => {
  const plugins = parsePluginCache(CACHE);
  const ivgi = plugins.find(plugin => plugin.name === 'IVGI2');
  assert.equal(ivgi.manufacturer, 'Klanghelm');
  assert.equal(ivgi.format, 'VST3');
  assert.equal(ivgi.version, '2.5.0');
  assert.equal(plugins.length, 3);
});

test('parsePluginCache ignores entries without a name', () => {
  assert.deepEqual(parsePluginCache('<KNOWNPLUGINS><PLUGIN format="VST3"/></KNOWNPLUGINS>'), []);
});

test('pluginNameFromKey strips the duplicate marker', () => {
  assert.equal(pluginNameFromKey('TDR Nova#2'), 'TDR Nova');
  assert.equal(pluginNameFromKey('LoudMax'), 'LoudMax');
});

test('catalog knows licence and download for third-party plugins', () => {
  assert.equal(catalogEntry('IVGI2').kind, 'free');
  assert.match(catalogEntry('IVGI2').url, /^https:\/\/klanghelm\.com\//);
  assert.equal(catalogEntry('Saturn 2').kind, 'paid');
  assert.equal(catalogEntry('nothing-here'), null);
});

test('Wave Link effects and hardware DSP count as built-in', () => {
  assert.equal(isBuiltin('Voice Focus'), true);
  assert.equal(isBuiltin('Clipguard'), true);
  assert.equal(isBuiltin('IVGI2'), false);
});

test('analyzePreset separates installed, missing and optional plugins', () => {
  const report = analyzePreset(preset, inventory);
  assert.deepEqual(report.missingRequired, ['MJUCjr']);
  assert.deepEqual(report.missingOptional, ['Saturn 2']);
  assert.equal(report.ready, false);

  const mjuc = report.plugins.find(plugin => plugin.name === 'MJUCjr');
  assert.equal(mjuc.kind, 'free');
  assert.match(mjuc.url, /klanghelm\.com/);

  const nova = report.plugins.find(plugin => plugin.name === 'TDR Nova');
  assert.equal(nova.installed, true);
  assert.deepEqual(nova.formats, ['VST3']);
});

test('analyzePreset never reports built-in effects as missing', () => {
  const report = analyzePreset(preset, inventory);
  for (const name of ['Voice Focus', 'Clipguard']) {
    const plugin = report.plugins.find(entry => entry.name === name);
    assert.equal(plugin.installed, true, `${name} must not be missing`);
    assert.equal(plugin.builtin, true);
  }
});

test('analyzePreset reports a preset as ready when every required plugin exists', () => {
  const ready = validatePreset({
    schema: PRESET_SCHEMA, title: 'Ready',
    effects: [{ key: 'TDR Nova', enabled: true }, { key: 'IVGI2', enabled: true }]
  });
  const report = analyzePreset(ready, inventory);
  assert.deepEqual(report.missingRequired, []);
  assert.equal(report.ready, true);
});

test('analyzePreset flags plugins with no build for the current platform', () => {
  const nvidia = validatePreset({
    schema: PRESET_SCHEMA, title: 'NVIDIA chain',
    effects: [{ key: 'NVIDIA Broadcast Noise Removal by Elgato', enabled: true }]
  });
  assert.deepEqual(analyzePreset(nvidia, { platform: 'darwin', installed: [] }).unsupported,
    ['NVIDIA Broadcast Noise Removal by Elgato']);
  assert.deepEqual(analyzePreset(nvidia, inventory).unsupported, []);
});

test('analyzePreset marks a macOS AU-only install as usable and a mismatch otherwise', () => {
  const chain = validatePreset({
    schema: PRESET_SCHEMA, title: 'AU chain', effects: [{ key: 'LoudMax', enabled: true }]
  });
  const au = { platform: 'darwin', installed: [{ name: 'LoudMax', format: 'AU', manufacturer: 'Thomas Mundt' }] };
  const auReport = analyzePreset(chain, au).plugins[0];
  assert.equal(auReport.installed, true);
  assert.equal(auReport.formatMismatch, false);

  const wrong = { platform: 'win32', installed: [{ name: 'LoudMax', format: 'AU', manufacturer: 'Thomas Mundt' }] };
  assert.equal(analyzePreset(chain, wrong).plugins[0].formatMismatch, true);
});

test('a plugin found by file name matches the catalog entry', () => {
  // A directory scan reports `FabFilter Saturn 2.vst3`; Wave Link's cache calls it `Saturn 2`.
  assert.deepEqual(knownNames('Saturn 2').sort(), ['fabfilter saturn 2', 'saturn 2']);
  const chain = validatePreset({
    schema: PRESET_SCHEMA, title: 'Saturn chain', effects: [{ key: 'Saturn 2', enabled: true }]
  });
  const scanned = {
    platform: 'win32',
    installed: [{ name: 'FabFilter Saturn 2', format: 'VST3', manufacturer: '', source: 'directory' }]
  };
  const report = analyzePreset(chain, scanned);
  assert.deepEqual(report.missingRequired, []);
  assert.equal(report.plugins[0].installed, true);
  assert.equal(report.plugins[0].manufacturer, 'FabFilter');
});

test('enrichRequirements fills vendor and format from the local machine', () => {
  const bare = validatePreset({
    schema: 'voice-lab/preset/v1', title: 'Bare',
    effects: [{ key: 'IVGI2', enabled: true }, { key: 'Saturn 2', enabled: true }]
  });
  assert.deepEqual(bare.requires.map(item => item.manufacturer), ['', '']);

  const enriched = enrichRequirements(bare, inventory);
  const ivgi = enriched.requires.find(item => item.name === 'IVGI2');
  assert.equal(ivgi.manufacturer, 'Klanghelm');
  assert.equal(ivgi.format, 'VST3');
  // Not installed here, so the vendor comes from the catalog and the format stays unknown.
  const saturn = enriched.requires.find(item => item.name === 'Saturn 2');
  assert.equal(saturn.manufacturer, 'FabFilter');
  assert.equal(saturn.format, '');
});

test('enrichRequirements keeps values a preset already carries', () => {
  const preset = validatePreset({
    schema: PRESET_SCHEMA, title: 'Declared',
    effects: [{ key: 'LoudMax', enabled: true }],
    requires: [{ name: 'LoudMax', manufacturer: 'Thomas Mundt', format: 'AU' }]
  });
  assert.deepEqual(enrichRequirements(preset, inventory).requires,
    [{ name: 'LoudMax', manufacturer: 'Thomas Mundt', format: 'AU' }]);
});

test('platform helpers describe both supported systems', () => {
  assert.equal(platformLabel('win32'), 'Windows');
  assert.equal(platformLabel('darwin'), 'macOS');
  assert.deepEqual(expectedFormats('win32'), ['VST3']);
  assert.deepEqual(expectedFormats('darwin'), ['VST3', 'AU']);
});
