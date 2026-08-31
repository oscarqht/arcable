/**
 * Formats a timestamp into a human-readable date string.
 */
export function formatDate(timestamp: number | Date): string {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * Truncates text with ellipsis if it exceeds maxLength.
 */
export function truncate(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '…';
}

/**
 * Normalizes and cleans a URL for display.
 */
export function cleanUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname + (parsed.pathname === '/' ? '' : parsed.pathname);
  } catch {
    return url;
  }
}

/**
 * Generates a lightweight unique ID.
 */
export function generateId(prefix = 'item'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
}

/**
 * Normalizes a URL for comparison (removes hash, trailing slashes, standardizes casing).
 */
export function normalizeUrl(url?: string): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();
    const hostname = parsed.hostname.toLowerCase();
    const port = (parsed.port === '80' && protocol === 'http:') || (parsed.port === '443' && protocol === 'https:') ? '' : parsed.port ? `:${parsed.port}` : '';
    
    // Normalize path by stripping trailing slash unless path is just empty or '/'
    let pathname = parsed.pathname || '';
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    } else if (pathname === '/') {
      pathname = '';
    }

    const search = parsed.search || '';
    return `${protocol}//${hostname}${port}${pathname}${search}`;
  } catch {
    // Fallback for non-standard or relative URLs
    return trimmed.replace(/#.*$/, '').replace(/\/+$/, '');
  }
}

/**
 * Robust URL equality matcher that handles normalized URLs, Trello card/board slugs,
 * trailing slashes, www/non-www prefixes, query params, hashes, and protocol/host variations.
 */
export function areUrlsMatching(urlA?: string, urlB?: string): boolean {
  if (!urlA || !urlB) return false;
  const strA = urlA.trim();
  const strB = urlB.trim();
  if (strA === strB) return true;

  try {
    const parsedA = new URL(strA.startsWith('http') ? strA : `https://${strA}`);
    const parsedB = new URL(strB.startsWith('http') ? strB : `https://${strB}`);

    const hostA = parsedA.hostname.toLowerCase().replace(/^www\./, '');
    const hostB = parsedB.hostname.toLowerCase().replace(/^www\./, '');

    if (hostA !== hostB) {
      return false;
    }

    // Trello cards matching: /c/{shortId} or /c/{shortId}/{slug}
    // Trello boards matching: /b/{shortId} or /b/{shortId}/{slug}
    if (hostA.includes('trello.com')) {
      const segsA = parsedA.pathname.split('/').filter(Boolean);
      const segsB = parsedB.pathname.split('/').filter(Boolean);
      if (segsA.length >= 2 && segsB.length >= 2) {
        if ((segsA[0] === 'c' || segsA[0] === 'b') && segsA[0] === segsB[0]) {
          if (segsA[1].toLowerCase() === segsB[1].toLowerCase()) {
            return true;
          }
        }
      }
    }

    // Path match without trailing slash
    const pathA = parsedA.pathname.replace(/\/+$/, '').toLowerCase();
    const pathB = parsedB.pathname.replace(/\/+$/, '').toLowerCase();
    if (pathA === pathB) {
      return true;
    }
  } catch {
    const cleanA = strA.replace(/#.*$/, '').replace(/\?.*$/, '').replace(/\/+$/, '').toLowerCase();
    const cleanB = strB.replace(/#.*$/, '').replace(/\?.*$/, '').replace(/\/+$/, '').toLowerCase();
    return cleanA === cleanB;
  }

  return false;
}



