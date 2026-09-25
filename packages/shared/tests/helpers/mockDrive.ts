/** In-memory Google Drive v3 used by sync tests. Only the endpoints Arcable calls are modelled. */
export interface MockDriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  appProperties?: Record<string, string>;
  content?: string;
  version: number;
  modifiedTime: string;
  trashed?: boolean;
}

export interface MockDriveCall {
  method: string;
  url: string;
}

export interface MockDrive {
  files: Map<string, MockDriveFile>;
  calls: MockDriveCall[];
  /** Runs before a response is produced; return a Response to override it. */
  intercept?: (method: string, url: URL) => Response | undefined;
  handle(input: RequestInfo | URL, init?: RequestInit): Promise<Response> | undefined;
  reset(): void;
  byRole(role: string): MockDriveFile[];
  write(fileId: string, content: string): void;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function toMetadata(file: MockDriveFile) {
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    parents: file.parents,
    appProperties: file.appProperties,
    version: String(file.version),
    modifiedTime: file.modifiedTime,
    webViewLink: `https://drive.google.com/file/d/${file.id}`,
  };
}

function matchesQuery(file: MockDriveFile, query: string): boolean {
  if (file.trashed) return false;
  const appProperty = /appProperties has \{ key='([^']+)' and value='([^']+)' \}/.exec(query);
  if (appProperty && file.appProperties?.[appProperty[1]] !== appProperty[2]) return false;
  const parent = /'([^']+)' in parents/.exec(query);
  if (parent && !file.parents?.includes(parent[1])) return false;
  const mime = /mimeType='([^']+)'/.exec(query);
  if (mime && file.mimeType !== mime[1]) return false;
  return true;
}

function parseMultipart(body: string, contentType: string): { metadata: any; content: string } {
  const boundary = /boundary=([^;]+)/.exec(contentType)?.[1] || '';
  const parts = body
    .split(`--${boundary}`)
    .map((part) => part.trim())
    .filter((part) => part && part !== '--');
  const [metaPart, contentPart] = parts.map((part) => part.slice(part.indexOf('\r\n\r\n') + 4));
  return { metadata: JSON.parse(metaPart), content: contentPart };
}

export function createMockDrive(): MockDrive {
  let nextId = 1;
  let clock = Date.parse('2026-09-25T00:00:00Z');
  const tick = () => new Date((clock += 1000)).toISOString();

  const drive: MockDrive = {
    files: new Map(),
    calls: [],
    reset() {
      drive.files.clear();
      drive.calls.length = 0;
      drive.intercept = undefined;
    },
    byRole(role) {
      return [...drive.files.values()].filter((file) => file.appProperties?.arcable === role && !file.trashed);
    },
    write(fileId, content) {
      const file = drive.files.get(fileId)!;
      file.content = content;
      file.version += 1;
      file.modifiedTime = tick();
    },
    handle(input, init) {
      const url = new URL(String(input));
      if (url.hostname !== 'www.googleapis.com') return undefined;
      const method = (init?.method || 'GET').toUpperCase();
      drive.calls.push({ method, url: url.toString() });
      const override = drive.intercept?.(method, url);
      if (override) return Promise.resolve(override);

      const isUpload = url.pathname.startsWith('/upload/drive/v3/files');
      const idMatch = /\/files\/([^/]+)$/.exec(url.pathname);
      const fileId = idMatch ? decodeURIComponent(idMatch[1]) : undefined;
      const body = typeof init?.body === 'string' ? init.body : '';

      if (method === 'GET' && !fileId) {
        const q = url.searchParams.get('q') || '';
        const files = [...drive.files.values()]
          .filter((file) => matchesQuery(file, q))
          .sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime))
          .map(toMetadata);
        return Promise.resolve(json({ files }));
      }
      if (fileId && !drive.files.has(fileId)) {
        return Promise.resolve(json({ error: { code: 404, message: 'File not found' } }, 404));
      }
      const file = fileId ? drive.files.get(fileId)! : undefined;

      if (method === 'GET' && file) {
        if (url.searchParams.get('alt') === 'media') {
          return Promise.resolve(new Response(file.content || '', { status: 200 }));
        }
        return Promise.resolve(json(toMetadata(file)));
      }
      if (method === 'POST' && !fileId) {
        const headers = new Headers(init?.headers);
        const { metadata, content } = isUpload
          ? parseMultipart(body, headers.get('Content-Type') || '')
          : { metadata: JSON.parse(body), content: undefined };
        const created: MockDriveFile = {
          id: `file_${nextId++}`,
          name: metadata.name,
          mimeType: metadata.mimeType,
          parents: metadata.parents,
          appProperties: metadata.appProperties,
          content,
          version: 1,
          modifiedTime: tick(),
        };
        drive.files.set(created.id, created);
        return Promise.resolve(json(toMetadata(created)));
      }
      if (method === 'PATCH' && file && isUpload) {
        drive.write(file.id, body);
        return Promise.resolve(json(toMetadata(file)));
      }
      if (method === 'PATCH' && file) {
        const patch = JSON.parse(body);
        if (patch.name) file.name = patch.name;
        if (patch.appProperties) file.appProperties = { ...file.appProperties, ...patch.appProperties };
        file.version += 1;
        file.modifiedTime = tick();
        return Promise.resolve(json(toMetadata(file)));
      }
      if (method === 'DELETE' && file) {
        drive.files.delete(file.id);
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return Promise.resolve(json({ error: { message: `Unhandled ${method} ${url}` } }, 400));
    },
  };
  return drive;
}
