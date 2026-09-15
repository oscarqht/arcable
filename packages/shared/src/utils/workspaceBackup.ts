import { ArcableWorkspaceData, Space } from '../types/workspace';
import { getStoredDeviceName, detectDeviceType } from './syncEngine';

export interface WorkspaceBackupFile {
  arcableBackupVersion: number;
  exportedAt: string;
  app: string;
  deviceName?: string;
  deviceType?: string;
  workspace: ArcableWorkspaceData;
}

export interface WorkspaceBackupSummary {
  fileName?: string;
  fileSize?: number;
  exportedAt?: string;
  deviceName?: string;
  spacesCount: number;
  foldersCount: number;
  tabsCount: number;
}

export interface ParseBackupResult {
  success: boolean;
  data?: ArcableWorkspaceData;
  summary?: WorkspaceBackupSummary;
  error?: string;
}

/**
 * Format a zero-padded 2-digit number
 */
function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/**
 * Generates a standard backup file name: `arcable-backup-YYYY-MM-DD-HHmmss.json`
 */
export function generateBackupFileName(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `arcable-backup-${y}-${m}-${d}-${h}${min}${s}.json`;
}

/**
 * Prepares workspace backup data and returns formatted JSON string & filename
 */
export function createWorkspaceBackupJson(
  workspaceData: ArcableWorkspaceData,
  options?: { deviceName?: string; deviceType?: string }
): { jsonString: string; fileName: string } {
  const detectedType = options?.deviceType || detectDeviceType();
  const deviceName = options?.deviceName || getStoredDeviceName(undefined, detectedType);
  const now = new Date();

  const backupPayload: WorkspaceBackupFile = {
    arcableBackupVersion: 1,
    exportedAt: now.toISOString(),
    app: 'Arcable',
    deviceName,
    deviceType: detectedType,
    workspace: {
      version: workspaceData.version || 1,
      activeSpaceId: workspaceData.activeSpaceId || workspaceData.spaces[0]?.id || 'space_personal',
      spaces: Array.isArray(workspaceData.spaces) ? workspaceData.spaces : [],
      folders: Array.isArray(workspaceData.folders) ? workspaceData.folders : [],
      tabs: Array.isArray(workspaceData.tabs) ? workspaceData.tabs : [],
      tmpTabs: Array.isArray(workspaceData.tmpTabs) ? workspaceData.tmpTabs : [],
      widgets: Array.isArray(workspaceData.widgets) ? workspaceData.widgets : [],
      customCodeRules: Array.isArray(workspaceData.customCodeRules) ? workspaceData.customCodeRules : [],
      runCodeInPageRules: Array.isArray(workspaceData.runCodeInPageRules) ? workspaceData.runCodeInPageRules : [],
    },
  };

  const fileName = generateBackupFileName(now);
  const jsonString = JSON.stringify(backupPayload, null, 2);

  return { jsonString, fileName };
}

/**
 * Triggers a browser download of a JSON backup file
 */
export function downloadJsonFile(content: string, fileName: string): void {
  if (typeof window === 'undefined' || !window.document) return;

  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exports current workspace data as a downloadable JSON file
 */
export function exportWorkspaceToJson(
  workspaceData: ArcableWorkspaceData,
  options?: { deviceName?: string; deviceType?: string }
): { fileName: string } {
  const { jsonString, fileName } = createWorkspaceBackupJson(workspaceData, options);
  downloadJsonFile(jsonString, fileName);
  return { fileName };
}

/**
 * Parses and validates an uploaded JSON backup file string
 */
export function parseWorkspaceBackupJson(
  rawJson: string,
  fileMeta?: { fileName?: string; fileSize?: number }
): ParseBackupResult {
  if (!rawJson || !rawJson.trim()) {
    return { success: false, error: 'File is empty.' };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(rawJson.trim());
  } catch {
    return { success: false, error: 'Invalid JSON: The file is not formatted as valid JSON.' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { success: false, error: 'Invalid backup file: Top-level data must be a JSON object.' };
  }

  // Detect format: wrapped backup payload vs direct ArcableWorkspaceData
  let wsData: any = null;
  let exportedAt: string | undefined = undefined;
  let deviceName: string | undefined = undefined;

  if (parsed.workspace && typeof parsed.workspace === 'object' && Array.isArray(parsed.workspace.spaces)) {
    // Standard wrapped format
    wsData = parsed.workspace;
    exportedAt = typeof parsed.exportedAt === 'string' ? parsed.exportedAt : undefined;
    deviceName = typeof parsed.deviceName === 'string' ? parsed.deviceName : undefined;
  } else if (Array.isArray(parsed.spaces)) {
    // Direct workspace format
    wsData = parsed;
    exportedAt = typeof parsed.exportedAt === 'string' ? parsed.exportedAt : undefined;
  } else if (parsed.baselineSnapshot && Array.isArray(parsed.baselineSnapshot.spaces)) {
    // Sync baseline format
    wsData = parsed.baselineSnapshot;
  }

  if (!wsData || !Array.isArray(wsData.spaces)) {
    return {
      success: false,
      error: 'Unrecognized backup structure: Missing "spaces" data in the JSON file.',
    };
  }

  // Ensure valid spaces array
  const spaces: Space[] = wsData.spaces;
  if (spaces.length === 0) {
    return {
      success: false,
      error: 'Invalid backup file: The backup contains no spaces.',
    };
  }

  // Validate activeSpaceId
  const activeSpaceExists = spaces.some((s) => s.id === wsData.activeSpaceId);
  const activeSpaceId = activeSpaceExists ? wsData.activeSpaceId : spaces[0].id;

  const validWorkspaceData: ArcableWorkspaceData = {
    version: typeof wsData.version === 'number' ? wsData.version : 1,
    activeSpaceId,
    spaces,
    folders: Array.isArray(wsData.folders) ? wsData.folders : [],
    tabs: Array.isArray(wsData.tabs) ? wsData.tabs : [],
    tmpTabs: Array.isArray(wsData.tmpTabs) ? wsData.tmpTabs : [],
    widgets: Array.isArray(wsData.widgets) ? wsData.widgets : [],
    customCodeRules: Array.isArray(wsData.customCodeRules) ? wsData.customCodeRules : [],
    runCodeInPageRules: Array.isArray(wsData.runCodeInPageRules) ? wsData.runCodeInPageRules : [],
  };

  const summary: WorkspaceBackupSummary = {
    fileName: fileMeta?.fileName,
    fileSize: fileMeta?.fileSize,
    exportedAt,
    deviceName,
    spacesCount: validWorkspaceData.spaces.length,
    foldersCount: validWorkspaceData.folders.length,
    tabsCount: validWorkspaceData.tabs.length,
  };

  return {
    success: true,
    data: validWorkspaceData,
    summary,
  };
}
