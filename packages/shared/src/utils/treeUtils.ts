import { Folder, Tab, Space, TmpTab, TabUrlVariant } from '../types/workspace';
import { TabAssociationMap } from '../types/tabTracker';

/**
 * Checks whether a URL starts with http:// or https:// (case-insensitive)
 */
export function isValidHttpUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim().toLowerCase();
  return trimmed.startsWith('http://') || trimmed.startsWith('https://');
}

/**
 * Checks whether a URL represents an empty or blank/new tab
 * (e.g. '', about:blank, chrome://newtab, edge://newtab, about:newtab, about:home)
 */
export function isBlankNewTabUrl(url: string | null | undefined): boolean {
  if (!url) return true;
  const trimmed = url.trim().toLowerCase();
  return (
    trimmed === '' ||
    trimmed === 'about:blank' ||
    trimmed.startsWith('chrome://newtab') ||
    trimmed.startsWith('edge://newtab') ||
    trimmed.startsWith('about:newtab') ||
    trimmed.startsWith('about:home')
  );
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
    return [
      `https://faviconapi.com/${url.hostname}`,
      `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=64`,
      `https://icons.duckduckgo.com/ip3/${url.hostname}.ico`,
      `${url.origin}/favicon.ico`,
    ];
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
 * Checks whether a color or gradient is dark enough to require light text (YIQ formula)
 */
export function isDarkColor(colorStr?: string | null): boolean {
  if (!colorStr || typeof colorStr !== 'string') return false;
  const trimmed = colorStr.trim();
  let hex = trimmed;
  if (trimmed.includes('gradient')) {
    const match = trimmed.match(/#(?:[0-9a-fA-F]{3}){1,2}\b/);
    if (match) {
      hex = match[0];
    } else {
      const rgbMatch = trimmed.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (rgbMatch) {
        const r = parseInt(rgbMatch[1], 10) || 0;
        const g = parseInt(rgbMatch[2], 10) || 0;
        const b = parseInt(rgbMatch[3], 10) || 0;
        const yiq = (r * 299 + g * 587 + b * 114) / 1000;
        return yiq < 140;
      }
      return false;
    }
  }
  const directRgbMatch = hex.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (directRgbMatch) {
    const r = parseInt(directRgbMatch[1], 10) || 0;
    const g = parseInt(directRgbMatch[2], 10) || 0;
    const b = parseInt(directRgbMatch[3], 10) || 0;
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq < 140;
  }
  if (!hex.startsWith('#')) return false;
  const rawHex = hex.replace('#', '');
  if (rawHex.length === 3) {
    const r = parseInt(rawHex[0] + rawHex[0], 16) || 0;
    const g = parseInt(rawHex[1] + rawHex[1], 16) || 0;
    const b = parseInt(rawHex[2] + rawHex[2], 16) || 0;
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq < 140;
  }
  const r = parseInt(rawHex.substring(0, 2), 16) || 0;
  const g = parseInt(rawHex.substring(2, 4), 16) || 0;
  const b = parseInt(rawHex.substring(4, 6), 16) || 0;
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq < 140;
}

/**
 * Generates background CSS properties for space cards using the space color or gradient.
 */
export function getSpaceColorStyle(
  colorStr?: string | null
): React.CSSProperties | undefined {
  if (!colorStr || typeof colorStr !== 'string' || !colorStr.trim()) {
    return undefined;
  }

  const bg = colorStr.trim();
  return {
    background: bg,
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
 * Recursively extracts all folder IDs belonging to a space (including nested child folders).
 */
export function getAllSpaceFolderIds(
  spaceId: string,
  allFolders: Folder[]
): Set<string> {
  const result = new Set<string>();

  for (const f of allFolders) {
    if (f.parentSpaceId === spaceId) {
      result.add(f.id);
    }
  }

  let added = true;
  while (added) {
    added = false;
    for (const f of allFolders) {
      if (!result.has(f.id) && f.parentFolderId && result.has(f.parentFolderId)) {
        result.add(f.id);
        added = true;
      }
    }
  }

  return result;
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

/**
 * Computes the full path for a folder by traversing up its parentFolderId chain.
 * E.g., if "foo" has child "bar", and "bar" has child "baz", getFolderPath(baz.id, allFolders) returns "foo/bar/baz".
 */
export function getFolderPath(
  folderId: string,
  allFolders: Folder[],
  separator: string = '/'
): string {
  const folderMap = new Map<string, Folder>();
  for (const f of allFolders) {
    folderMap.set(f.id, f);
  }

  const pathParts: string[] = [];
  const visited = new Set<string>();
  let currentId: string | undefined = folderId;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const folder = folderMap.get(currentId);
    if (!folder) break;
    pathParts.unshift(folder.name);
    currentId = folder.parentFolderId;
  }

  return pathParts.join(separator);
}

/**
 * Recursively orders folders in tree hierarchy (parent followed by children) for dropdown presentations.
 */
export function getTreeOrderedFolders(folders: Folder[]): Folder[] {
  const folderMap = new Map<string, Folder>();
  const childrenMap = new Map<string, Folder[]>();
  const rootFolders: Folder[] = [];

  for (const f of folders) {
    folderMap.set(f.id, f);
  }

  const sorted = [...folders].sort((a, b) => {
    const orderA = a.order !== undefined ? a.order : a.createdAt || 0;
    const orderB = b.order !== undefined ? b.order : b.createdAt || 0;
    if (orderA !== orderB) return orderA - orderB;
    return a.id.localeCompare(b.id);
  });

  for (const f of sorted) {
    if (f.parentFolderId && folderMap.has(f.parentFolderId)) {
      const list = childrenMap.get(f.parentFolderId) || [];
      list.push(f);
      childrenMap.set(f.parentFolderId, list);
    } else {
      rootFolders.push(f);
    }
  }

  const result: Folder[] = [];
  function traverse(folder: Folder) {
    result.push(folder);
    const children = childrenMap.get(folder.id) || [];
    for (const child of children) {
      traverse(child);
    }
  }

  for (const root of rootFolders) {
    traverse(root);
  }

  return result;
}

/**
 * Checks whether a given tab is a direct child or a descendant of a specified folder.
 */
export function isTabInFolder(
  tabId: string,
  folderId: string,
  allFolders: Folder[],
  allTabs: Tab[]
): boolean {
  const targetTab = allTabs.find((t) => t.id === tabId);
  if (!targetTab || !targetTab.parentFolderId) return false;

  const folderMap = new Map<string, Folder>();
  for (const f of allFolders) {
    folderMap.set(f.id, f);
  }

  const visited = new Set<string>();
  let currentFolderId: string | undefined = targetTab.parentFolderId;

  while (currentFolderId && !visited.has(currentFolderId)) {
    if (currentFolderId === folderId) {
      return true;
    }
    visited.add(currentFolderId);
    const folder = folderMap.get(currentFolderId);
    currentFolderId = folder ? folder.parentFolderId : undefined;
  }

  return false;
}

/**
 * Checks whether any tab in a given collection of tab IDs belongs to a specified folder (direct child or descendant).
 */
export function hasAnyTabInFolder(
  tabIds: Iterable<string>,
  folderId: string,
  allFolders: Folder[],
  allTabs: Tab[]
): boolean {
  for (const tabId of tabIds) {
    if (isTabInFolder(tabId, folderId, allFolders, allTabs)) {
      return true;
    }
  }
  return false;
}

/**
 * Finds the immediate direct child item (either a subfolder or a direct tab) of folderId
 * that is or contains the targetTabId.
 */
export function findDirectChildForTab(
  targetTabId: string,
  folderId: string,
  allFolders: Folder[],
  allTabs: Tab[]
): { type: 'folder' | 'tab'; id: string } | null {
  const targetTab = allTabs.find((t) => t.id === targetTabId);
  if (!targetTab || !targetTab.parentFolderId) return null;

  if (targetTab.parentFolderId === folderId) {
    return { type: 'tab', id: targetTab.id };
  }

  const folderMap = new Map<string, Folder>();
  for (const f of allFolders) {
    folderMap.set(f.id, f);
  }

  const visited = new Set<string>();
  let currentFolder = folderMap.get(targetTab.parentFolderId);

  while (currentFolder && !visited.has(currentFolder.id)) {
    visited.add(currentFolder.id);
    if (currentFolder.parentFolderId === folderId) {
      return { type: 'folder', id: currentFolder.id };
    }
    currentFolder = currentFolder.parentFolderId
      ? folderMap.get(currentFolder.parentFolderId)
      : undefined;
  }

  return null;
}

/**
 * Recursively retrieves all descendant folder IDs for a given folder ID.
 */
export function getDescendantFolderIds(
  folderId: string,
  allFolders: Folder[]
): Set<string> {
  const descendants = new Set<string>();
  let added = true;
  while (added) {
    added = false;
    for (const f of allFolders) {
      if (
        f.parentFolderId &&
        (f.parentFolderId === folderId || descendants.has(f.parentFolderId)) &&
        !descendants.has(f.id)
      ) {
        descendants.add(f.id);
        added = true;
      }
    }
  }
  return descendants;
}

/**
 * Calculates the number of currently opened tabs for each space.
 * Includes opened space tabs and temporary tabs (tmp tabs) belonging to each space.
 * Excludes global favourites.
 */
export function getSpaceOpenTabCounts(
  spaces: Space[],
  folders: Folder[],
  tabs: Tab[],
  tabAssociations?: TabAssociationMap,
  highlightedTabId?: string | null,
  tmpTabs?: TmpTab[]
): Record<string, number> {
  if (!tabAssociations && (!tmpTabs || tmpTabs.length === 0)) return {};

  const counts: Record<string, number> = {};
  const defaultSpaceId = spaces[0]?.id;

  for (const space of spaces) {
    counts[space.id] = 0;
  }

  if (tabAssociations) {
    const openTabIds = new Set<string>();
    for (const id of Object.keys(tabAssociations)) {
      if (tabAssociations[id]) {
        openTabIds.add(id);
      }
    }
    if (highlightedTabId && !highlightedTabId.startsWith('tmp_')) {
      openTabIds.add(highlightedTabId);
    }

    for (const space of spaces) {
      const spaceFolderIds = getAllSpaceFolderIds(space.id, folders);
      let count = 0;

      for (const tab of tabs) {
        // Don't count favorite items
        if (tab.favourite) continue;
        // Tab must be opened
        if (!openTabIds.has(tab.id)) continue;

        const belongsToSpace =
          tab.parentSpaceId === space.id ||
          (Boolean(tab.parentFolderId) && spaceFolderIds.has(tab.parentFolderId!)) ||
          (!tab.parentSpaceId && !tab.parentFolderId && defaultSpaceId === space.id);

        if (belongsToSpace) {
          count++;
        }
      }

      counts[space.id] = count;
    }
  }

  if (Array.isArray(tmpTabs)) {
    for (const tmp of tmpTabs) {
      const targetSpaceId = tmp.spaceId || defaultSpaceId;
      if (targetSpaceId && counts[targetSpaceId] !== undefined) {
        counts[targetSpaceId]++;
      }
    }
  }

  return counts;
}

/**
 * Resolves the effective title for a tab item.
 * Evaluates customTitle first, then first variant name if variants exist,
 * and finally falls back to domain or clean URL.
 */
export function getTabEffectiveTitle(tab: {
  customTitle?: string;
  url?: string;
  urlVariants?: TabUrlVariant[];
}): string {
  const custom = tab.customTitle?.trim();
  if (custom) return custom;

  if (tab.urlVariants && tab.urlVariants.length > 0) {
    const firstVarName = tab.urlVariants[0]?.name?.trim();
    if (firstVarName) return firstVarName;
  }

  if (tab.url) {
    const domain = getDomain(tab.url);
    if (domain) return domain;
    return tab.url.trim();
  }

  return 'Untitled Tab';
}

/**
 * Returns all sibling tabs within the specified scope (favourite shelf, folder, or space root),
 * optionally excluding a tab by ID (e.g. the tab currently being edited).
 */
export function getSiblingTabs(
  tabs: Tab[],
  scope: {
    favourite?: boolean;
    parentSpaceId?: string;
    parentFolderId?: string;
  },
  excludeTabId?: string
): Tab[] {
  return tabs.filter((t) => {
    if (excludeTabId && t.id === excludeTabId) return false;
    if (scope.favourite) {
      return Boolean(t.favourite);
    }
    if (t.favourite) return false;

    if (scope.parentFolderId) {
      return (
        t.parentFolderId === scope.parentFolderId &&
        (!scope.parentSpaceId || !t.parentSpaceId || t.parentSpaceId === scope.parentSpaceId)
      );
    }

    return !t.parentFolderId && t.parentSpaceId === scope.parentSpaceId;
  });
}

/**
 * Checks if a candidate title matches the effective title of any sibling tab in the given list (case-insensitively).
 */
export function findTabTitleConflict(
  candidateTitle: string,
  siblingTabs: Tab[]
): Tab | undefined {
  const norm = candidateTitle.trim().toLowerCase();
  if (!norm) return undefined;
  return siblingTabs.find((t) => getTabEffectiveTitle(t).trim().toLowerCase() === norm);
}

/**
 * Generates a unique tab title within a sibling list.
 * If candidateTitle already exists case-insensitively, appends/increments " (2)", " (3)", etc.
 */
export function getUniqueTabTitle(
  candidateTitle: string,
  siblingTabs: Tab[]
): string {
  const trimmed = candidateTitle.trim() || 'Untitled Tab';
  if (!findTabTitleConflict(trimmed, siblingTabs)) {
    return trimmed;
  }

  const existingTitles = new Set(
    siblingTabs.map((t) => getTabEffectiveTitle(t).trim().toLowerCase())
  );

  const match = trimmed.match(/^(.*?)\s*\((\d+)\)$/);
  const root = match && match[1]?.trim() ? match[1].trim() : trimmed;
  let counter = match && match[2] ? parseInt(match[2], 10) + 1 : 2;

  while (existingTitles.has(`${root} (${counter})`.toLowerCase())) {
    counter++;
  }

  return `${root} (${counter})`;
}


