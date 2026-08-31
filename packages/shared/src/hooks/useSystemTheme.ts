'use client';

import { useSyncExternalStore, useEffect } from 'react';

/**
 * Singleton state and subscriber management for system/user color scheme preference.
 * Guarantees zero race conditions, instantaneous synchronization across WebApp and WebExtension pages (Sidepanel, Popup, Options).
 */
const subscribers = new Set<() => void>();

function syncDOMClasses(isDark: boolean) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (isDark) {
    root.classList.add('dark');
    root.classList.remove('light');
    root.setAttribute('data-theme', 'dark');
    root.style.colorScheme = 'dark';
    if (document.body) {
      document.body.classList.add('dark');
      document.body.classList.remove('light');
      document.body.setAttribute('data-theme', 'dark');
      document.body.style.colorScheme = 'dark';
    }
  } else {
    root.classList.remove('dark');
    root.classList.add('light');
    root.setAttribute('data-theme', 'light');
    root.style.colorScheme = 'light';
    if (document.body) {
      document.body.classList.remove('dark');
      document.body.classList.add('light');
      document.body.setAttribute('data-theme', 'light');
      document.body.style.colorScheme = 'light';
    }
  }
}

function getSystemDarkPreference(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

function getUserThemePreference(): 'system' | 'light' | 'dark' {
  if (typeof window === 'undefined') return 'system';
  try {
    const raw = localStorage.getItem('arcable_config');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system') {
        return parsed.theme;
      }
    }
    const directTheme = localStorage.getItem('arcable_theme');
    if (directTheme === 'light' || directTheme === 'dark' || directTheme === 'system') {
      return directTheme;
    }
  } catch {}
  return 'system';
}

function computeIsDark(): boolean {
  const userPref = getUserThemePreference();
  if (userPref === 'dark') return true;
  if (userPref === 'light') return false;
  return getSystemDarkPreference();
}

let currentIsDark = typeof window !== 'undefined' ? computeIsDark() : false;
let isInitialized = false;

// Immediate initial DOM sync on module load
if (typeof window !== 'undefined') {
  syncDOMClasses(currentIsDark);
}

function notifySubscribers() {
  const nextIsDark = computeIsDark();
  currentIsDark = nextIsDark;
  syncDOMClasses(nextIsDark);
  subscribers.forEach((callback) => {
    try {
      callback();
    } catch (err) {
      console.error('Error in theme listener callback:', err);
    }
  });
}

function initGlobalListeners() {
  if (isInitialized || typeof window === 'undefined') return;
  isInitialized = true;

  // 1. matchMedia change listener (with compatibility for both addEventListener and addListener)
  if (window.matchMedia) {
    try {
      const darkMq = window.matchMedia('(prefers-color-scheme: dark)');
      const handleMqChange = () => {
        notifySubscribers();
      };

      if (darkMq.addEventListener) {
        darkMq.addEventListener('change', handleMqChange);
      } else if ('addListener' in darkMq) {
        (darkMq as any).addListener(handleMqChange);
      }
    } catch (e) {
      console.warn('[useSystemTheme] Could not bind matchMedia listener:', e);
    }
  }

  // 2. Storage event listener for cross-window / localStorage changes
  try {
    window.addEventListener('storage', (e) => {
      if (e.key === 'arcable_config' || e.key === 'arcable_theme') {
        notifySubscribers();
      }
    });
  } catch {}

  // 3. WebExtension storage change listener (if in extension environment)
  try {
    const extChrome = typeof window !== 'undefined' && typeof (window as any).chrome !== 'undefined' ? (window as any).chrome : undefined;
    const extBrowser = typeof window !== 'undefined' && typeof (window as any).browser !== 'undefined' ? (window as any).browser : undefined;
    const storageApi = extChrome?.storage || extBrowser?.storage;

    if (storageApi && storageApi.onChanged) {
      storageApi.onChanged.addListener((changes: Record<string, any>, area: string) => {
        if (area === 'local' && (changes.arcable_config || changes.arcable_theme)) {
          if (changes.arcable_config?.newValue?.theme) {
            try {
              localStorage.setItem('arcable_theme', changes.arcable_config.newValue.theme);
            } catch {}
          }
          notifySubscribers();
        }
      });
    }
  } catch {}
}

function getSnapshot(): boolean {
  return currentIsDark;
}

function getServerSnapshot(): boolean {
  return false;
}

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  initGlobalListeners();
  subscribers.add(callback);

  // Sync snapshot state on subscribe
  const latest = computeIsDark();
  if (latest !== currentIsDark) {
    currentIsDark = latest;
    syncDOMClasses(latest);
  }

  return () => {
    subscribers.delete(callback);
  };
}

/**
 * Hook to automatically track the operating system's light/dark color scheme or user preference.
 * Updates dynamically in real time whenever the user's OS theme or settings change.
 */
export function useSystemTheme(): { isDark: boolean; theme: 'dark' | 'light' } {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    syncDOMClasses(isDark);
  }, [isDark]);

  return {
    isDark,
    theme: isDark ? 'dark' : 'light',
  };
}


