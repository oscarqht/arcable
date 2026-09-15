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
 * Compares URLs used to associate browser tabs with saved workspace tabs.
 *
 * A fragment and a trailing slash do not identify a different page for this purpose, but
 * protocol, host, port, pathname, and search query must all match. This prevents distinct
 * local services on the same host from being associated with each other.
 */
export function areUrlsMatching(urlA?: string, urlB?: string): boolean {
  if (!urlA || !urlB) return false;
  const strA = urlA.trim();
  const strB = urlB.trim();
  if (strA === strB) return true;

  try {
    const parsedA = new URL(strA.startsWith('http') ? strA : `https://${strA}`);
    const parsedB = new URL(strB.startsWith('http') ? strB : `https://${strB}`);

    const pathA = parsedA.pathname.replace(/\/+$/, '');
    const pathB = parsedB.pathname.replace(/\/+$/, '');
    return (
      parsedA.protocol === parsedB.protocol &&
      parsedA.hostname === parsedB.hostname &&
      parsedA.port === parsedB.port &&
      pathA === pathB &&
      parsedA.search === parsedB.search
    );
  } catch {
    const cleanA = strA.replace(/#.*$/, '').replace(/\/+$/, '');
    const cleanB = strB.replace(/#.*$/, '').replace(/\/+$/, '');
    return cleanA === cleanB;
  }
}


