import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { slugify, validatePreset } from './presets.mjs';

const SUFFIX = '.voicepreset.json';

/**
 * Presets live in a gitignored folder inside the project, so a clone of the public
 * repository starts empty and the user's own chain never reaches a commit.
 */
export class PresetStore {
  constructor(dir) {
    this.dir = dir;
  }

  async init() {
    await mkdir(this.dir, { recursive: true });
    return this;
  }

  fileFor(id) {
    return path.join(this.dir, `${slugify(id)}${SUFFIX}`);
  }

  async list() {
    let names;
    try {
      names = (await readdir(this.dir)).filter(name => name.endsWith(SUFFIX));
    } catch {
      return [];
    }
    const presets = [];
    for (const name of names) {
      try {
        const preset = validatePreset(JSON.parse(await readFile(path.join(this.dir, name), 'utf8')));
        presets.push({ ...preset, fileName: name });
      } catch (error) {
        console.warn(`Skipped invalid preset ${name}: ${error.message}`);
      }
    }
    return presets.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  }

  async find(id) {
    return (await this.list()).find(preset => preset.id === id) || null;
  }

  /** Reserve an id that no stored preset uses yet. */
  async uniqueId(value) {
    const base = slugify(value);
    let id = base;
    let index = 2;
    for (;;) {
      try {
        await access(this.fileFor(id));
        id = `${base}-${index++}`;
      } catch {
        return id;
      }
    }
  }

  async save(preset, { overwrite = false } = {}) {
    const id = overwrite ? slugify(preset.id) : await this.uniqueId(preset.id);
    const stored = validatePreset({ ...preset, id });
    const fileName = `${stored.id}${SUFFIX}`;
    await writeFile(path.join(this.dir, fileName), `${JSON.stringify(stored, null, 2)}\n`, 'utf8');
    return { preset: stored, fileName };
  }

  async remove(id) {
    const file = this.fileFor(id);
    try {
      await rm(file);
      return true;
    } catch {
      return false;
    }
  }
}
