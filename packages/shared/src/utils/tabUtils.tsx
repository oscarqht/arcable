import React from 'react';
import { Tab, TabUrlVariant } from '../types/workspace';
import { cleanUrl } from './format';
import { ActionDropdownItem } from '../components/workspace/ActionDropdown';
import { RefreshIcon, GlobeIcon } from '../components/Icons';

export interface ActiveBrowserTabInfo {
  url: string;
  title?: string;
  favIconUrl?: string;
}

/**
 * Computes updates for a Tab when replacing its URL with a new URL.
 * Handles both tabs without variants and tabs with variants.
 * If targetVariantId is specified, updates that variant.
 * If targetVariantId is not specified, updates the default variant (or the tab's url).
 */
export function computeTabUrlReplacement(
  tab: Tab,
  newUrl: string,
  targetVariantId?: string,
  newFavIconUrl?: string
): Partial<Omit<Tab, 'id'>> {
  const trimmedUrl = newUrl.trim();
  const variants = tab.urlVariants;

  if (variants && variants.length > 0) {
    let matchedIndex = targetVariantId
      ? variants.findIndex((v) => v.id === targetVariantId)
      : -1;

    // If targetVariantId is not provided or not matched:
    if (matchedIndex === -1) {
      if (targetVariantId) {
        matchedIndex = 0;
      } else {
        const defId = tab.defaultVariantId || variants[0]?.id;
        matchedIndex = variants.findIndex((v) => v.id === defId);
        if (matchedIndex === -1) matchedIndex = 0;
      }
    }

    const updatedVariants: TabUrlVariant[] = variants.map((v, i) =>
      i === matchedIndex
        ? {
            ...v,
            url: trimmedUrl,
            favIconUrl: newFavIconUrl || v.favIconUrl,
          }
        : v
    );

    const isDefault = tab.defaultVariantId
      ? updatedVariants[matchedIndex]?.id === tab.defaultVariantId
      : matchedIndex === 0;

    return {
      urlVariants: updatedVariants,
      defaultVariantId: tab.defaultVariantId || updatedVariants[0]?.id,
      ...(isDefault
        ? {
            url: trimmedUrl,
            ...(newFavIconUrl ? { favIconUrl: newFavIconUrl } : {}),
          }
        : {}),
    };
  }

  return {
    url: trimmedUrl,
    ...(newFavIconUrl ? { favIconUrl: newFavIconUrl } : {}),
  };
}

/**
 * Helper to get the current active browser tab's URL and info.
 * First checks onCaptureCurrentTab prop if available, then falls back to browser/chrome extension tabs API.
 */
export async function getActiveBrowserTabInfo(
  onCaptureCurrentTab?: () => Promise<ActiveBrowserTabInfo | null>
): Promise<ActiveBrowserTabInfo | null> {
  if (onCaptureCurrentTab) {
    try {
      const captured = await onCaptureCurrentTab();
      if (captured?.url) {
        return captured;
      }
    } catch (err) {
      console.warn('[tabUtils] onCaptureCurrentTab failed:', err);
    }
  }

  const globalAny: any = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {};
  const browserApi = typeof globalAny.browser !== 'undefined' ? globalAny.browser : undefined;
  const chromeApi = typeof globalAny.chrome !== 'undefined' ? globalAny.chrome : undefined;

  // Fallback 1: webextension-polyfill or browser global
  if (browserApi?.tabs?.query) {
    try {
      let tabs = await browserApi.tabs.query({ active: true, currentWindow: true });
      if (!tabs || tabs.length === 0) {
        tabs = await browserApi.tabs.query({ active: true, lastFocusedWindow: true });
      }
      const active = tabs?.[0];
      const url = active?.url || active?.pendingUrl;
      if (url) {
        return {
          url,
          title: active.title,
          favIconUrl: active.favIconUrl,
        };
      }
    } catch {}
  }

  // Fallback 2: chrome global
  if (chromeApi?.tabs?.query) {
    try {
      let tabs = await chromeApi.tabs.query({ active: true, currentWindow: true });
      if (!tabs || tabs.length === 0) {
        tabs = await chromeApi.tabs.query({ active: true, lastFocusedWindow: true });
      }
      const active = tabs?.[0];
      const url = active?.url || active?.pendingUrl;
      if (url) {
        return {
          url,
          title: active.title,
          favIconUrl: active.favIconUrl,
        };
      }
    } catch {}
  }

  return null;
}

export interface ReplaceWithCurrentUrlMenuItemOptions {
  tab: Tab;
  onReplaceWithCurrentUrl: (variantId?: string) => void | Promise<void>;
  iconSize?: number;
  childIconSize?: number;
  dividerAfter?: boolean;
}

/**
 * Builds the "Replace with current url" menu item for the saved tab item context menu.
 * If multiple url variants exist for that tab item, provides secondary menu items (children)
 * to let the user choose which variant to replace.
 */
export function buildReplaceWithCurrentUrlMenuItem({
  tab,
  onReplaceWithCurrentUrl,
  iconSize = 15,
  childIconSize = 14,
  dividerAfter,
}: ReplaceWithCurrentUrlMenuItemOptions): ActionDropdownItem {
  const validVariants = (tab.urlVariants || []).filter((v) => Boolean(v.url));
  const hasMultipleVariants = validVariants.length > 1;

  if (hasMultipleVariants) {
    return {
      id: 'replace-with-current-url',
      label: 'Replace with current url',
      icon: <RefreshIcon size={iconSize} />,
      children: validVariants.map((v, idx) => ({
        id: `replace-var-${v.id || idx}`,
        label: v.name || cleanUrl(v.url) || 'Variant',
        icon: <GlobeIcon size={childIconSize} />,
        onClick: (e?: any) => {
          e?.stopPropagation?.();
          void onReplaceWithCurrentUrl(v.id);
        },
      })),
      dividerAfter,
    };
  }

  return {
    id: 'replace-with-current-url',
    label: 'Replace with current url',
    icon: <RefreshIcon size={iconSize} />,
    onClick: (e?: any) => {
      e?.stopPropagation?.();
      void onReplaceWithCurrentUrl();
    },
    dividerAfter,
  };
}
