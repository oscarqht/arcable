'use client';

import { useSyncExternalStore, useEffect } from 'react';

/**
 * Singleton state and subscriber management for system color scheme preference.
 * Guarantees zero race conditions, instantaneous synchronization, and SSR safety.
 */
let mediaQueryList: MediaQueryList | null = null;
const subscribers = new Set<() => void>();

function syncDOMClasses(isDark: boolean) {
  if (typeof document === 'undefined') return;
  if (isDark) {
    document.documentElement.classList.add('dark');
    document.documentElement.setAttribute('data-theme', 'dark');
    if (document.body) {
      document.body.classList.add('dark');
    }
  } else {
    document.documentElement.classList.remove('dark');
    document.documentElement.setAttribute('data-theme', 'light');
    if (document.body) {
      document.body.classList.remove('dark');
    }
  }
}

function getMediaQueryList(): MediaQueryList | null {
  if (typeof window === 'undefined' || !window.matchMedia) return null;
  if (!mediaQueryList) {
    try {
      mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      mediaQueryList = null;
    }
  }
  return mediaQueryList;
}

function getSnapshot(): boolean {
  const mq = getMediaQueryList();
  return mq ? mq.matches : false;
}

function getServerSnapshot(): boolean {
  return false;
}

function handleMediaChange() {
  const isDark = getSnapshot();
  syncDOMClasses(isDark);
  subscribers.forEach((callback) => {
    try {
      callback();
    } catch (err) {
      console.error('Error in theme listener callback:', err);
    }
  });
}

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  subscribers.add(callback);

  const mq = getMediaQueryList();
  if (mq && subscribers.size === 1) {
    // Initial sync
    syncDOMClasses(mq.matches);
    if (mq.addEventListener) {
      mq.addEventListener('change', handleMediaChange);
    } else if ('addListener' in mq) {
      (mq as any).addListener(handleMediaChange);
    }
  }

  return () => {
    subscribers.delete(callback);
    if (subscribers.size === 0 && mq) {
      if (mq.removeEventListener) {
        mq.removeEventListener('change', handleMediaChange);
      } else if ('removeListener' in mq) {
        (mq as any).removeListener(handleMediaChange);
      }
    }
  };
}

/**
 * Hook to automatically track the operating system's light/dark color scheme.
 * Updates dynamically in real time whenever the user's OS theme changes.
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

