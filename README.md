# Voice Lab

Local browser tool for moving an Elgato Wave Link microphone chain between machines and
for recording A/B comparisons of it.

This repository ships **no presets and no recordings**. You bring your own chain in
through the interface: import a preset file, see which plugins that chain needs, install
the ones this machine is missing, then activate the preset.

## What it does

- **Import / export** — presets travel as JSON files, one preset per file or all of them
  in a single bundle. Nothing about your chain is stored in git.
- **Plugin analysis** — reads Wave Link's own plugin inventory, compares it against the
  imported preset, and lists what is missing with a download link and licence for each.
- **Cross-platform** — the same preset applies on Windows and macOS. Wave Link built-in
  effects and Wave hardware DSP are recognised as always present.
- **Recording** — records the processed Wave Link signal so presets can be compared on
  one clean take.

## Requirements

- Node.js 20 or newer
- Elgato Wave Link running, with a Wave or XLR Dock input
- Windows 10/11 or macOS

## Start

Windows: run `start.cmd`.

macOS:

```bash
chmod +x start.command
./start.command
```

Open <http://127.0.0.1:8765>, allow microphone access, and select
`Wave Link MicrophoneFX` as the input so recordings capture the processed signal.

The server binds to `127.0.0.1` only and has no authentication; it is meant to run on the
machine you are sitting at, not to be exposed to a network.

## Moving a setup to another machine

On the machine that already sounds right:

1. Press **Экспорт всех**. You get `voice-lab-presets-<date>.json` with every preset.

On the new machine:

1. Clone this repository and start Voice Lab.
2. Press **Импорт** and pick that file. Single `.voicepreset.json` files work too.
3. The **Плагины** panel lists what the preset needs. Anything not installed shows a
   **Скачать** button pointing at the vendor's page, plus whether it is free or paid.
4. Install the missing plugins, restart Wave Link so it rescans, press
   **Пересканировать**, and click the preset to apply it.

## What a preset does and does not carry

Wave Link loads VST3 on Windows and VST3 or Audio Units on macOS. Vendor parameter
chunks are binary and not portable between those formats, so a preset carries:

- the plugin chain by name, with each plugin's enabled state
- Wave hardware DSP state (Clipguard, Lowcut Filter)
- input gain in dB
- a `requires` list naming each plugin's vendor and format
- human-readable `description`, `character`, `bestFor`, `processing`, `tradeoffs`,
  `measurements` and `notes`

Individual plugin settings (the knob positions inside TDR Nova, for example) are **not**
transferred. `processing` exists to record those in words so they can be dialled in by
hand; keep it accurate when tuning a preset, and raise `revision`.

## Plugin detection

The inventory comes from Wave Link's own scan results:

- Windows — `%APPDATA%\Elgato\WaveLink\*.cache`, plus the MSIX build's
  `%LOCALAPPDATA%\Packages\Elgato.WaveLink*\LocalState\AudioPluginCache\*.cache`
- macOS — `~/Library/Application Support/Elgato/WaveLink/*.cache`

If Wave Link has never written a cache, the standard plugin folders are scanned as a
fallback (`Common Files\VST3` on Windows; `VST3` and `Components`, both system and user,
on macOS). A plugin file is sometimes named differently from the plugin itself, so the
catalog in `lib/catalog.mjs` maps the known aliases.

## Storage

| Data | Location | In git |
| --- | --- | --- |
| Presets | `presets/` | no |
| Recordings | `recordings/` | no |
| Wave Link settings backups | `backups/` | no |

Override with `VOICE_LAB_PRESETS`, `VOICE_LAB_RECORDINGS` and `VOICE_LAB_PORT`.

## HTTP API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/status` | Wave Link state, platform, inventory, presets with readiness, recordings |
| GET | `/api/plugins?refresh=1` | installed plugins and where they were found |
| POST | `/api/preset` | apply a preset by `id` |
| POST | `/api/presets/capture` | save the live chain as a new preset |
| POST | `/api/presets/import?overwrite=1` | import a preset or a bundle |
| GET | `/api/presets/export?id=all` | export one preset or every preset |
| POST | `/api/presets/delete` | delete a stored preset |
| POST | `/api/recordings` | store a recording |

## Development

```bash
npm install
npm test        # node --test
npm start
```

Preset and bundle schemas are `voice-lab/preset/v2` and `voice-lab/bundle/v1`. Files
written by the earlier `voice-lab/preset/v1` build still import and are upgraded on read.
