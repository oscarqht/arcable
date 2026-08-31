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
 * Checks if a hostname or URL belongs to a local development domain
 * (e.g. localhost, 127.0.0.1, 0.0.0.0, [::1], *.localhost, *.local, private IP ranges)
 */
export function isLocalDevUrl(urlStr: string | null | undefined): boolean {
  if (!urlStr || !isValidHttpUrl(urlStr)) return false;
  try {
    const url = new URL(urlStr);
    const host = url.hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '[::1]' ||
      host === '::1' ||
      host.endsWith('.local') ||
      host.endsWith('.test') ||
      host.endsWith('.example') ||
      host.endsWith('.invalid') ||
      host.endsWith('.internal') ||
      /^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/.test(host) ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host)
    );
  } catch {
    return false;
  }
}

/**
 * Returns prioritized list of candidate favicon URLs for a tab URL.
 * For local dev domains (localhost, 127.0.0.1, etc), returns:
 * 1) <origin>/favicon.ico
 * 2) <origin>/favicon.png
 * 3) <origin>/favicon.svg
 * For public domains, returns faviconapi.com/<hostname>
 */
export function getFaviconCandidates(urlStr: string | null | undefined): string[] {
  if (!urlStr || !isValidHttpUrl(urlStr)) return [];
  try {
    const url = new URL(urlStr);
    if (isLocalDevUrl(urlStr)) {
      const origin = url.origin;
      return [
        `${origin}/favicon.ico`,
        `${origin}/favicon.png`,
        `${origin}/favicon.svg`,
      ];
    }
    return [`https://faviconapi.com/${url.hostname}`];
  } catch {
    return [];
  }
}

/**
 * Generates primary Favicon URL for a domain
 */
export function getFaviconUrl(urlStr: string | null | undefined): string {
  const candidates = getFaviconCandidates(urlStr);
  return candidates[0] || '';
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

/**
 * Extracts notification badge counts from browser tab titles
 * (e.g. "(3) Slack", "(1) Inbox - Gmail", "(99+) Discord", "[2] GitHub", "• (5) Messages", "Chat (4)")
 */
export function extractTabNotificationBadge(title?: string | null): string | null {
  if (!title || typeof title !== 'string') return null;
  const trimmed = title.trim();
  if (!trimmed) return null;

  // 1. Leading pattern: (3), (99+), [5], • (2), * (4), (1,234)
  const leadingMatch = trimmed.match(/^(?:[•\*\s]*)[(\[]\s*([0-9]{1,4}(?:,[0-9]{3})?\+?)\s*[)\]]/);
  if (leadingMatch) {
    const rawVal = leadingMatch[1].replace(/,/g, '');
    const num = parseInt(rawVal, 10);
    if (!isNaN(num)) {
      if (num > 99 || rawVal.includes('+')) {
        return '99+';
      }
      if (num > 0) {
        return `${num}`;
      }
    }
  }

  // 2. Trailing pattern: Chat (3), Inbox (12)
  const trailingMatch = trimmed.match(/[(\[]\s*([0-9]{1,4})\s*[)\]]\s*$/);
  if (trailingMatch) {
    const num = parseInt(trailingMatch[1], 10);
    if (!isNaN(num) && num > 0 && num < 1000) {
      if (num > 99) return '99+';
      return `${num}`;
    }
  }

  return null;
}
