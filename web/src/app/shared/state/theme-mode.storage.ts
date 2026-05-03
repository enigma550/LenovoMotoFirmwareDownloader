import type { ThemeMode } from './workflow.types';

const THEME_STORAGE_KEY = 'theme_mode';

export function readInitialThemeMode(): ThemeMode {
  try {
    const storedTheme = globalThis.localStorage?.getItem(THEME_STORAGE_KEY);
    if (storedTheme === 'light' || storedTheme === 'dark') {
      return storedTheme;
    }
  } catch {
    // Ignore storage access errors and fallback to dark mode.
  }
  return 'dark';
}

export function writeThemeMode(themeMode: ThemeMode): void {
  try {
    globalThis.localStorage?.setItem(THEME_STORAGE_KEY, themeMode);
  } catch {
    // Ignore storage access errors.
  }
}
