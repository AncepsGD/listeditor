import { state } from './state.js';
import { SETTINGS_KEY } from './state.config.js';

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) Object.assign(state.settings, JSON.parse(raw));
  } catch (_) { }
}

export function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  } catch (_) { }
}
