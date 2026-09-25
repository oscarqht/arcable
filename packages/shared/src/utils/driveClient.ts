import type { DriveFileMetadata } from '../types/google';

export const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
export const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
export const DRIVE_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
export const DRIVE_FILE_FIELDS = 'id,name,mimeType,version,modifiedTime,size,parents,appProperties,webViewLink';

const MAX_RETRIES = 4;
const RETRYABLE_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'backendError', 'internalError']);
let retryBaseDelayMs = 500;

/** Test hook: shortens retry backoff. */
export function setDriveRetryBaseDelay(ms: number): void {
  retryBaseDelayMs = Math.max(0, ms);
}

export class DriveApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly reason?: string
  ) {
    super(message);
    this.name = 'DriveApiError';
  }
}

export function isDriveAuthError(error: unknown): boolean {
  return error instanceof DriveApiError && error.status === 401;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readError(res: Response): Promise<DriveApiError> {
  let reason: string | undefined;
  let message = `Google Drive request failed (${res.status}).`;
  try {
    const body = await res.json();
    reason = body?.error?.errors?.[0]?.reason || body?.error?.status;
    if (body?.error?.message) message = `Google Drive: ${body.error.message}`;
  } catch {}
  return new DriveApiError(message, res.status, reason);
}

/**
 * Issues a Drive request, retrying rate limits, 5xx responses and (for
 * idempotent reads) transport failures with exponential backoff.
 */
async function driveRequest(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  if (!token) throw new DriveApiError('Missing Google access token.', 401);
  const method = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);

  for (let attempt = 0; ; attempt += 1) {
    let res: Response;
    try {
      res = await fetch(url, { ...init, headers, cache: 'no-store' });
    } catch (error) {
      if (method !== 'GET' || attempt >= MAX_RETRIES) throw error;
      await sleep(retryBaseDelayMs * 2 ** attempt);
      continue;
    }
    if (res.ok) return res;

    const error = await readError(res);
    const retryable =
      res.status === 429 ||
      res.status >= 500 ||
      (res.status === 403 && Boolean(error.reason && RETRYABLE_REASONS.has(error.reason)));
    if (!retryable || attempt >= MAX_RETRIES) throw error;
    await sleep(retryBaseDelayMs * 2 ** attempt);
  }
}

function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export async function findDriveFilesByAppProperty(
  token: string,
  key: string,
  value: string,
  options?: { parentId?: string; mimeType?: string }
): Promise<DriveFileMetadata[]> {
  const clauses = [
    `appProperties has { key='${escapeQueryValue(key)}' and value='${escapeQueryValue(value)}' }`,
    'trashed=false',
  ];
  if (options?.parentId) clauses.push(`'${escapeQueryValue(options.parentId)}' in parents`);
  if (options?.mimeType) clauses.push(`mimeType='${escapeQueryValue(options.mimeType)}'`);
  return listDriveFiles(token, clauses.join(' and '), 'modifiedTime desc');
}

export async function listDriveFiles(token: string, query: string, orderBy?: string): Promise<DriveFileMetadata[]> {
  const files: DriveFileMetadata[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${DRIVE_API_BASE}/files`);
    url.searchParams.set('q', query);
    url.searchParams.set('spaces', 'drive');
    url.searchParams.set('pageSize', '100');
    url.searchParams.set('fields', `nextPageToken,files(${DRIVE_FILE_FIELDS})`);
    if (orderBy) url.searchParams.set('orderBy', orderBy);
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await driveRequest(token, url.toString());
    const body = await res.json();
    files.push(...((body?.files as DriveFileMetadata[]) || []));
    pageToken = body?.nextPageToken || undefined;
  } while (pageToken);
  return files;
}

export async function getDriveFileMetadata(token: string, fileId: string): Promise<DriveFileMetadata> {
  const res = await driveRequest(
    token,
    `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(DRIVE_FILE_FIELDS)}`
  );
  return res.json();
}

export async function downloadDriveFileText(token: string, fileId: string): Promise<string> {
  const res = await driveRequest(token, `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`);
  return res.text();
}

export async function createDriveFolder(
  token: string,
  name: string,
  options?: { parentId?: string; appProperties?: Record<string, string> }
): Promise<DriveFileMetadata> {
  const res = await driveRequest(token, `${DRIVE_API_BASE}/files?fields=${encodeURIComponent(DRIVE_FILE_FIELDS)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: DRIVE_FOLDER_MIME_TYPE,
      ...(options?.parentId ? { parents: [options.parentId] } : {}),
      ...(options?.appProperties ? { appProperties: options.appProperties } : {}),
    }),
  });
  return res.json();
}

export async function createDriveFile(
  token: string,
  options: {
    name: string;
    content: string;
    parentId?: string;
    mimeType?: string;
    appProperties?: Record<string, string>;
  }
): Promise<DriveFileMetadata> {
  const boundary = `arcable-${Math.random().toString(36).slice(2)}`;
  const mimeType = options.mimeType || 'application/json';
  const metadata = {
    name: options.name,
    mimeType,
    ...(options.parentId ? { parents: [options.parentId] } : {}),
    ...(options.appProperties ? { appProperties: options.appProperties } : {}),
  };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: ${mimeType}; charset=UTF-8\r\n\r\n${options.content}\r\n` +
    `--${boundary}--`;
  const res = await driveRequest(
    token,
    `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=${encodeURIComponent(DRIVE_FILE_FIELDS)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    }
  );
  return res.json();
}

export async function updateDriveFileContent(
  token: string,
  fileId: string,
  content: string,
  mimeType: string = 'application/json'
): Promise<DriveFileMetadata> {
  const res = await driveRequest(
    token,
    `${DRIVE_UPLOAD_BASE}/files/${encodeURIComponent(fileId)}?uploadType=media&fields=${encodeURIComponent(DRIVE_FILE_FIELDS)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': `${mimeType}; charset=UTF-8` },
      body: content,
    }
  );
  return res.json();
}

export async function updateDriveFileMetadata(
  token: string,
  fileId: string,
  metadata: { name?: string; appProperties?: Record<string, string | null> }
): Promise<DriveFileMetadata> {
  const res = await driveRequest(
    token,
    `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(DRIVE_FILE_FIELDS)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata),
    }
  );
  return res.json();
}

export async function deleteDriveFile(token: string, fileId: string): Promise<void> {
  await driveRequest(token, `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
}
