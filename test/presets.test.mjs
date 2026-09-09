import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUNDLE_SCHEMA, PRESET_SCHEMA, buildBundle, capturePreset, derivedRequirements, effectKey, readBundle, validatePreset
} from '../lib/presets.mjs';

const chain = {
  effects: [
    { id: 'a1', name: 'TDR Nova', isEnabled: true },
    { id: 'a2', name: 'MJUCjr', isEnabled: true },
    { id: 'a3', name: 'TDR Nova', isEnabled: false },
    { id: 'a4', name: 'Voice Focus', isEnabled: false }
  ],
  dspEffects: [{ id: 'd1', name: 'Clipguard', isEnabled: true }]
};

test('effectKey distinguishes duplicate plugin names', () => {
  const effects = [{ name: 'Nova' }, { name: 'Compressor' }, { name: 'Nova' }];
  assert.equal(effectKey(effects[0], 0, effects), 'Nova#1');
  assert.equal(effectKey(effects[2], 2, effects), 'Nova#2');
  assert.equal(effectKey(effects[1], 1, effects), 'Compressor');
});

test('capturePreset stores portable names instead of device-specific ids', () => {
  const preset = capturePreset({ id: 'My Voice', title: 'My Voice', gainDb: 33, input: chain });
  assert.equal(preset.id, 'my-voice');
  assert.equal(preset.schema, PRESET_SCHEMA);
  assert.deepEqual(preset.effects.slice(0, 2), [
    { key: 'TDR Nova#1', enabled: true },
    { key: 'MJUCjr', enabled: true }
  ]);
  assert.equal(JSON.stringify(preset).includes('a1'), false);
});

test('capturePreset records plugin requirements without built-in effects', () => {
  const preset = capturePreset({
    id: 'req', title: 'Req', input: chain,
    inventory: { installed: [{ name: 'TDR Nova', format: 'VST3', manufacturer: 'Tokyo Dawn Labs' }] }
  });
  const names = preset.requires.map(item => item.name).sort();
  assert.deepEqual(names, ['MJUCjr', 'TDR Nova']);
  const nova = preset.requires.find(item => item.name === 'TDR Nova');
  assert.equal(nova.manufacturer, 'Tokyo Dawn Labs');
  assert.equal(nova.format, 'VST3');
});

test('derivedRequirements skips Wave Link built-ins and hardware DSP', () => {
  const preset = validatePreset({
    schema: PRESET_SCHEMA, title: 'Chain',
    effects: [{ key: 'Voice Focus', enabled: true }, { key: 'IVGI2', enabled: true }],
    dspEffects: [{ key: 'Clipguard', enabled: true }]
  });
  assert.deepEqual(derivedRequirements(preset).map(item => item.name), ['IVGI2']);
});

test('validatePreset accepts v1 files and upgrades them', () => {
  const upgraded = validatePreset({
    schema: 'voice-lab/preset/v1', title: 'Legacy', inputGainDb: 28,
    effects: [{ key: 'LoudMax', enabled: true }]
  });
  assert.equal(upgraded.schema, PRESET_SCHEMA);
  assert.deepEqual(upgraded.requires.map(item => item.name), ['LoudMax']);
});

test('validatePreset rejects incompatible formats', () => {
  assert.throws(() => validatePreset({ schema: 'unknown', title: 'Bad', effects: [] }), /Unsupported/);
  assert.throws(() => validatePreset({ schema: PRESET_SCHEMA, title: '', effects: [] }), /title is required/);
  assert.throws(() => validatePreset({ schema: PRESET_SCHEMA, title: 'No effects' }), /must be an array/);
});

test('validatePreset clamps input gain to the Wave Link range', () => {
  const low = validatePreset({ schema: PRESET_SCHEMA, title: 'Low', inputGainDb: -20, effects: [] });
  const high = validatePreset({ schema: PRESET_SCHEMA, title: 'High', inputGainDb: 900, effects: [] });
  assert.equal(low.inputGainDb, 0);
  assert.equal(high.inputGainDb, 75);
});

test('bundle round-trip preserves every preset', () => {
  const presets = [
    capturePreset({ id: 'one', title: 'One', input: chain }),
    capturePreset({ id: 'two', title: 'Two', input: chain, gainDb: 30 })
  ];
  const bundle = buildBundle(presets);
  assert.equal(bundle.schema, BUNDLE_SCHEMA);
  const restored = readBundle(JSON.parse(JSON.stringify(bundle)));
  assert.deepEqual(restored.map(preset => preset.id), ['one', 'two']);
  assert.equal(restored[1].inputGainDb, 30);
});

test('readBundle also accepts a single preset file', () => {
  const preset = capturePreset({ id: 'solo', title: 'Solo', input: chain });
  const restored = readBundle(JSON.parse(JSON.stringify(preset)));
  assert.equal(restored.length, 1);
  assert.equal(restored[0].id, 'solo');
});

test('readBundle rejects a bundle without presets', () => {
  assert.throws(() => readBundle({ schema: BUNDLE_SCHEMA }), /presets array/);
});
