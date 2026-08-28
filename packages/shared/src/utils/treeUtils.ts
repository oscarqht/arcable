import { Folder, Tab, Space } from '../types/workspace';

/**
 * Checks whether a URL starts with http:// or https:// (case-insensitive)
 */
export function isValidHttpUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim().toLowerCase();
  return trimmed.startsWith('http://') || trimmed.startsWith('https://');
}

/**
 * Extracts hostname from URL for favicon and domain badges
 */
export function getDomain(urlStr: string | null | undefined): string {
  if (!urlStr || !isValidHttpUrl(urlStr)) return '';
  try {
    const url = new URL(urlStr);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Generates Google S2 Favicon URL for a domain
 */
export function getFaviconUrl(urlStr: string | null | undefined): string {
  if (!urlStr || !isValidHttpUrl(urlStr)) return '';
  try {
    const url = new URL(urlStr);
    return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=64`;
  } catch {
    return '';
  }
}

/**
 * Checks whether a hex color is dark enough to require light text (YIQ formula)
 */
export function isDarkColor(hexColor?: string | null): boolean {
  if (!hexColor || !hexColor.startsWith('#')) return false;
  const hex = hexColor.replace('#', '');
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16) || 0;
    const g = parseInt(hex[1] + hex[1], 16) || 0;
    const b = parseInt(hex[2] + hex[2], 16) || 0;
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq < 140;
  }
  const r = parseInt(hex.substring(0, 2), 16) || 0;
  const g = parseInt(hex.substring(2, 4), 16) || 0;
  const b = parseInt(hex.substring(4, 6), 16) || 0;
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq < 140;
}

/**
 * Generates background CSS properties for space cards using the space color.
 */
export function getSpaceColorStyle(
  colorHex?: string | null
): React.CSSProperties | undefined {
  if (!colorHex || typeof colorHex !== 'string' || !colorHex.trim()) {
    return undefined;
  }

  const hex = colorHex.trim();
  return {
    backgroundColor: hex,
  };
}

/**
 * Formats relative timestamp for spaces and tabs
 */
export function formatRelativeTime(timestamp: number | string | undefined): string {
  if (!timestamp) return 'Never';
  try {
    const time = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
    const now = Date.now();
    const diffMs = now - time;
    if (isNaN(diffMs)) return 'Unknown';
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 45) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay === 1) return 'Yesterday';
    if (diffDay < 7) return `${diffDay}d ago`;
    return new Date(time).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return 'Unknown';
  }
}

/**
 * Recursively extracts all valid tab URLs belonging to a space
 */
export function getAllSpaceTabUrls(
  spaceId: string,
  folders: Folder[],
  tabs: Tab[]
): string[] {
  const spaceTabs = tabs.filter(
    (t) => (t.parentSpaceId === spaceId || !t.parentSpaceId) && isValidHttpUrl(t.url)
  );
  return spaceTabs.map((t) => t.url.trim());
}

/**
 * Recursively extracts all valid tab URLs inside a folder and its subfolders
 */
export function getAllFolderTabUrls(
  folderId: string,
  allFolders: Folder[],
  allTabs: Tab[]
): string[] {
  const urls: string[] = [];

  function collectFromFolder(currentFolderId: string) {
    const directTabs = allTabs.filter(
      (t) => t.parentFolderId === currentFolderId && isValidHttpUrl(t.url)
    );
    for (const t of directTabs) {
      urls.push(t.url.trim());
    }

    const subFolders = allFolders.filter((f) => f.parentFolderId === currentFolderId);
    for (const sf of subFolders) {
      collectFromFolder(sf.id);
    }
  }

  collectFromFolder(folderId);
  return urls;
}
