import os from 'node:os';
import path from 'node:path';
import { readdir } from 'node:fs/promises';

const home = os.homedir();

function windowsRoots() {
  return {
    appData: process.env.APPDATA || path.join(home, 'AppData', 'Roaming'),
    localAppData: process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'),
    programFiles: process.env.PROGRAMFILES || 'C:\\Program Files',
    commonProgramFiles: process.env.COMMONPROGRAMFILES || 'C:\\Program Files\\Common Files'
  };
}

/**
 * Wave Link keeps a scanned plugin inventory next to its configuration. The MSIX
 * build of Wave Link redirects that folder into a per-package LocalState path, so
 * both variants have to be considered on Windows.
 */
export async function pluginCacheCandidates(platform = process.platform) {
  if (platform === 'win32') {
    const { appData, localAppData } = windowsRoots();
    const candidates = [
      path.join(appData, 'Elgato', 'WaveLink', 'AvailablePlugins.cache'),
      path.join(appData, 'Elgato', 'WaveLink', 'KnownPlugins.cache')
    ];
    for (const pkg of await packageDirectories(localAppData)) {
      candidates.push(
        path.join(pkg, 'LocalState', 'AudioPluginCache', 'AvailablePlugins.cache'),
        path.join(pkg, 'LocalState', 'AudioPluginCache', 'KnownPlugins.cache')
      );
    }
    return candidates;
  }
  if (platform === 'darwin') {
    const support = path.join(home, 'Library', 'Application Support', 'Elgato', 'WaveLink');
    return [
      path.join(support, 'AvailablePlugins.cache'),
      path.join(support, 'KnownPlugins.cache')
    ];
  }
  return [];
}

async function packageDirectories(localAppData) {
  try {
    const entries = await readdir(path.join(localAppData, 'Packages'), { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory() && entry.name.startsWith('Elgato.WaveLink'))
      .map(entry => path.join(localAppData, 'Packages', entry.name));
  } catch {
    return [];
  }
}

/**
 * Fallback inventory when Wave Link has never written a cache: the standard plugin
 * folders for each platform. Wave Link loads VST3 on Windows and VST3 plus Audio
 * Units on macOS.
 */
export function pluginDirectories(platform = process.platform) {
  if (platform === 'win32') {
    const { commonProgramFiles } = windowsRoots();
    return [{ dir: path.join(commonProgramFiles, 'VST3'), format: 'VST3', suffix: '.vst3' }];
  }
  if (platform === 'darwin') {
    return [
      { dir: '/Library/Audio/Plug-Ins/VST3', format: 'VST3', suffix: '.vst3' },
      { dir: path.join(home, 'Library', 'Audio', 'Plug-Ins', 'VST3'), format: 'VST3', suffix: '.vst3' },
      { dir: '/Library/Audio/Plug-Ins/Components', format: 'AU', suffix: '.component' },
      { dir: path.join(home, 'Library', 'Audio', 'Plug-Ins', 'Components'), format: 'AU', suffix: '.component' }
    ];
  }
  return [];
}

export function platformLabel(platform = process.platform) {
  if (platform === 'win32') return 'Windows';
  if (platform === 'darwin') return 'macOS';
  return platform;
}

/** Plugin format Wave Link expects on the given platform. */
export function expectedFormats(platform = process.platform) {
  return platform === 'darwin' ? ['VST3', 'AU'] : ['VST3'];
}
