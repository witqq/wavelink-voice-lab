import { WaveLinkController } from '@darrellvs/node-wave-link-sdk';
import { capturePreset, effectKey } from './presets.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Live connection to Wave Link plus the preset apply logic. */
export class WaveLink {
  sdk = new WaveLinkController();
  ready = false;
  error = null;
  device = null;
  input = null;
  original = null;
  activePreset = 'current';
  lastMissingEffects = [];

  constructor() {
    this.sdk.on('ready', () => this.refresh(true));
    this.sdk.on('inputDevicesChanged', () => this.refresh(false));
    this.sdk.on('inputDeviceChanged', () => this.refresh(false));
    this.sdk.on('disconnected', () => {
      this.ready = false;
      this.error = 'Wave Link disconnected';
    });
  }

  connect() {
    try {
      this.sdk.connect();
    } catch (error) {
      this.error = error.message;
    }
  }

  /** Wave Link exposes gain as a raw value plus a lookup table to dB. */
  gainDb(input = this.input) {
    const gain = input?.gain;
    if (!gain) return null;
    const row = (gain.lookUpTable || []).reduce((best, item) =>
      !best || Math.abs(item[0] - gain.value) < Math.abs(best[0] - gain.value) ? item : best, null);
    return row ? Number(row[1]) : null;
  }

  nearestGainValue(db) {
    const row = (this.input?.gain?.lookUpTable || []).reduce((best, item) =>
      !best || Math.abs(item[1] - db) < Math.abs(best[1] - db) ? item : best, null);
    return row?.[0];
  }

  refresh(initial) {
    this.device = this.sdk.getInputDevices().find(device => device.name === 'Elgato XLR Dock')
      || this.sdk.getWaveInputDevices()[0]
      || this.sdk.getInputDevices().find(device => device.inputs?.length);
    this.input = this.device?.inputs?.[0] || null;
    if (!this.device || !this.input) {
      this.ready = false;
      this.error = 'Compatible Wave Link microphone input was not found';
      return;
    }
    if (!this.original) this.original = this.snapshot('Состояние Wave Link при запуске Voice Lab');
    this.ready = true;
    this.error = null;
    if (initial) console.log(`Wave Link: ${this.device.name} (${process.platform})`);
  }

  snapshot(description, inventory = null) {
    return capturePreset({
      id: 'current',
      title: 'Текущий звук',
      description,
      character: 'Текущая рабочая цепочка без изменений',
      input: this.input,
      gainDb: this.gainDb(),
      inventory
    });
  }

  currentPreset(inventory = null) {
    if (!this.input) return this.original;
    return this.snapshot('Активное состояние Wave Link', inventory);
  }

  localKeys() {
    return {
      effects: new Set(this.input.effects.map((effect, index, all) => effectKey(effect, index, all))),
      dsp: new Set((this.input.dspEffects || []).map((effect, index, all) => effectKey(effect, index, all)))
    };
  }

  /**
   * Apply a preset by name-matched chain state. Plugin parameter chunks are not
   * portable between VST3 and AU, so only enable/disable state and input gain move.
   */
  async apply(preset) {
    if (!this.ready) throw new Error(this.error || 'Wave Link is not connected');
    if (!preset) throw new Error('Unknown preset');
    const requested = new Map(preset.effects.map(effect => [effect.key, effect.enabled]));
    const requestedDsp = new Map(preset.dspEffects.map(effect => [effect.key, effect.enabled]));
    const local = this.localKeys();
    const effects = this.input.effects.map((effect, index, all) => ({
      id: effect.id,
      isEnabled: requested.get(effectKey(effect, index, all)) ?? false
    }));
    const dspEffects = (this.input.dspEffects || []).map((effect, index, all) => ({
      id: effect.id,
      isEnabled: requestedDsp.get(effectKey(effect, index, all)) ?? effect.isEnabled
    }));
    const missingEffects = [
      ...preset.effects.filter(effect => effect.enabled && !local.effects.has(effect.key)).map(effect => effect.key),
      ...preset.dspEffects.filter(effect => effect.enabled && !local.dsp.has(effect.key)).map(effect => effect.key)
    ];

    const inputPatch = { id: this.input.id, effects, dspEffects };
    if (preset.inputGainDb != null) {
      const value = this.nearestGainValue(preset.inputGainDb);
      if (value != null) inputPatch.gain = { value };
    }
    this.sdk.setInputDevice({ id: this.device.id, inputs: [inputPatch] });

    for (const patch of [...effects, ...dspEffects]) {
      const target = [...this.input.effects, ...(this.input.dspEffects || [])].find(effect => effect.id === patch.id);
      if (target) target.isEnabled = patch.isEnabled;
    }
    if (inputPatch.gain) this.input.gain.value = inputPatch.gain.value;
    this.activePreset = preset.id;
    this.lastMissingEffects = missingEffects;
    await delay(150);
    return missingEffects;
  }

  status() {
    return {
      connected: this.ready,
      error: this.error,
      platform: process.platform,
      device: this.device?.name || null,
      activePreset: this.activePreset,
      inputGainDb: this.gainDb(),
      missingEffects: this.lastMissingEffects,
      effects: this.input?.effects?.map((effect, index, all) => ({
        name: effectKey(effect, index, all),
        enabled: effect.isEnabled
      })) || []
    };
  }
}
