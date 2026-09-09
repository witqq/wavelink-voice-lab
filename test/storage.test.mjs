import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { PresetStore } from '../lib/storage.mjs';
import { PRESET_SCHEMA, validatePreset } from '../lib/presets.mjs';

function preset(title, gain = 28) {
  return validatePreset({
    schema: PRESET_SCHEMA, title, inputGainDb: gain,
    effects: [{ key: 'TDR Nova', enabled: true }]
  });
}

async function withStore(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'voice-lab-test-'));
  try {
    await run(await new PresetStore(dir).init());
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('store starts empty and round-trips a preset', async () => {
  await withStore(async store => {
    assert.deepEqual(await store.list(), []);
    const { fileName } = await store.save(preset('Radio Voice'));
    assert.equal(fileName, 'radio-voice.voicepreset.json');
    const list = await store.list();
    assert.equal(list.length, 1);
    assert.equal(list[0].title, 'Radio Voice');
    assert.equal((await store.find('radio-voice')).inputGainDb, 28);
  });
});

test('saving twice keeps both presets under distinct ids', async () => {
  await withStore(async store => {
    const first = await store.save(preset('Radio'));
    const second = await store.save(preset('Radio', 30));
    assert.equal(first.preset.id, 'radio');
    assert.equal(second.preset.id, 'radio-2');
    assert.equal((await store.list()).length, 2);
  });
});

test('overwrite replaces the stored file instead of adding one', async () => {
  await withStore(async store => {
    await store.save(preset('Radio', 28));
    const updated = await store.save({ ...preset('Radio', 33), id: 'radio' }, { overwrite: true });
    assert.equal(updated.preset.id, 'radio');
    const list = await store.list();
    assert.equal(list.length, 1);
    assert.equal(list[0].inputGainDb, 33);
  });
});

test('stored files are formatted JSON with the current schema', async () => {
  await withStore(async store => {
    const { fileName } = await store.save(preset('Formatted'));
    const raw = await readFile(path.join(store.dir, fileName), 'utf8');
    assert.equal(raw.endsWith('\n'), true);
    assert.equal(JSON.parse(raw).schema, PRESET_SCHEMA);
  });
});

test('invalid files are skipped rather than breaking the listing', async () => {
  await withStore(async store => {
    await store.save(preset('Good'));
    const { writeFile } = await import('node:fs/promises');
    await writeFile(path.join(store.dir, 'broken.voicepreset.json'), '{ not json', 'utf8');
    const list = await store.list();
    assert.deepEqual(list.map(item => item.title), ['Good']);
  });
});

test('remove deletes a preset and reports unknown ids', async () => {
  await withStore(async store => {
    await store.save(preset('Temporary'));
    assert.equal(await store.remove('temporary'), true);
    assert.deepEqual(await store.list(), []);
    assert.equal(await store.remove('temporary'), false);
  });
});
