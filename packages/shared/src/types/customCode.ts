export interface CustomCodeRule {
  id: string;
  pattern: string;
  css: string;
  js: string;
  disabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface RunCodeRule {
  id: string;
  title: string;
  patterns: string[];
  code: string;
  disabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface RunCodeBackgroundFetchMessage {
  type: string;
  url: string;
  init?: {
    method?: string;
    headers?: Array<[string, string]>;
    body?: { kind: 'text' | 'bytes'; value: string | number[] } | null;
    credentials?: RequestCredentials;
    cache?: RequestCache;
    redirect?: RequestRedirect;
    referrer?: string;
    referrerPolicy?: ReferrerPolicy | '';
    integrity?: string;
    keepalive?: boolean;
  };
}

export interface SerializedFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  url: string;
  redirected: boolean;
  headers: Record<string, string>;
  bodyText: string;
}
