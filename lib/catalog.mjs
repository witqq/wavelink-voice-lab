/**
 * Download and licensing reference for every plugin these presets are built from.
 *
 * `kind` drives how a missing plugin is reported:
 *   builtin  — ships with Wave Link or lives in the Wave hardware DSP, never missing
 *   free     — free download, may require an account or a newsletter opt-in
 *   paid     — commercial licence required
 *
 * `platforms` lists where the plugin exists at all, so a preset made on Windows can
 * warn that one of its plugins has no macOS build.
 */
export const PLUGIN_CATALOG = [
  { name: 'Voice Focus', manufacturer: 'Elgato', kind: 'builtin', platforms: ['win32', 'darwin'],
    url: 'https://www.elgato.com/us/en/s/wave-link-app', note: 'Встроено в Wave Link' },
  { name: 'Elgato Compressor', manufacturer: 'Elgato', kind: 'builtin', platforms: ['win32', 'darwin'],
    aliases: ['ElgatoCompressor'],
    url: 'https://www.elgato.com/us/en/s/wave-link-app', note: 'Поставляется с Wave Link' },
  { name: 'Elgato EQ', manufacturer: 'Elgato', kind: 'builtin', platforms: ['win32', 'darwin'],
    aliases: ['ElgatoEq'],
    url: 'https://www.elgato.com/us/en/s/wave-link-app', note: 'Поставляется с Wave Link' },
  { name: 'Elgato Noise Removal', manufacturer: 'Elgato', kind: 'builtin', platforms: ['win32', 'darwin'],
    aliases: ['ElgatoNoiseRemoval'],
    url: 'https://www.elgato.com/us/en/s/wave-link-app', note: 'Поставляется с Wave Link' },
  { name: 'NVIDIA Broadcast Noise Removal by Elgato', manufacturer: 'Elgato', kind: 'builtin', platforms: ['win32'],
    url: 'https://www.nvidia.com/en-us/geforce/broadcasting/broadcast-app/',
    note: 'Только Windows, требует NVIDIA RTX и NVIDIA Broadcast' },
  { name: 'Clipguard', manufacturer: 'Elgato', kind: 'builtin', platforms: ['win32', 'darwin'],
    url: 'https://www.elgato.com/us/en/s/wave-link-app', note: 'Аппаратный DSP микрофона Wave, не плагин' },
  { name: 'Lowcut Filter', manufacturer: 'Elgato', kind: 'builtin', platforms: ['win32', 'darwin'],
    url: 'https://www.elgato.com/us/en/s/wave-link-app', note: 'Аппаратный DSP микрофона Wave, не плагин' },

  { name: 'TDR Nova', manufacturer: 'Tokyo Dawn Labs', kind: 'free', platforms: ['win32', 'darwin'],
    url: 'https://www.tokyodawn.net/tdr-nova/', note: 'Динамический эквалайзер, бесплатная версия' },
  { name: 'MJUCjr', manufacturer: 'Klanghelm', kind: 'free', platforms: ['win32', 'darwin'],
    url: 'https://klanghelm.com/contents/products/MJUCjr.php', note: 'Ламповый вари-мю компрессор' },
  { name: 'IVGI2', manufacturer: 'Klanghelm', kind: 'free', platforms: ['win32', 'darwin'],
    url: 'https://klanghelm.com/contents/products/IVGI.php', note: 'Консольная сатурация' },
  { name: 'T-De-Esser 2', manufacturer: 'Techivation', kind: 'free', platforms: ['win32', 'darwin'],
    url: 'https://techivation.com/t-de-esser/', note: 'Де-эссер, нужна регистрация аккаунта' },
  { name: 'LoudMax', manufacturer: 'Thomas Mundt', kind: 'free', platforms: ['win32', 'darwin'],
    url: 'https://loudmax.blogspot.com/', note: 'Брикволл-лимитер' },
  { name: 'SPAN', manufacturer: 'Voxengo', kind: 'free', platforms: ['win32', 'darwin'],
    url: 'https://www.voxengo.com/product/span/', note: 'Анализатор спектра, только измерение' },
  { name: 'Marvel GEQ', manufacturer: 'Voxengo', kind: 'free', platforms: ['win32', 'darwin'],
    url: 'https://www.voxengo.com/product/marvelgeq/', note: 'Линейно-фазовый 16-полосный эквалайзер' },
  { name: 'Saturation Knob', manufacturer: 'Softube', kind: 'free', platforms: ['win32', 'darwin'],
    url: 'https://softube.com/us/plug-ins/saturation-knob', note: 'Нужен аккаунт Softube' },
  { name: 'La Petite Excite', manufacturer: 'Fine Cut Bodies', kind: 'free', platforms: ['win32', 'darwin'],
    url: 'https://www.kvraudio.com/product/la-petite-excite-by-fine-cut-bodies', note: 'Эксайтер верхних частот' },
  { name: 'Multi-Q', manufacturer: 'Viator DSP', kind: 'free', platforms: ['win32', 'darwin'],
    url: 'https://viatordsp.gumroad.com/', note: 'Три модели эквалайзера в одном плагине' },
  { name: 'Tiny Phone', manufacturer: 'Milkpack', kind: 'free', platforms: ['win32', 'darwin'],
    url: 'https://www.marketplace.elgato.com/product/tiny-phone-c22be47f-64ab-4453-bdf2-b5e20297b1cb',
    note: 'Ставится из Elgato Marketplace' },
  { name: 'NDI Input', manufacturer: 'NDI', kind: 'free', platforms: ['win32', 'darwin'],
    url: 'https://ndi.video/tools/', note: 'Часть NDI Tools' },
  { name: 'NDI Output', manufacturer: 'NDI', kind: 'free', platforms: ['win32', 'darwin'],
    url: 'https://ndi.video/tools/', note: 'Часть NDI Tools' },

  { name: 'Saturn 2', manufacturer: 'FabFilter', kind: 'paid', platforms: ['win32', 'darwin'],
    aliases: ['FabFilter Saturn 2'],
    url: 'https://www.fabfilter.com/products/saturn-2-multiband-distortion-saturation-plug-in',
    note: 'Платный, есть демо с ограничениями' },
  { name: 'Acon Digital DeVerberate 3', manufacturer: 'Acon Digital', kind: 'paid', platforms: ['win32', 'darwin'],
    aliases: ['DeVerberate3', 'DeVerberate 3'],
    url: 'https://acondigital.com/products/deverberate', note: 'Платный, есть пробная версия' }
];

/** Wave Link reports repeated plugins as `Name#1`, `Name#2`; the catalog is keyed by bare name. */
export function pluginNameFromKey(key) {
  return String(key ?? '').split('#')[0].trim();
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

const byName = new Map();
for (const entry of PLUGIN_CATALOG) {
  for (const alias of [entry.name, ...(entry.aliases || [])]) byName.set(normalize(alias), entry);
}

export function catalogEntry(name) {
  return byName.get(normalize(pluginNameFromKey(name))) || null;
}

/**
 * Every name a plugin can appear under. A directory scan sees the file name
 * (`FabFilter Saturn 2.vst3`) while Wave Link's cache reports the plugin name
 * (`Saturn 2`), so both have to match the same catalog entry.
 */
export function knownNames(name) {
  const entry = catalogEntry(name);
  const names = entry ? [entry.name, ...(entry.aliases || [])] : [pluginNameFromKey(name)];
  return [...new Set(names.map(normalize))];
}

/** True when the effect lives inside Wave Link or the microphone DSP rather than as a plugin file. */
export function isBuiltin(name) {
  return catalogEntry(name)?.kind === 'builtin';
}
