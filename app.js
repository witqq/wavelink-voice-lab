const phrases = [
  {
    id: 'full-test', tag: 'Чистый тест · около 15 секунд',
    text: 'Сначала помолчи две секунды. Сегодня в студии мы спокойно записываем новый выпуск подкаста. Шесть свежих сюжетов звучат чисто и разборчиво. Сейчас я говорю тише, теперь обычно, а теперь громко и уверенно.',
    note: 'Держись в 5–8 сантиметрах, направь микрофон к уголку рта под углом 20–30° и не меняй расстояние. Пики должны быть от −12 до −6 dB. Достаточно одного чистого дубля.'
  }
];

const KIND_LABELS = {
  free: 'бесплатный',
  paid: 'платный',
  builtin: 'встроенный',
  unknown: 'неизвестный источник'
};

const els = Object.fromEntries([...document.querySelectorAll('[id]')].map(el => [el.id, el]));
let stream;
let recorder;
let chunks = [];
let recordingStarted = 0;
let timerHandle;
let phraseIndex = 0;
let activePreset = 'current';
let selectedPreset = null;
let presets = {};
let platform = { id: '', label: '' };

async function api(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Ошибка сервера');
  return data;
}

function renderPhrase() {
  const phrase = phrases[phraseIndex];
  els.phraseTag.textContent = phrase.tag;
  els.phraseText.textContent = phrase.text;
  els.phraseNote.textContent = phrase.note;
  els.phraseCounter.textContent = `${phraseIndex + 1} / ${phrases.length}`;
}

function presetCard(id, preset) {
  const button = document.createElement('button');
  button.className = `preset${id === activePreset ? ' active' : ''}${id === selectedPreset ? ' selected' : ''}`;
  button.dataset.id = id;

  const title = document.createElement('strong');
  title.textContent = preset.title;

  const character = document.createElement('p');
  character.className = 'preset-character';
  character.textContent = preset.character || 'Без описания характера';

  const hint = document.createElement('small');
  hint.textContent = preset.hint;

  const meta = document.createElement('div');
  meta.className = 'preset-meta';
  const gain = document.createElement('span');
  gain.textContent = preset.inputGainDb == null ? 'усиление не задано' : `${preset.inputGainDb} дБ`;
  const count = document.createElement('span');
  count.textContent = `${preset.activeEffectCount} эффектов`;
  meta.append(gain, count);
  if (preset.bestFor?.length) {
    const use = document.createElement('span');
    use.textContent = preset.bestFor.slice(0, 2).join(' · ');
    meta.append(use);
  }

  const readiness = document.createElement('span');
  readiness.className = `readiness ${preset.ready ? 'ok' : 'warn'}`;
  readiness.textContent = preset.ready
    ? 'все плагины на месте'
    : `не хватает: ${preset.missingRequired.join(', ')}`;

  button.append(title, character, hint, meta, readiness);
  button.addEventListener('click', () => selectPreset(id));
  return button;
}

function renderPresets() {
  const entries = Object.entries(presets);
  if (!entries.length) {
    els.presetGrid.replaceChildren(Object.assign(document.createElement('p'), {
      className: 'empty',
      textContent: 'Пресетов нет. Нажми «Импорт» и выбери файл .voicepreset.json или бандл.'
    }));
    return;
  }
  els.presetGrid.replaceChildren(...entries.map(([id, preset]) => presetCard(id, preset)));
}

function pluginRow(plugin) {
  const row = document.createElement('article');
  row.className = `plugin-row ${plugin.installed ? 'installed' : plugin.required ? 'missing' : 'optional'}`;

  const info = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = plugin.name;
  const meta = document.createElement('small');
  const parts = [];
  if (plugin.manufacturer) parts.push(plugin.manufacturer);
  parts.push(KIND_LABELS[plugin.kind] || plugin.kind);
  if (plugin.formats.length) parts.push(plugin.formats.join(' / '));
  if (!plugin.required) parts.push('в пресете выключен');
  if (plugin.note) parts.push(plugin.note);
  meta.textContent = parts.join(' · ');
  info.append(name, meta);

  const state = document.createElement('div');
  state.className = 'plugin-state';
  const badge = document.createElement('span');
  if (plugin.builtin) {
    badge.className = 'badge builtin';
    badge.textContent = 'встроен';
  } else if (plugin.installed) {
    badge.className = 'badge ok';
    badge.textContent = 'установлен';
  } else {
    badge.className = `badge ${plugin.required ? 'missing' : 'optional'}`;
    badge.textContent = plugin.required ? 'нужен' : 'не обязателен';
  }
  state.append(badge);

  if (!plugin.supportedOnPlatform) {
    const warning = document.createElement('span');
    warning.className = 'badge warn';
    warning.textContent = `нет сборки для ${platform.label}`;
    state.append(warning);
  }
  if (plugin.formatMismatch) {
    const warning = document.createElement('span');
    warning.className = 'badge warn';
    warning.textContent = 'формат не подходит Wave Link';
    state.append(warning);
  }
  if (!plugin.installed && plugin.url) {
    const link = document.createElement('a');
    link.className = 'button link';
    link.href = plugin.url;
    link.target = '_blank';
    link.rel = 'noreferrer noopener';
    link.textContent = 'Скачать';
    state.append(link);
  }

  row.append(info, state);
  return row;
}

function renderPlugins() {
  const preset = presets[selectedPreset];
  if (!preset) {
    els.pluginSummary.textContent = 'Выбери пресет, чтобы увидеть требования.';
    els.pluginList.replaceChildren();
    return;
  }
  const missing = preset.missingRequired.length;
  const summary = [`Пресет «${preset.title}»`, `платформа ${platform.label}`];
  summary.push(missing ? `не хватает ${missing} плагинов` : 'все нужные плагины установлены');
  if (preset.unsupported.length) summary.push(`нет сборки для этой ОС: ${preset.unsupported.join(', ')}`);
  els.pluginSummary.textContent = summary.join(' · ');
  els.pluginList.replaceChildren(...preset.plugins.map(pluginRow));
}

function renderInventory(inventory) {
  els.inventoryCount.textContent = `(${inventory.count})`;
  els.inventoryList.replaceChildren(...inventory.installed.map(entry => {
    const row = document.createElement('span');
    row.className = 'inventory-item';
    row.textContent = `${entry.name} · ${entry.format}${entry.manufacturer ? ` · ${entry.manufacturer}` : ''}`;
    return row;
  }));
  const sources = [];
  if (inventory.cacheFiles.length) sources.push(`кеш Wave Link: ${inventory.cacheFiles.length}`);
  if (inventory.scannedDirectories.length) sources.push(`папки плагинов: ${inventory.scannedDirectories.join(', ')}`);
  els.inventorySources.textContent = sources.length ? sources.join(' · ') : 'Источники плагинов не найдены.';
}

function selectPreset(id) {
  selectedPreset = id;
  renderPresets();
  renderPlugins();
  applyPreset(id);
}

async function applyPreset(id) {
  const preset = presets[id];
  if (preset && !preset.ready) {
    els.presetBusy.textContent = `Не хватает плагинов: ${preset.missingRequired.join(', ')}. Применяю то, что есть.`;
  } else {
    els.presetBusy.textContent = 'Переключаю…';
  }
  [...els.presetGrid.children].forEach(button => { button.disabled = true; });
  try {
    const data = await api('/api/preset', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id })
    });
    activePreset = data.waveLink.activePreset;
    els.presetBusy.textContent = data.waveLink.missingEffects?.length
      ? `Применено частично. Не найдены в цепочке: ${data.waveLink.missingEffects.join(', ')}`
      : 'Применено';
    renderPresets();
  } catch (error) {
    els.presetBusy.textContent = error.message;
  } finally {
    [...els.presetGrid.children].forEach(button => { button.disabled = false; });
  }
}

async function saveCurrentPreset() {
  const title = window.prompt('Название нового пресета');
  if (!title?.trim()) return;
  const description = window.prompt('Коротко: как он звучит и чем отличается?', '');
  if (description == null) return;
  els.presetBusy.textContent = 'Сохраняю пресет…';
  try {
    const saved = await api('/api/presets/capture', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), description: description.trim(), character: description.trim() })
    });
    els.presetBusy.textContent = `Сохранено: ${saved.fileName}`;
    await refresh();
  } catch (error) {
    els.presetBusy.textContent = error.message;
  }
}

async function importPresets(files) {
  if (!files?.length) return;
  els.presetBusy.textContent = 'Импортирую…';
  const summary = [];
  try {
    for (const file of files) {
      const parsed = JSON.parse(await file.text());
      const result = await api('/api/presets/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed)
      });
      for (const item of result.imported) {
        summary.push(item.missingRequired.length
          ? `${item.title}: не хватает ${item.missingRequired.join(', ')}`
          : `${item.title}: готов`);
      }
    }
    els.presetBusy.textContent = `Импортировано ${summary.length}. ${summary.join(' · ')}`;
    await refresh();
    const firstMissing = Object.entries(presets).find(([, preset]) => !preset.ready);
    if (firstMissing) {
      selectedPreset = firstMissing[0];
      renderPresets();
      renderPlugins();
    }
  } catch (error) {
    els.presetBusy.textContent = `Ошибка импорта: ${error.message}`;
  } finally {
    els.importPresetInput.value = '';
  }
}

async function refresh() {
  const data = await api('/api/status');
  presets = data.presets;
  platform = data.platform;
  activePreset = data.waveLink.activePreset;
  if (!selectedPreset || !presets[selectedPreset]) selectedPreset = Object.keys(presets)[0] || null;

  els.waveStatus.className = `status ${data.waveLink.connected ? 'ok' : 'error'}`;
  els.waveStatus.replaceChildren(document.createElement('span'));
  els.waveStatus.append(data.waveLink.connected
    ? `Wave Link подключён${data.waveLink.device ? `: ${data.waveLink.device}` : ''}`
    : `Wave Link: ${data.waveLink.error || 'нет соединения'}`);

  els.platformStatus.className = 'status neutral';
  els.platformStatus.replaceChildren(document.createElement('span'));
  els.platformStatus.append(`${platform.label} · плагинов найдено: ${data.inventory.count}`);

  renderPresets();
  renderPlugins();
  renderInventory(data.inventory);
  renderRecordings(data.recordings);
}

async function refreshPlugins() {
  els.pluginSummary.textContent = 'Сканирую плагины…';
  try {
    await api('/api/plugins?refresh=1');
    await refresh();
  } catch (error) {
    els.pluginSummary.textContent = error.message;
  }
}

async function connectMicrophone() {
  try {
    if (stream) stream.getTracks().forEach(track => track.stop());
    const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    permissionStream.getTracks().forEach(track => track.stop());
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'audioinput');
    els.deviceSelect.replaceChildren(...devices.map(device => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `Микрофон ${els.deviceSelect.length + 1}`;
      return option;
    }));
    const preferred = devices.find(device => /microphonefx|wave link.*fx/i.test(device.label));
    if (preferred) els.deviceSelect.value = preferred.deviceId;
    els.deviceSelect.disabled = false;
    await openSelectedDevice();
  } catch (error) {
    els.recordStatus.textContent = `Нет доступа к микрофону: ${error.message}`;
  }
}

async function openSelectedDevice() {
  if (stream) stream.getTracks().forEach(track => track.stop());
  stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: { exact: els.deviceSelect.value },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1
    }
  });
  setupMeter(stream);
  els.recordButton.disabled = false;
  els.recordStatus.textContent = /microphonefx|wave link.*fx/i.test(els.deviceSelect.selectedOptions[0]?.textContent || '')
    ? 'Готово: записывается обработанный сигнал Wave Link'
    : 'Готово. Для теста пресетов лучше выбрать Wave Link MicrophoneFX';
}

function setupMeter(inputStream) {
  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  context.createMediaStreamSource(inputStream).connect(analyser);
  const data = new Float32Array(analyser.fftSize);
  const tick = () => {
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (const sample of data) sum += sample * sample;
    const rms = Math.sqrt(sum / data.length);
    const db = rms > 0 ? 20 * Math.log10(rms) : -96;
    els.meterFill.style.width = `${Math.max(0, Math.min(100, (db + 60) / 60 * 100))}%`;
    els.meterPeak.textContent = `${Math.round(db)} dB`;
    requestAnimationFrame(tick);
  };
  tick();
}

function preferredMime() {
  return ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']
    .find(type => MediaRecorder.isTypeSupported(type)) || '';
}

async function toggleRecording() {
  if (recorder?.state === 'recording') {
    recorder.stop();
    return;
  }
  chunks = [];
  recorder = new MediaRecorder(stream, preferredMime() ? { mimeType: preferredMime(), audioBitsPerSecond: 192000 } : undefined);
  recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
  recorder.onstop = saveRecording;
  recorder.start(250);
  recordingStarted = performance.now();
  els.recordButton.classList.add('recording');
  els.recordButton.querySelector('b').textContent = 'Остановить и сохранить';
  els.recordStatus.textContent = 'Идёт запись…';
  timerHandle = setInterval(updateTimer, 50);
}

function updateTimer() {
  const elapsed = performance.now() - recordingStarted;
  const minutes = Math.floor(elapsed / 60000);
  const seconds = Math.floor(elapsed / 1000) % 60;
  const tenths = Math.floor(elapsed / 100) % 10;
  els.timer.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`;
}

async function saveRecording() {
  clearInterval(timerHandle);
  els.recordButton.classList.remove('recording');
  els.recordButton.querySelector('b').textContent = 'Начать запись';
  els.recordButton.disabled = true;
  els.recordStatus.textContent = 'Сохраняю на сервер…';
  try {
    const phrase = phrases[phraseIndex];
    const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
    const query = new URLSearchParams({ preset: activePreset, phrase: phrase.id, take: els.takeNumber.value });
    const saved = await api(`/api/recordings?${query}`, { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob });
    els.recordStatus.textContent = `Сохранено: ${saved.name}`;
    els.takeNumber.value = Number(els.takeNumber.value) + 1;
    const data = await api('/api/status');
    renderRecordings(data.recordings);
  } catch (error) {
    els.recordStatus.textContent = `Не сохранилось: ${error.message}`;
  } finally {
    els.recordButton.disabled = false;
  }
}

function renderRecordings(items) {
  if (!items.length) {
    els.recordings.replaceChildren(Object.assign(document.createElement('p'), {
      className: 'empty', textContent: 'Записей пока нет.'
    }));
    return;
  }
  els.recordings.replaceChildren(...items.map(item => {
    const row = document.createElement('article');
    row.className = 'recording-row';
    const info = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = item.name;
    const date = document.createElement('small');
    date.textContent = new Date(item.created).toLocaleString('ru-RU');
    info.append(title, date);
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'metadata';
    audio.src = item.url;
    row.append(info, audio);
    return row;
  }));
}

els.connectButton.addEventListener('click', connectMicrophone);
els.deviceSelect.addEventListener('change', openSelectedDevice);
els.recordButton.addEventListener('click', toggleRecording);
els.refreshButton.addEventListener('click', refresh);
els.refreshPluginsButton.addEventListener('click', refreshPlugins);
els.savePresetButton.addEventListener('click', saveCurrentPreset);
els.exportAllButton.addEventListener('click', () => {
  window.location.href = '/api/presets/export?id=all';
});
els.importPresetInput.addEventListener('change', () => importPresets([...els.importPresetInput.files]));

renderPhrase();
refresh().catch(error => {
  els.waveStatus.className = 'status error';
  els.waveStatus.replaceChildren(document.createElement('span'));
  els.waveStatus.append(error.message);
});
