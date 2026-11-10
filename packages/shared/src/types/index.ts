import type { RaindropRequestFailureDetails } from "./raindrop";

export type PlatformType = "web" | "chrome-extension" | "firefox-extension";

export interface ArcableConfig {
  theme: "light" | "dark" | "system";
  syncEnabled: boolean;
  autoCapture: boolean;
  apiEndpoint?: string;
}

export type ExtensionMessageType =
  | "ARCABLE_SYNC_RULES"
  | "PING"
  | "PONG"
  | "RAINDROP_GET_AUTH_STATE"
  | "RAINDROP_LOGIN_TOKEN"
  | "RAINDROP_START_OAUTH"
  | "RAINDROP_LOGOUT"
  | "INJECT_CUSTOM_JS"
  | "RUN_CODE_IN_PAGE_EXECUTE"
  | "CHECK_USER_SCRIPTS_AVAILABLE"
  | "OPEN_EXTENSION_DETAILS_PAGE"
  | "GET_OS_THEME"
  | "TAKE_SCREENSHOT"
  | "CAPTURE_FULL_PAGE";

export interface ExtensionMessage<T = unknown> {
  type: ExtensionMessageType | string;
  payload?: T;
  source?: PlatformType;
}

export interface ExtensionResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errorDetails?: RaindropRequestFailureDetails;
  pending?: boolean;
  message?: string;
}

export * from "./raindrop";
export * from "./customCode";
export * from "./sidePanels";
export * from "./rules";
