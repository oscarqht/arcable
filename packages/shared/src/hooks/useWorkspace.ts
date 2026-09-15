'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Space, Folder, Tab, TmpTab, ArcableWorkspaceData, WorkspaceSiblingItem, WorkspaceWidget, WidgetStyle, WidgetSize, TabUrlVariant, Environment } from '../types/workspace';
import { SyncResult } from '../types/sync';
import { generateId } from '../utils/format';
import {
  createWorkspaceOperation,
  savePendingOperation,
  getStoredPendingOperations,
  clearStoredPendingOperations,
  removeStoredPendingOperations,
  replayOperations,
  getOrCreateDeviceId,
  detectDeviceType,
} from '../utils/syncEngine';
import { syncWorkspaceWithRaindrop } from '../utils/raindropSync';
import { getDescendantFolderIds } from '../utils/treeUtils';
import { getDefaultEnvironment, isValidEnvironmentVariableName, normalizeEnvironments } from '../utils/environment';


export const WORKSPACE_STORAGE_KEY = 'arcable_workspace_data';
export const FOLDER_COLLAPSE_STORAGE_PREFIX = 'arcable_collapse_folder_';

/**
 * Retrieves locally remembered folder expanded/collapsed state from localStorage.
 */
export function getLocalFolderExpanded(folderId: string, defaultExpanded: boolean = true): boolean {
  if (typeof window === 'undefined') return defaultExpanded;
  try {
    const stored = window.localStorage.getItem(`${FOLDER_COLLAPSE_STORAGE_PREFIX}${folderId}`);
    if (stored !== null) {
      return stored !== 'true'; // 'true' means collapsed -> isExpanded: false
    }
  } catch {}
  return defaultExpanded;
}

/**
 * Persists folder expanded state to localStorage.
 */
export function setLocalFolderExpanded(folderId: string, isExpanded: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (!isExpanded) {
      window.localStorage.setItem(`${FOLDER_COLLAPSE_STORAGE_PREFIX}${folderId}`, 'true');
    } else {
      window.localStorage.removeItem(`${FOLDER_COLLAPSE_STORAGE_PREFIX}${folderId}`);
    }
  } catch {}
}

/**
 * Clears folder expanded state from localStorage when folder is deleted.
 */
export function removeLocalFolderExpanded(folderId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(`${FOLDER_COLLAPSE_STORAGE_PREFIX}${folderId}`);
  } catch {}
}

export function getSortedSpaces(spaces: Space[]): Space[] {
  return [...spaces].sort((a, b) => {
    const orderA = a.order !== undefined ? a.order : a.createdAt || 0;
    const orderB = b.order !== undefined ? b.order : b.createdAt || 0;
    if (orderA !== orderB) return orderA - orderB;
    return a.id.localeCompare(b.id);
  });
}

export function getSortedWidgets(widgets: WorkspaceWidget[]): WorkspaceWidget[] {
  return [...widgets].sort((a, b) => {
    const orderA = a.order !== undefined ? a.order : a.createdAt || 0;
    const orderB = b.order !== undefined ? b.order : b.createdAt || 0;
    if (orderA !== orderB) return orderA - orderB;
    return a.id.localeCompare(b.id);
  });
}

export function getSortedTabs(tabs: Tab[]): Tab[] {
  return [...tabs].sort((a, b) => {
    const orderA = a.order !== undefined ? a.order : a.createdAt || 0;
    const orderB = b.order !== undefined ? b.order : b.createdAt || 0;
    if (orderA !== orderB) return orderA - orderB;
    return a.id.localeCompare(b.id);
  });
}

export function getSortedSiblings(
  folders: Folder[],
  tabs: Tab[],
  parentSpaceId: string,
  parentFolderId?: string
): WorkspaceSiblingItem[] {
  const normFolderParentId = parentFolderId || undefined;

  const matchingFolders = folders
    .filter((f) =>
      normFolderParentId
        ? (f.parentFolderId || undefined) === normFolderParentId
        : f.parentSpaceId === parentSpaceId && !f.parentFolderId
    )
    .map((f) => ({
      type: 'folder' as const,
      data: f,
      id: f.id,
      order: f.order !== undefined ? f.order : f.createdAt || 0,
    }));

  const matchingTabs = tabs
    .filter(
      (t) =>
        !t.favourite &&
        !t.pinned &&
        (normFolderParentId
          ? (t.parentFolderId || undefined) === normFolderParentId
          : t.parentSpaceId === parentSpaceId && !t.parentFolderId)
    )
    .map((t) => ({
      type: 'tab' as const,
      data: t,
      id: t.id,
      order: t.order !== undefined ? t.order : t.createdAt || 0,
    }));

  return [...matchingFolders, ...matchingTabs].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.id.localeCompare(b.id);
  });
}

export const DEFAULT_WORKSPACE: ArcableWorkspaceData = {
  activeSpaceId: 'space_personal',
  version: 1,
  spaces: [
    {
      id: 'space_personal',
      name: 'Personal',
      emojiIcon: '🏠',
      colors: 'linear-gradient(135deg, #6ee7b7 0%, #34d399 45%, #38bdf8 100%)',
      order: 1000,
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    },
    {
      id: 'space_work',
      name: 'Work',
      emojiIcon: '💼',
      colors: 'linear-gradient(135deg, #fef3c7 0%, #fed7aa 50%, #fb923c 100%)',
      order: 2000,
      createdAt: 1700000001000,
      updatedAt: 1700000001000,
    },
  ],
  folders: [
    {
      id: 'folder_dev',
      name: 'Development',
      customEmojiIcon: '💻',
      parentSpaceId: 'space_personal',
      isExpanded: true,
      order: 1000,
      createdAt: 1700000002000,
      updatedAt: 1700000002000,
    },
    {
      id: 'folder_docs',
      name: 'Docs & Reference',
      customEmojiIcon: '📚',
      parentFolderId: 'folder_dev',
      parentSpaceId: 'space_personal',
      isExpanded: true,
      order: 1000,
      createdAt: 1700000003000,
      updatedAt: 1700000003000,
    },
    {
      id: 'folder_reads',
      name: 'Daily Reads',
      customEmojiIcon: '📰',
      parentSpaceId: 'space_personal',
      isExpanded: false,
      order: 2000,
      createdAt: 1700000004000,
      updatedAt: 1700000004000,
    },
    {
      id: 'folder_work_projects',
      name: 'Active Projects',
      customEmojiIcon: '🚀',
      parentSpaceId: 'space_work',
      isExpanded: true,
      order: 1000,
      createdAt: 1700000005000,
      updatedAt: 1700000005000,
    },
  ],
  tabs: [
    {
      id: 'tab_arcable',
      url: 'https://arcable.dev',
      pinned: false,
      favourite: true,
      customTitle: 'Arcable Hub',
      customEmojiIcon: '✨',
      order: 1000,
      createdAt: 1700000006000,
      updatedAt: 1700000006000,
    },
    {
      id: 'tab_github',
      url: 'https://github.com',
      pinned: false,
      customTitle: 'GitHub',
      customEmojiIcon: '🐙',
      parentFolderId: 'folder_dev',
      parentSpaceId: 'space_personal',
      order: 2000,
      createdAt: 1700000007000,
      updatedAt: 1700000007000,
    },
    {
      id: 'tab_mdn',
      url: 'https://developer.mozilla.org',
      pinned: false,
      customTitle: 'MDN Web Docs',
      customEmojiIcon: '📖',
      parentFolderId: 'folder_docs',
      parentSpaceId: 'space_personal',
      order: 1000,
      createdAt: 1700000008000,
      updatedAt: 1700000008000,
    },
    {
      id: 'tab_hn',
      url: 'https://news.ycombinator.com',
      pinned: false,
      customTitle: 'Hacker News',
      customEmojiIcon: '⚡',
      parentFolderId: 'folder_reads',
      parentSpaceId: 'space_personal',
      order: 1000,
      createdAt: 1700000009000,
      updatedAt: 1700000009000,
    },
    {
      id: 'tab_notion',
      url: 'https://notion.so',
      pinned: true,
      customTitle: 'Work Notion',
      customEmojiIcon: '📝',
      parentSpaceId: 'space_work',
      order: 1000,
      createdAt: 1700000010000,
      updatedAt: 1700000010000,
    },
    {
      id: 'tab_linear',
      url: 'https://linear.app',
      pinned: false,
      customTitle: 'Linear Tracker',
      customEmojiIcon: '📐',
      parentFolderId: 'folder_work_projects',
      parentSpaceId: 'space_work',
      order: 1000,
      createdAt: 1700000011000,
      updatedAt: 1700000011000,
    },
  ],
  tmpTabs: [],
  widgets: [],
  customCodeRules: [],
  runCodeInPageRules: [],
  environmentVariables: [],
  environments: [getDefaultEnvironment()],
};

function readWorkspaceFromStorage(): ArcableWorkspaceData {
  if (typeof window === 'undefined') return DEFAULT_WORKSPACE;
  try {
    const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    let parsed: ArcableWorkspaceData | null = null;
    if (raw) {
      try {
        parsed = JSON.parse(raw) as ArcableWorkspaceData;
      } catch {
        parsed = null;
      }
    }

    if (!parsed || !Array.isArray(parsed.spaces) || parsed.spaces.length === 0) {
      parsed = { ...DEFAULT_WORKSPACE };
    }

    // Replay any pending operations that may not have been compacted or saved yet
    const pendingOps = getStoredPendingOperations();
    if (pendingOps.length > 0) {
      parsed = replayOperations(parsed, pendingOps);
    }

    const sorted = getSortedSpaces(parsed.spaces || []);
    const activeSpaceExists = sorted.some((s) => s.id === parsed.activeSpaceId);
    const resolvedActiveSpaceId = activeSpaceExists
      ? parsed.activeSpaceId
      : (sorted[0]?.id || 'space_personal');

    const normalizedEnvironments = normalizeEnvironments(parsed.environmentVariables, parsed.environments);
    const initial: ArcableWorkspaceData = {
      spaces: parsed.spaces || [],
      folders: (parsed.folders || []).map((f) => {
        const isExp = f.isExpanded !== undefined ? f.isExpanded : getLocalFolderExpanded(f.id, true);
        setLocalFolderExpanded(f.id, isExp);
        return {
          ...f,
          isExpanded: isExp,
        };
      }),
      tabs: parsed.tabs || [],
      tmpTabs: parsed.tmpTabs || [],
      widgets: parsed.widgets || [],
      customCodeRules: parsed.customCodeRules || [],
      runCodeInPageRules: parsed.runCodeInPageRules || [],
      ...normalizedEnvironments,
      activeSpaceId: resolvedActiveSpaceId,
      version: parsed.version || 1,
    };

    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(initial));
    return initial;
  } catch (err) {
    console.warn('Failed to parse workspace from localStorage:', err);
    return DEFAULT_WORKSPACE;
  }
}

export function useWorkspace() {
  const [data, setData] = useState<ArcableWorkspaceData>(readWorkspaceFromStorage);
  const [isLoaded, setIsLoaded] = useState(false);

  // Sync from storage on mount & handle cross-window/cross-tab storage events
  useEffect(() => {
    const initial = readWorkspaceFromStorage();
    setData(initial);
    setIsLoaded(true);

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === WORKSPACE_STORAGE_KEY && e.newValue) {
        try {
          const updated = JSON.parse(e.newValue) as ArcableWorkspaceData;
          if (updated && Array.isArray(updated.folders)) {
            updated.folders = updated.folders.map((f) => ({
              ...f,
              isExpanded: getLocalFolderExpanded(f.id, f.isExpanded !== false),
            }));
          }
          setData(updated);
        } catch {
          // ignore
        }
      } else if (
        e.key &&
        e.key.startsWith(FOLDER_COLLAPSE_STORAGE_PREFIX) &&
        e.key.length > FOLDER_COLLAPSE_STORAGE_PREFIX.length
      ) {
        const folderId = e.key.substring(FOLDER_COLLAPSE_STORAGE_PREFIX.length);
        const isCollapsed = e.newValue === 'true';
        setData((prev) => ({
          ...prev,
          folders: prev.folders.map((f) =>
            f.id === folderId ? { ...f, isExpanded: !isCollapsed } : f
          ),
        }));
      }
    };

    const handleCustomUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<ArcableWorkspaceData>;
      if (customEvent && customEvent.detail) {
        const updated = customEvent.detail;
        if (updated && Array.isArray(updated.folders)) {
          updated.folders = updated.folders.map((f) => ({
            ...f,
            isExpanded: getLocalFolderExpanded(f.id, f.isExpanded !== false),
          }));
        }
        setData(updated);
      } else {
        const reloaded = readWorkspaceFromStorage();
        setData(reloaded);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('arcable_workspace_updated', handleCustomUpdate);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('arcable_workspace_updated', handleCustomUpdate);
    };
  }, []);

  // Save to localStorage whenever data changes
  const saveWorkspaceData = useCallback((nextData: ArcableWorkspaceData | ((prev: ArcableWorkspaceData) => ArcableWorkspaceData)) => {
    setData((prev) => {
      const resolved = typeof nextData === 'function' ? nextData(prev) : nextData;
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(resolved));
        } catch (err) {
          console.error('Error saving workspace to localStorage:', err);
        }
      }
      return resolved;
    });
  }, []);

  // Active space
  const sortedSpaces = useMemo(() => getSortedSpaces(data.spaces), [data.spaces]);
  const activeSpace = useMemo(
    () => sortedSpaces.find((s) => s.id === data.activeSpaceId) || sortedSpaces[0],
    [sortedSpaces, data.activeSpaceId]
  );

  const setActiveSpace = useCallback((spaceId: string) => {
    saveWorkspaceData((prev) => ({
      ...prev,
      activeSpaceId: spaceId,
    }));
  }, [saveWorkspaceData]);

  // ================= Environments =================
  const createEnvironment = useCallback((name: string) => {
    const normalizedName = name.trim() || 'New Environment';
    if ((data.environments || []).some((environment) => environment.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase())) return null;
    const now = Date.now();
    const environment: Environment = {
      id: generateId('environment'),
      name: normalizedName,
      values: Object.fromEntries((data.environmentVariables || []).map((variable) => [variable, ''])),
      createdAt: now,
      updatedAt: now,
    };
    savePendingOperation(createWorkspaceOperation('ENVIRONMENT_CREATE', environment.id, environment));
    saveWorkspaceData((prev) => ({ ...prev, environments: [...(prev.environments || []), environment] }));
    return environment;
  }, [data.environmentVariables, saveWorkspaceData]);

  const updateEnvironment = useCallback((id: string, updates: Partial<Pick<Environment, 'name' | 'values'>>) => {
    const name = updates.name?.trim();
    if (name && (data.environments || []).some((environment) => environment.id !== id && environment.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return false;
    const normalizedUpdates = { ...updates, ...(name ? { name } : {}) };
    savePendingOperation(createWorkspaceOperation('ENVIRONMENT_UPDATE', id, normalizedUpdates));
    saveWorkspaceData((prev) => ({
      ...prev,
      environments: (prev.environments || []).map((environment) => environment.id === id
          ? { ...environment, ...normalizedUpdates, values: { ...environment.values, ...(normalizedUpdates.values || {}) }, updatedAt: Date.now() }
        : environment),
    }));
    return true;
  }, [data.environments, saveWorkspaceData]);

  const deleteEnvironment = useCallback((id: string) => {
    if ((data.environments || []).length <= 1) return;
    savePendingOperation(createWorkspaceOperation('ENVIRONMENT_DELETE', id));
    saveWorkspaceData((prev) => ({ ...prev, environments: (prev.environments || []).filter((environment) => environment.id !== id) }));
  }, [data.environments, saveWorkspaceData]);

  const createEnvironmentVariable = useCallback((name: string) => {
    const variable = name.trim();
    if (!isValidEnvironmentVariableName(variable) || (data.environmentVariables || []).includes(variable)) return false;
    savePendingOperation(createWorkspaceOperation('ENVIRONMENT_VARIABLE_CREATE', variable));
    saveWorkspaceData((prev) => ({
      ...prev,
      environmentVariables: [...(prev.environmentVariables || []), variable],
      environments: (prev.environments || []).map((environment) => ({ ...environment, values: { ...environment.values, [variable]: '' }, updatedAt: Date.now() })),
    }));
    return true;
  }, [data.environmentVariables, saveWorkspaceData]);

  const renameEnvironmentVariable = useCallback((oldName: string, newName: string) => {
    const variable = newName.trim();
    if (!isValidEnvironmentVariableName(variable) || variable !== oldName && (data.environmentVariables || []).includes(variable)) return false;
    savePendingOperation(createWorkspaceOperation('ENVIRONMENT_VARIABLE_RENAME', oldName, { name: variable }));
    const replacement = `{{${variable}}}`;
    const pattern = new RegExp(`\\{\\{${oldName.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\}\\}`, 'g');
    const rewrite = (url: string) => url.replace(pattern, replacement);
    saveWorkspaceData((prev) => ({
      ...prev,
      environmentVariables: (prev.environmentVariables || []).map((item) => item === oldName ? variable : item),
      environments: (prev.environments || []).map((environment) => {
        const values = { ...environment.values, [variable]: environment.values[oldName] ?? '' };
        delete values[oldName];
        return { ...environment, values, updatedAt: Date.now() };
      }),
      tabs: prev.tabs.map((tab) => ({ ...tab, url: rewrite(tab.url), urlVariants: tab.urlVariants?.map((variant) => ({ ...variant, url: rewrite(variant.url) })) })),
    }));
    return true;
  }, [data.environmentVariables, saveWorkspaceData]);

  const deleteEnvironmentVariable = useCallback((variable: string) => {
    savePendingOperation(createWorkspaceOperation('ENVIRONMENT_VARIABLE_DELETE', variable));
    saveWorkspaceData((prev) => ({
      ...prev,
      environmentVariables: (prev.environmentVariables || []).filter((item) => item !== variable),
      environments: (prev.environments || []).map((environment) => {
        const values = { ...environment.values };
        delete values[variable];
        return { ...environment, values, updatedAt: Date.now() };
      }),
    }));
  }, [saveWorkspaceData]);

  // ================= Space CRUD =================
  const createSpace = useCallback((spaceInput: { name: string; emojiIcon?: string; colors?: string }) => {
    const sorted = getSortedSpaces(data.spaces);
    const lastSpace = sorted[sorted.length - 1];
    const highestOrder = lastSpace
      ? (lastSpace.order !== undefined ? lastSpace.order : (lastSpace.createdAt || 0))
      : 0;

    const newSpace: Space = {
      id: generateId('space'),
      name: spaceInput.name.trim() || 'New Space',
      emojiIcon: spaceInput.emojiIcon || '📁',
      colors: spaceInput.colors?.trim() || undefined,
      order: highestOrder + 1000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    savePendingOperation(createWorkspaceOperation('SPACE_CREATE', newSpace.id, newSpace));

    saveWorkspaceData((prev) => {
      if (prev.spaces.some((s) => s.id === newSpace.id)) {
        return prev;
      }
      return {
        ...prev,
        spaces: [...prev.spaces, newSpace],
        activeSpaceId: newSpace.id,
      };
    });

    return newSpace;
  }, [data.spaces, saveWorkspaceData]);

  const updateSpace = useCallback((id: string, updates: Partial<Omit<Space, 'id'>>) => {
    const opPayload: Record<string, any> = { ...updates };
    if ('emojiIcon' in updates) opPayload.emojiIcon = updates.emojiIcon ?? null;
    if ('colors' in updates) opPayload.colors = updates.colors ?? null;

    savePendingOperation(createWorkspaceOperation('SPACE_UPDATE', id, opPayload));

    saveWorkspaceData((prev) => ({
      ...prev,
      spaces: prev.spaces.map((s) =>
        s.id === id ? { ...s, ...updates, updatedAt: Date.now() } : s
      ),
    }));
  }, [saveWorkspaceData]);

  const deleteSpace = useCallback((id: string) => {
    savePendingOperation(createWorkspaceOperation('SPACE_DELETE', id));

    const remainingSpaces = data.spaces.filter((s) => s.id !== id);
    let fallbackSpace: Space | null = null;
    if (remainingSpaces.length === 0) {
      fallbackSpace = {
        id: generateId('space'),
        name: 'General',
        emojiIcon: '🌐',
        colors: '#919bb5',
        order: 1000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      savePendingOperation(createWorkspaceOperation('SPACE_CREATE', fallbackSpace.id, fallbackSpace));
    }

    saveWorkspaceData((prev) => {
      const remaining = prev.spaces.filter((s) => s.id !== id);
      if (remaining.length === 0) {
        const fb = fallbackSpace || {
          id: 'space_default',
          name: 'General',
          emojiIcon: '🌐',
          colors: '#919bb5',
          order: 1000,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        return {
          ...prev,
          spaces: [fb],
          folders: prev.folders.filter((f) => f.parentSpaceId !== id),
          tabs: prev.tabs.filter((t) => t.parentSpaceId !== id),
          activeSpaceId: fb.id,
        };
      }

      const sortedRemaining = getSortedSpaces(remaining);
      const nextActiveSpaceId =
        prev.activeSpaceId === id ? sortedRemaining[0].id : prev.activeSpaceId;

      return {
        ...prev,
        spaces: remaining,
        folders: prev.folders.filter((f) => f.parentSpaceId !== id),
        tabs: prev.tabs.filter((t) => t.parentSpaceId !== id),
        activeSpaceId: nextActiveSpaceId,
      };
    });
  }, [data.spaces, saveWorkspaceData]);

  const convertSpaceToFolder = useCallback(
    (sourceSpaceId: string, targetSpaceId: string, targetParentFolderId?: string) => {
      if (sourceSpaceId === targetSpaceId) return;

      const sourceSpace = data.spaces.find((s) => s.id === sourceSpaceId);
      const targetSpace = data.spaces.find((s) => s.id === targetSpaceId);
      if (!sourceSpace || !targetSpace) return;

      const cleanTargetParentFolderId = targetParentFolderId?.trim() || undefined;

      // 1. Calculate order in target space / target parent folder
      const siblings = getSortedSiblings(
        data.folders,
        data.tabs,
        targetSpaceId,
        cleanTargetParentFolderId
      );
      const maxOrder = siblings.reduce((max, item) => Math.max(max, item.order), 0);

      // 2. Create the new folder representing the converted space
      const newFolder: Folder = {
        id: generateId('folder'),
        name: sourceSpace.name,
        customEmojiIcon: sourceSpace.emojiIcon || '📁',
        colors: sourceSpace.colors || undefined,
        parentSpaceId: targetSpaceId,
        parentFolderId: cleanTargetParentFolderId,
        isExpanded: true,
        order: maxOrder + 1000,
        createdAt: sourceSpace.createdAt || Date.now(),
        updatedAt: Date.now(),
      };

      // 3. Queue pending operations for sync engine
      savePendingOperation(createWorkspaceOperation('FOLDER_CREATE', newFolder.id, newFolder));

      // 4. Transform all folders in source space
      // Folders that were root in source space become children of newFolder
      // Folders that were subfolders keep their parentFolderId, but their parentSpaceId changes to targetSpaceId
      data.folders.forEach((f) => {
        if (f.parentSpaceId === sourceSpaceId) {
          const isRootInSource = !f.parentFolderId;
          const nextParentFolderId = isRootInSource ? newFolder.id : f.parentFolderId;
          savePendingOperation(
            createWorkspaceOperation('FOLDER_UPDATE', f.id, {
              parentSpaceId: targetSpaceId,
              parentFolderId: nextParentFolderId || null,
            })
          );
        }
      });

      // 5. Transform all tabs in source space
      // Tabs that were root in source space (including pinned tabs) become children of newFolder with pinned: false
      // Tabs that were in subfolders keep their parentFolderId with parentSpaceId: targetSpaceId, pinned: false
      data.tabs.forEach((t) => {
        if (!t.favourite && t.parentSpaceId === sourceSpaceId) {
          const isRootInSource = !t.parentFolderId;
          const nextParentFolderId = isRootInSource ? newFolder.id : t.parentFolderId;
          savePendingOperation(
            createWorkspaceOperation('TAB_UPDATE', t.id, {
              parentSpaceId: targetSpaceId,
              parentFolderId: nextParentFolderId || null,
              pinned: false,
            })
          );
        }
      });

      // 6. Delete source space
      savePendingOperation(createWorkspaceOperation('SPACE_DELETE', sourceSpaceId));

      // 7. Commit state
      saveWorkspaceData((prev) => {
        const remainingSpaces = prev.spaces.filter((s) => s.id !== sourceSpaceId);
        const nextActiveSpaceId =
          prev.activeSpaceId === sourceSpaceId ? targetSpaceId : prev.activeSpaceId;

        const nextFolders = prev.folders
          .map((f) => {
            if (f.parentSpaceId === sourceSpaceId) {
              const isRootInSource = !f.parentFolderId;
              return {
                ...f,
                parentSpaceId: targetSpaceId,
                parentFolderId: isRootInSource ? newFolder.id : f.parentFolderId,
                updatedAt: Date.now(),
              };
            }
            return f;
          })
          .concat(newFolder);

        const nextTabs = prev.tabs.map((t) => {
          if (!t.favourite && t.parentSpaceId === sourceSpaceId) {
            const isRootInSource = !t.parentFolderId;
            return {
              ...t,
              parentSpaceId: targetSpaceId,
              parentFolderId: isRootInSource ? newFolder.id : t.parentFolderId,
              pinned: false,
              updatedAt: Date.now(),
            };
          }
          return t;
        });

        return {
          ...prev,
          spaces: remainingSpaces,
          folders: nextFolders,
          tabs: nextTabs,
          activeSpaceId: nextActiveSpaceId,
        };
      });

      return newFolder;
    },
    [data.spaces, data.folders, data.tabs, saveWorkspaceData]
  );

  // ================= Folder CRUD =================
  const createFolder = useCallback((folderInput: {
    name: string;
    parentSpaceId: string;
    parentFolderId?: string;
    customEmojiIcon?: string;
    colors?: string;
  }) => {
    const targetSpaceId = folderInput.parentSpaceId;
    const targetFolderId = folderInput.parentFolderId || undefined;
    const siblings = getSortedSiblings(data.folders, data.tabs, targetSpaceId, targetFolderId);
    const maxOrder = siblings.reduce((max, item) => Math.max(max, item.order), 0);

    const newFolder: Folder = {
      id: generateId('folder'),
      name: folderInput.name.trim() || 'New Folder',
      parentSpaceId: targetSpaceId,
      parentFolderId: targetFolderId,
      customEmojiIcon: folderInput.customEmojiIcon || '📁',
      colors: folderInput.colors?.trim() || undefined,
      isExpanded: true,
      order: maxOrder + 1000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    savePendingOperation(createWorkspaceOperation('FOLDER_CREATE', newFolder.id, newFolder));

    saveWorkspaceData((prev) => ({
      ...prev,
      folders: [...prev.folders, newFolder],
    }));

    return newFolder;
  }, [data.folders, data.tabs, saveWorkspaceData]);

  const updateFolder = useCallback((id: string, updates: Partial<Omit<Folder, 'id'>>) => {
    saveWorkspaceData((prev) => {
      const currentFolder = prev.folders.find((f) => f.id === id);
      if (!currentFolder) return prev;

      // Determine effective targetSpaceId
      let targetSpaceId = updates.parentSpaceId || currentFolder.parentSpaceId;
      const targetParentFolderId =
        'parentFolderId' in updates
          ? updates.parentFolderId || undefined
          : currentFolder.parentFolderId;

      if (targetParentFolderId) {
        const parentFolder = prev.folders.find((f) => f.id === targetParentFolderId);
        if (parentFolder) {
          targetSpaceId = parentFolder.parentSpaceId;
        }
      }

      // Check if folder is moving to another space or parent folder
      const currentSpaceId = currentFolder.parentSpaceId;
      const currentParentFolderId = currentFolder.parentFolderId || undefined;
      const isLocationChanged =
        targetSpaceId !== currentSpaceId || targetParentFolderId !== currentParentFolderId;

      let destinationOrder = currentFolder.order;
      if (isLocationChanged && updates.order === undefined) {
        const destinationSiblings = getSortedSiblings(
          prev.folders,
          prev.tabs,
          targetSpaceId,
          targetParentFolderId
        ).filter((s) => s.id !== id);
        const maxOrder = destinationSiblings.reduce((max, s) => Math.max(max, s.order), 0);
        destinationOrder = maxOrder + 1000;
      }

      const finalUpdates: Partial<Omit<Folder, 'id'>> = {
        ...updates,
        parentSpaceId: targetSpaceId,
        parentFolderId: targetParentFolderId,
        order: destinationOrder,
      };

      const opPayload: Record<string, any> = { ...finalUpdates };
      if ('customEmojiIcon' in finalUpdates) opPayload.customEmojiIcon = finalUpdates.customEmojiIcon ?? null;
      if ('parentFolderId' in finalUpdates) opPayload.parentFolderId = finalUpdates.parentFolderId ?? null;
      if ('colors' in finalUpdates) opPayload.colors = finalUpdates.colors ?? null;
      if ('isExpanded' in finalUpdates) {
        opPayload.isExpanded = finalUpdates.isExpanded;
        if (typeof finalUpdates.isExpanded === 'boolean') {
          setLocalFolderExpanded(id, finalUpdates.isExpanded);
        }
      }
      if (destinationOrder !== currentFolder.order) {
        opPayload.order = destinationOrder;
      }

      savePendingOperation(createWorkspaceOperation('FOLDER_UPDATE', id, opPayload));

      // Find all descendant folder IDs
      const descendantFolderIds = getDescendantFolderIds(id, prev.folders);

      // Cascade parentSpaceId to any descendant folders whose space changed
      const updatedFolders = prev.folders.map((f) => {
        if (f.id === id) {
          return { ...f, ...finalUpdates, updatedAt: Date.now() };
        }
        if (descendantFolderIds.has(f.id) && f.parentSpaceId !== targetSpaceId) {
          savePendingOperation(
            createWorkspaceOperation('FOLDER_UPDATE', f.id, { parentSpaceId: targetSpaceId })
          );
          return { ...f, parentSpaceId: targetSpaceId, updatedAt: Date.now() };
        }
        return f;
      });

      // Cascade parentSpaceId to any tabs in this folder or descendant folders whose space changed
      const updatedTabs = prev.tabs.map((t) => {
        if (
          !t.favourite &&
          (t.parentFolderId === id || (t.parentFolderId && descendantFolderIds.has(t.parentFolderId)))
        ) {
          if (t.parentSpaceId !== targetSpaceId) {
            savePendingOperation(
              createWorkspaceOperation('TAB_UPDATE', t.id, { parentSpaceId: targetSpaceId })
            );
            return { ...t, parentSpaceId: targetSpaceId, updatedAt: Date.now() };
          }
        }
        return t;
      });

      return {
        ...prev,
        folders: updatedFolders,
        tabs: updatedTabs,
      };
    });
  }, [saveWorkspaceData]);


  const toggleFolderExpand = useCallback((id: string) => {
    saveWorkspaceData((prev) => {
      const target = prev.folders.find((f) => f.id === id);
      const nextExpanded = target ? (target.isExpanded === false ? true : false) : true;
      setLocalFolderExpanded(id, nextExpanded);

      savePendingOperation(
        createWorkspaceOperation('FOLDER_UPDATE', id, { isExpanded: nextExpanded })
      );

      return {
        ...prev,
        folders: prev.folders.map((f) => {
          if (f.id !== id) return f;
          return { ...f, isExpanded: nextExpanded, updatedAt: Date.now() };
        }),
      };
    });
  }, [saveWorkspaceData]);

  const deleteFolder = useCallback((id: string, recursive: boolean = true) => {
    saveWorkspaceData((prev) => {
      const descendantIds = recursive ? getDescendantFolderIds(id, prev.folders) : new Set<string>();
      const folderIdsToDelete = new Set<string>([id, ...descendantIds]);

      folderIdsToDelete.forEach((fId) => {
        removeLocalFolderExpanded(fId);
        savePendingOperation(createWorkspaceOperation('FOLDER_DELETE', fId));
      });

      if (recursive) {
        prev.tabs.forEach((t) => {
          if (t.parentFolderId && folderIdsToDelete.has(t.parentFolderId)) {
            savePendingOperation(createWorkspaceOperation('TAB_DELETE', t.id));
          }
        });
      }

      const deletedFolder = prev.folders.find((f) => f.id === id);
      const fallbackParentFolderId = deletedFolder?.parentFolderId;

      return {
        ...prev,
        folders: recursive
          ? prev.folders.filter((f) => !folderIdsToDelete.has(f.id))
          : prev.folders
              .filter((f) => f.id !== id)
              .map((f) =>
                f.parentFolderId === id ? { ...f, parentFolderId: fallbackParentFolderId } : f
              ),
        tabs: recursive
          ? prev.tabs.filter((t) => !t.parentFolderId || !folderIdsToDelete.has(t.parentFolderId))
          : prev.tabs.map((t) =>
              t.parentFolderId === id ? { ...t, parentFolderId: fallbackParentFolderId } : t
            ),
      };
    });
  }, [saveWorkspaceData]);

  // ================= Tab CRUD =================
  const createTab = useCallback((tabInput: {
    url: string;
    urlVariants?: TabUrlVariant[];
    defaultVariantId?: string;
    parentSpaceId?: string;
    customTitle?: string;
    customEmojiIcon?: string;
    favIconUrl?: string;
    pinned?: boolean;
    favourite?: boolean;
    parentFolderId?: string;
  }) => {
    const normalizeUrl = (u: string) => {
      let c = u.trim();
      if (c && !/^https?:\/\//i.test(c) && !c.startsWith('about:') && !c.startsWith('chrome:')) {
        c = `https://${c}`;
      }
      return c;
    };

    let cleanUrl = normalizeUrl(tabInput.url);
    let cleanedVariants: TabUrlVariant[] | undefined = undefined;
    let selectedDefaultId = tabInput.defaultVariantId;

    if (tabInput.urlVariants && tabInput.urlVariants.length > 0) {
      cleanedVariants = tabInput.urlVariants.map((v) => ({
        id: v.id || generateId('var'),
        name: v.name.trim(),
        url: normalizeUrl(v.url),
      }));

      let defaultVar = selectedDefaultId
        ? cleanedVariants.find((v) => v.id === selectedDefaultId)
        : undefined;
      if (!defaultVar) {
        defaultVar = cleanedVariants[0];
      }
      if (defaultVar) {
        cleanUrl = defaultVar.url;
        selectedDefaultId = defaultVar.id;
      }
    }

    const isFav = Boolean(tabInput.favourite);
    const isPinned = !isFav && Boolean(tabInput.pinned);
    const targetSpaceId = isFav ? undefined : (tabInput.parentSpaceId || activeSpace?.id || 'space_personal');
    const targetFolderId = (isFav || isPinned) ? undefined : (tabInput.parentFolderId || undefined);

    let maxOrder = 0;
    if (isFav) {
      maxOrder = data.tabs.filter((t) => t.favourite).reduce((max, t) => Math.max(max, t.order ?? 0), 0);
    } else if (isPinned && targetSpaceId) {
      maxOrder = data.tabs
        .filter((t) => !t.favourite && t.pinned && t.parentSpaceId === targetSpaceId)
        .reduce((max, t) => Math.max(max, t.order ?? 0), 0);
    } else if (targetSpaceId) {
      const siblings = getSortedSiblings(data.folders, data.tabs, targetSpaceId, targetFolderId);
      maxOrder = siblings.reduce((max, item) => Math.max(max, item.order), 0);
    }

    const newTab: Tab = {
      id: generateId('tab'),
      url: cleanUrl || 'https://arcable.dev',
      urlVariants: cleanedVariants && cleanedVariants.length > 0 ? cleanedVariants : undefined,
      defaultVariantId: cleanedVariants && cleanedVariants.length > 0 ? selectedDefaultId : undefined,
      pinned: isPinned,
      favourite: isFav || undefined,
      customTitle: tabInput.customTitle?.trim() || undefined,
      customEmojiIcon: tabInput.customEmojiIcon?.trim() || undefined,
      favIconUrl: tabInput.favIconUrl,
      parentSpaceId: targetSpaceId,
      parentFolderId: targetFolderId,
      order: maxOrder + 1000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    savePendingOperation(createWorkspaceOperation('TAB_CREATE', newTab.id, newTab));

    saveWorkspaceData((prev) => ({
      ...prev,
      tabs: [...prev.tabs, newTab],
    }));

    return newTab;
  }, [activeSpace, data.folders, data.tabs, saveWorkspaceData]);

  const updateTab = useCallback((id: string, updates: Partial<Omit<Tab, 'id'>>) => {
    saveWorkspaceData((prev) => {
      const currentTab = prev.tabs.find((t) => t.id === id);
      if (!currentTab) return prev;

      const normalizeUrl = (u: string) => {
        let c = u.trim();
        if (c && !/^https?:\/\//i.test(c) && !c.startsWith('about:') && !c.startsWith('chrome:')) {
          c = `https://${c}`;
        }
        return c;
      };

      const normalizedUpdates = { ...updates };
      if (normalizedUpdates.urlVariants !== undefined) {
        if (normalizedUpdates.urlVariants && normalizedUpdates.urlVariants.length > 0) {
          const cleanedVariants = normalizedUpdates.urlVariants.map((v) => ({
            id: v.id || generateId('var'),
            name: v.name.trim(),
            url: normalizeUrl(v.url),
          }));
          let defaultVar = normalizedUpdates.defaultVariantId
            ? cleanedVariants.find((v) => v.id === normalizedUpdates.defaultVariantId)
            : undefined;
          if (!defaultVar) {
            defaultVar = cleanedVariants[0];
          }
          normalizedUpdates.urlVariants = cleanedVariants;
          normalizedUpdates.defaultVariantId = defaultVar?.id;
          if (defaultVar?.url) {
            normalizedUpdates.url = defaultVar.url;
          }
        } else {
          normalizedUpdates.urlVariants = undefined;
          normalizedUpdates.defaultVariantId = undefined;
        }
      }

      if (normalizedUpdates.url) {
        normalizedUpdates.url = normalizeUrl(normalizedUpdates.url);
      }

      const updated = { ...currentTab, ...normalizedUpdates, updatedAt: Date.now() };

      // If favourite is true, tab stops belonging to any space or folder and cannot be pinned
      if (updated.favourite) {
        updated.parentSpaceId = undefined;
        updated.parentFolderId = undefined;
        updated.pinned = false;
      } else if (updates.favourite === false && !updated.parentSpaceId) {
        // If un-favourited, attach back to current active space
        updated.parentSpaceId = prev.activeSpaceId || prev.spaces[0]?.id;
      }

      // If pinned is true, tab shouldn't have parentFolderId and cannot be favourite
      if (updated.pinned) {
        updated.parentFolderId = undefined;
        updated.favourite = false;
      }

      // If parentFolderId is specified, ensure parentSpaceId matches parent folder's space
      if (!updated.favourite && !updated.pinned && updated.parentFolderId) {
        const parentFolder = prev.folders.find((f) => f.id === updated.parentFolderId);
        if (parentFolder) {
          updated.parentSpaceId = parentFolder.parentSpaceId;
        }
      }

      // Check if tab is moving to another space or parent folder, or changing pinned status
      const prevSpaceId = currentTab.parentSpaceId;
      const prevFolderId = currentTab.parentFolderId || undefined;
      const nextSpaceId = updated.parentSpaceId;
      const nextFolderId = updated.parentFolderId || undefined;

      const isLocationChanged =
        !updated.favourite &&
        (nextSpaceId !== prevSpaceId ||
          nextFolderId !== prevFolderId ||
          Boolean(updated.pinned) !== Boolean(currentTab.pinned));

      if (isLocationChanged && updates.order === undefined) {
        if (updated.pinned && nextSpaceId) {
          const destinationPinned = prev.tabs.filter(
            (t) => !t.favourite && t.pinned && t.parentSpaceId === nextSpaceId && t.id !== id
          );
          const maxOrder = destinationPinned.reduce((max, t) => Math.max(max, t.order ?? 0), 0);
          updated.order = maxOrder + 1000;
        } else if (nextSpaceId) {
          const destinationSiblings = getSortedSiblings(
            prev.folders,
            prev.tabs,
            nextSpaceId,
            nextFolderId
          ).filter((s) => s.id !== id);
          const maxOrder = destinationSiblings.reduce((max, s) => Math.max(max, s.order), 0);
          updated.order = maxOrder + 1000;
        }
      }

      const opPayload: Record<string, any> = { ...updates };
      if ('customEmojiIcon' in updates) opPayload.customEmojiIcon = updated.customEmojiIcon ?? null;
      if ('customTitle' in updates) opPayload.customTitle = updated.customTitle ?? null;
      if ('parentFolderId' in updates || isLocationChanged) opPayload.parentFolderId = updated.parentFolderId ?? null;
      if ('parentSpaceId' in updates || isLocationChanged) opPayload.parentSpaceId = updated.parentSpaceId ?? null;
      if ('favourite' in updates) opPayload.favourite = Boolean(updated.favourite);
      if ('pinned' in updates) opPayload.pinned = Boolean(updated.pinned);
      if (updated.order !== currentTab.order) opPayload.order = updated.order;

      savePendingOperation(createWorkspaceOperation('TAB_UPDATE', id, opPayload));

      return {
        ...prev,
        tabs: prev.tabs.map((t) => (t.id === id ? updated : t)),
      };
    });
  }, [saveWorkspaceData]);

  const deleteTab = useCallback((id: string) => {
    savePendingOperation(createWorkspaceOperation('TAB_DELETE', id));

    saveWorkspaceData((prev) => ({
      ...prev,
      tabs: prev.tabs.filter((t) => t.id !== id),
    }));
  }, [saveWorkspaceData]);

  const togglePinTab = useCallback((id: string) => {
    const existing = data.tabs.find((t) => t.id === id);
    const nextPinned = !existing?.pinned;
    savePendingOperation(
      createWorkspaceOperation('TAB_UPDATE', id, {
        pinned: nextPinned,
        parentFolderId: null,
        favourite: false,
      })
    );

    saveWorkspaceData((prev) => ({
      ...prev,
      tabs: prev.tabs.map((t) =>
        t.id === id
          ? {
              ...t,
              pinned: !t.pinned,
              favourite: false,
              parentFolderId: !t.pinned ? undefined : t.parentFolderId,
            }
          : t
      ),
    }));
  }, [data.tabs, saveWorkspaceData]);

  const toggleFavouriteTab = useCallback((id: string) => {
    const existing = data.tabs.find((t) => t.id === id);
    const nextFavourite = !existing?.favourite;

    const updates: Partial<Tab> = nextFavourite
      ? {
          favourite: true,
          pinned: false,
          parentSpaceId: undefined,
          parentFolderId: undefined,
        }
      : {
          favourite: false,
          parentSpaceId: activeSpace?.id || data.spaces[0]?.id,
          parentFolderId: undefined,
        };

    const opUpdates: Record<string, any> = nextFavourite
      ? {
          favourite: true,
          pinned: false,
          parentSpaceId: null,
          parentFolderId: null,
        }
      : {
          favourite: false,
          parentSpaceId: activeSpace?.id || data.spaces[0]?.id,
          parentFolderId: null,
        };

    savePendingOperation(createWorkspaceOperation('TAB_UPDATE', id, opUpdates));

    saveWorkspaceData((prev) => ({
      ...prev,
      tabs: prev.tabs.map((t) => (t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t)),
    }));
  }, [activeSpace, data.spaces, data.tabs, saveWorkspaceData]);

  const duplicateTab = useCallback(
    (tabOrId: string | Tab) => {
      const tabId = typeof tabOrId === 'string' ? tabOrId : tabOrId?.id;
      // Always look up the canonical sourceTab from data.tabs by ID first.
      // This guarantees that we duplicate the original raw URL containing template variables (e.g. {{env}})
      // instead of any resolved URL that might have been present in a UI-level tab object or active browser tab.
      const canonicalTab = data.tabs.find((t) => t.id === tabId);
      const sourceTab = canonicalTab || (typeof tabOrId === 'object' && tabOrId !== null ? tabOrId : null);
      if (!sourceTab) return null;

      const newTabId = generateId('tab');

      // Include all variants of any tab being duplicated, preserving their variable template URLs
      const clonedVariants =
        sourceTab.urlVariants && sourceTab.urlVariants.length > 0
          ? sourceTab.urlVariants.map((v) => ({
              id: generateId('var'),
              name: v.name,
              url: v.url, // Original raw URL with template variables preserved
            }))
          : undefined;

      let clonedDefaultVariantId: string | undefined = undefined;
      // Preserve the raw template URL with variables (never a resolved URL)
      let targetUrl = sourceTab.url;

      if (clonedVariants && clonedVariants.length > 0) {
        if (sourceTab.defaultVariantId) {
          const origIdx = sourceTab.urlVariants?.findIndex((v) => v.id === sourceTab.defaultVariantId);
          if (origIdx !== undefined && origIdx >= 0 && clonedVariants[origIdx]) {
            clonedDefaultVariantId = clonedVariants[origIdx].id;
            if (clonedVariants[origIdx].url) {
              targetUrl = clonedVariants[origIdx].url;
            }
          }
        }
        if (!clonedDefaultVariantId) {
          clonedDefaultVariantId = clonedVariants[0].id;
          if (clonedVariants[0].url) {
            targetUrl = clonedVariants[0].url;
          }
        }
      }

      // Case 1: Favourite tab
      if (sourceTab.favourite) {
        const favTabs = data.tabs
          .filter((t) => Boolean(t.favourite))
          .sort((a, b) => {
            const orderA = a.order !== undefined ? a.order : a.createdAt || 0;
            const orderB = b.order !== undefined ? b.order : b.createdAt || 0;
            if (orderA !== orderB) return orderA - orderB;
            return a.id.localeCompare(b.id);
          });

        const sourceIdx = favTabs.findIndex((t) => t.id === tabId);
        const newTab: Tab = {
          id: newTabId,
          url: targetUrl,
          urlVariants: clonedVariants,
          defaultVariantId: clonedDefaultVariantId,
          customTitle: sourceTab.customTitle,
          customEmojiIcon: sourceTab.customEmojiIcon,
          favIconUrl: sourceTab.favIconUrl,
          pinned: false,
          favourite: true,
          order: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        const insertIdx = sourceIdx >= 0 ? sourceIdx + 1 : favTabs.length;
        favTabs.splice(insertIdx, 0, newTab);

        const orderMap = new Map<string, number>();
        favTabs.forEach((t, i) => orderMap.set(t.id, (i + 1) * 1000));
        newTab.order = orderMap.get(newTab.id) ?? (insertIdx + 1) * 1000;

        savePendingOperation(createWorkspaceOperation('TAB_CREATE', newTab.id, newTab));

        favTabs.forEach((t) => {
          if (t.id !== newTab.id) {
            const oldTab = data.tabs.find((orig) => orig.id === t.id);
            const newOrder = orderMap.get(t.id);
            if (oldTab && newOrder !== undefined && oldTab.order !== newOrder) {
              savePendingOperation(
                createWorkspaceOperation('TAB_UPDATE', t.id, { order: newOrder })
              );
            }
          }
        });

        saveWorkspaceData((prev) => {
          const updatedTabs = prev.tabs.map((t) =>
            orderMap.has(t.id) ? { ...t, order: orderMap.get(t.id)! } : t
          );
          return {
            ...prev,
            tabs: [...updatedTabs, newTab],
          };
        });

        return newTab;
      }

      // Case 2: Pinned tab in space
      if (sourceTab.pinned) {
        const parentSpaceId = sourceTab.parentSpaceId || activeSpace?.id || data.activeSpaceId || 'space_personal';
        const pinnedTabs = getSortedTabs(
          data.tabs.filter((t) => !t.favourite && t.pinned && t.parentSpaceId === parentSpaceId)
        );
        const sourceIdx = pinnedTabs.findIndex((t) => t.id === tabId);

        const newTab: Tab = {
          id: newTabId,
          url: targetUrl,
          urlVariants: clonedVariants,
          defaultVariantId: clonedDefaultVariantId,
          customTitle: sourceTab.customTitle,
          customEmojiIcon: sourceTab.customEmojiIcon,
          favIconUrl: sourceTab.favIconUrl,
          pinned: true,
          favourite: false,
          parentSpaceId,
          order: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        const insertIdx = sourceIdx >= 0 ? sourceIdx + 1 : pinnedTabs.length;
        pinnedTabs.splice(insertIdx, 0, newTab);

        const orderMap = new Map<string, number>();
        pinnedTabs.forEach((t, i) => orderMap.set(t.id, (i + 1) * 1000));
        newTab.order = orderMap.get(newTab.id) ?? (insertIdx + 1) * 1000;

        savePendingOperation(createWorkspaceOperation('TAB_CREATE', newTab.id, newTab));

        pinnedTabs.forEach((t) => {
          if (t.id !== newTab.id) {
            const oldTab = data.tabs.find((orig) => orig.id === t.id);
            const newOrder = orderMap.get(t.id);
            if (oldTab && newOrder !== undefined && oldTab.order !== newOrder) {
              savePendingOperation(
                createWorkspaceOperation('TAB_UPDATE', t.id, { order: newOrder })
              );
            }
          }
        });

        saveWorkspaceData((prev) => {
          const updatedTabs = prev.tabs.map((t) =>
            orderMap.has(t.id) ? { ...t, order: orderMap.get(t.id)! } : t
          );
          return {
            ...prev,
            tabs: [...updatedTabs, newTab],
          };
        });

        return newTab;
      }

      // Case 3: Regular saved tab (in space root or folder)
      const parentSpaceId = sourceTab.parentSpaceId || activeSpace?.id || data.activeSpaceId || 'space_personal';
      const parentFolderId = sourceTab.parentFolderId || undefined;

      const siblings = getSortedSiblings(data.folders, data.tabs, parentSpaceId, parentFolderId);
      const sourceIdx = siblings.findIndex((s) => s.id === tabId);

      const newTab: Tab = {
        id: newTabId,
        url: targetUrl,
        urlVariants: clonedVariants,
        defaultVariantId: clonedDefaultVariantId,
        customTitle: sourceTab.customTitle,
        customEmojiIcon: sourceTab.customEmojiIcon,
        favIconUrl: sourceTab.favIconUrl,
        pinned: false,
        favourite: false,
        parentSpaceId,
        parentFolderId,
        order: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const newSiblingItem: WorkspaceSiblingItem = {
        type: 'tab',
        data: newTab,
        id: newTab.id,
        order: 0,
      };

      const insertIdx = sourceIdx >= 0 ? sourceIdx + 1 : siblings.length;
      siblings.splice(insertIdx, 0, newSiblingItem);

      const orderMap = new Map<string, number>();
      siblings.forEach((s, idx) => {
        orderMap.set(s.id, (idx + 1) * 1000);
      });

      newTab.order = orderMap.get(newTab.id) ?? (insertIdx + 1) * 1000;

      savePendingOperation(createWorkspaceOperation('TAB_CREATE', newTab.id, newTab));

      siblings.forEach((s) => {
        if (s.id !== newTab.id) {
          const newOrder = orderMap.get(s.id);
          if (newOrder !== undefined) {
            if (s.type === 'folder') {
              const oldFolder = data.folders.find((f) => f.id === s.id);
              if (oldFolder && oldFolder.order !== newOrder) {
                savePendingOperation(
                  createWorkspaceOperation('FOLDER_UPDATE', s.id, { order: newOrder })
                );
              }
            } else {
              const oldTab = data.tabs.find((t) => t.id === s.id);
              if (oldTab && oldTab.order !== newOrder) {
                savePendingOperation(
                  createWorkspaceOperation('TAB_UPDATE', s.id, { order: newOrder })
                );
              }
            }
          }
        }
      });

      saveWorkspaceData((prev) => {
        const updatedFolders = prev.folders.map((f) =>
          orderMap.has(f.id) ? { ...f, order: orderMap.get(f.id)! } : f
        );
        const updatedTabs = prev.tabs.map((t) =>
          orderMap.has(t.id) ? { ...t, order: orderMap.get(t.id)! } : t
        );
        return {
          ...prev,
          folders: updatedFolders,
          tabs: [...updatedTabs, newTab],
        };
      });

      return newTab;
    },
    [activeSpace, data.activeSpaceId, data.folders, data.tabs, saveWorkspaceData]
  );

  // ================= Tmp Tab Operations =================

  const createTmpTab = useCallback((tabInput: Partial<TmpTab> & { url: string; id?: string }) => {
    const newTmpTab: TmpTab = {
      id: tabInput.id || generateId('tmp'),
      url: tabInput.url,
      title: tabInput.title,
      customTitle: tabInput.customTitle,
      favIconUrl: tabInput.favIconUrl,
      browserTabId: tabInput.browserTabId,
      windowId: tabInput.windowId,
      badge: tabInput.badge,
      deviceId: tabInput.deviceId || getOrCreateDeviceId(),
      deviceName: tabInput.deviceName,
      deviceType: tabInput.deviceType,
      createdAt: tabInput.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    savePendingOperation(createWorkspaceOperation('TMP_TAB_CREATE', newTmpTab.id, newTmpTab));

    saveWorkspaceData((prev) => {
      const existingIdx = (prev.tmpTabs || []).findIndex((t) => t.id === newTmpTab.id);
      let updatedTmp: TmpTab[];
      if (existingIdx >= 0) {
        updatedTmp = [...(prev.tmpTabs || [])];
        updatedTmp[existingIdx] = { ...updatedTmp[existingIdx], ...newTmpTab };
      } else {
        updatedTmp = [...(prev.tmpTabs || []), newTmpTab];
      }
      return {
        ...prev,
        tmpTabs: updatedTmp,
      };
    });

    return newTmpTab;
  }, [saveWorkspaceData]);

  const updateTmpTab = useCallback((id: string, updates: Partial<Omit<TmpTab, 'id'>>) => {
    savePendingOperation(createWorkspaceOperation('TMP_TAB_UPDATE', id, updates));

    saveWorkspaceData((prev) => ({
      ...prev,
      tmpTabs: (prev.tmpTabs || []).map((t) => {
        if (t.id !== id) return t;
        return {
          ...t,
          ...updates,
          updatedAt: Date.now(),
        };
      }),
    }));
  }, [saveWorkspaceData]);

  const deleteTmpTab = useCallback((id: string) => {
    savePendingOperation(createWorkspaceOperation('TMP_TAB_DELETE', id));

    saveWorkspaceData((prev) => ({
      ...prev,
      tmpTabs: (prev.tmpTabs || []).filter((t) => t.id !== id),
    }));
  }, [saveWorkspaceData]);

  const promoteTmpTab = useCallback((tmpTab: TmpTab, targetSpaceId?: string, targetFolderId?: string) => {
    const savedTab = createTab({
      url: tmpTab.url,
      customTitle: tmpTab.customTitle || tmpTab.title,
      favIconUrl: tmpTab.favIconUrl,
      parentSpaceId: targetSpaceId || activeSpace?.id,
      parentFolderId: targetFolderId,
    });

    deleteTmpTab(tmpTab.id);

    return savedTab;
  }, [activeSpace, createTab, deleteTmpTab]);

  // ================= Widget Operations =================
  const addWidget = useCallback((widgetInput: { style: WidgetStyle; size?: WidgetSize; config?: Record<string, any> }) => {
    const existing = data.widgets || [];
    const favTabs = data.tabs.filter((t) => Boolean(t.favourite));
    const maxOrder = Math.max(
      0,
      ...existing.map((w) => (w.order !== undefined ? w.order : w.createdAt || 0)),
      ...favTabs.map((t) => (t.order !== undefined ? t.order : t.createdAt || 0))
    );

    const newWidget: WorkspaceWidget = {
      id: generateId('widget'),
      style: widgetInput.style,
      size: widgetInput.size || 'small',
      config: widgetInput.config,
      order: maxOrder + 1000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    savePendingOperation(createWorkspaceOperation('WIDGET_CREATE', newWidget.id, newWidget));

    saveWorkspaceData((prev) => {
      if ((prev.widgets || []).some((w) => w.id === newWidget.id)) {
        return prev;
      }
      return {
        ...prev,
        widgets: [...(prev.widgets || []), newWidget],
      };
    });

    return newWidget;
  }, [data.widgets, data.tabs, saveWorkspaceData]);

  const updateWidget = useCallback((id: string, updates: Partial<WorkspaceWidget>) => {
    savePendingOperation(createWorkspaceOperation('WIDGET_UPDATE', id, updates));

    saveWorkspaceData((prev) => ({
      ...prev,
      widgets: (prev.widgets || []).map((w) => {
        if (w.id === id) {
          return {
            ...w,
            ...updates,
            config: {
              ...(w.config || {}),
              ...(updates.config || {}),
            },
            updatedAt: Date.now(),
          };
        }
        return w;
      }),
    }));
  }, [saveWorkspaceData]);

  const removeWidget = useCallback((id: string) => {
    savePendingOperation(createWorkspaceOperation('WIDGET_DELETE', id));

    saveWorkspaceData((prev) => ({
      ...prev,
      widgets: (prev.widgets || []).filter((w) => w.id !== id),
    }));
  }, [saveWorkspaceData]);

  // Reorders a widget before the target widget; when targetId is omitted, moves it to the end.
  const reorderWidget = useCallback((sourceId: string, targetId?: string) => {
    if (sourceId === targetId) return;

    const sorted = getSortedWidgets(data.widgets || []);
    const sourceIdx = sorted.findIndex((w) => w.id === sourceId);
    if (sourceIdx < 0) return;

    const [moved] = sorted.splice(sourceIdx, 1);
    if (targetId) {
      const targetIdx = sorted.findIndex((w) => w.id === targetId);
      if (targetIdx < 0) return;
      sorted.splice(targetIdx, 0, moved);
    } else {
      sorted.push(moved);
    }

    const reindexed = sorted.map((w, idx) => ({
      ...w,
      order: (idx + 1) * 1000,
      updatedAt: w.id === sourceId ? Date.now() : w.updatedAt,
    }));

    reindexed.forEach((w) => {
      const oldWidget = (data.widgets || []).find((orig) => orig.id === w.id);
      if (oldWidget && oldWidget.order !== w.order) {
        savePendingOperation(
          createWorkspaceOperation('WIDGET_UPDATE', w.id, { order: w.order })
        );
      }
    });

    saveWorkspaceData((prev) => ({
      ...prev,
      widgets: reindexed,
    }));
  }, [data.widgets, saveWorkspaceData]);

  // ================= Reordering Operations =================
  const reorderSpaces = useCallback(
    (sourceSpaceId: string, targetSpaceId: string, position: 'before' | 'after') => {
      if (sourceSpaceId === targetSpaceId) return;

      const sorted = getSortedSpaces(data.spaces);
      const sourceIdx = sorted.findIndex((s) => s.id === sourceSpaceId);
      const targetIdx = sorted.findIndex((s) => s.id === targetSpaceId);
      if (sourceIdx < 0 || targetIdx < 0) return;

      const [moved] = sorted.splice(sourceIdx, 1);
      const newTargetIdx = sorted.findIndex((s) => s.id === targetSpaceId);
      const insertIdx = position === 'before' ? newTargetIdx : newTargetIdx + 1;
      sorted.splice(insertIdx, 0, moved);

      const reindexed = sorted.map((s, idx) => ({
        ...s,
        order: (idx + 1) * 1000,
        updatedAt: s.id === sourceSpaceId ? Date.now() : s.updatedAt,
      }));

      reindexed.forEach((s) => {
        const oldSpace = data.spaces.find((orig) => orig.id === s.id);
        if (oldSpace && oldSpace.order !== s.order) {
          savePendingOperation(
            createWorkspaceOperation('SPACE_UPDATE', s.id, { order: s.order })
          );
        }
      });

      saveWorkspaceData((prev) => ({
        ...prev,
        spaces: reindexed,
      }));
    },
    [data.spaces, saveWorkspaceData]
  );

  const moveSpace = useCallback(
    (spaceId: string, direction: 'left' | 'right') => {
      const sorted = getSortedSpaces(data.spaces);
      const idx = sorted.findIndex((s) => s.id === spaceId);
      if (idx < 0) return;
      const targetIdx = direction === 'left' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= sorted.length) return;

      const [moved] = sorted.splice(idx, 1);
      sorted.splice(targetIdx, 0, moved);

      const reindexed = sorted.map((s, i) => ({
        ...s,
        order: (i + 1) * 1000,
        updatedAt: s.id === spaceId ? Date.now() : s.updatedAt,
      }));

      reindexed.forEach((s) => {
        const oldSpace = data.spaces.find((orig) => orig.id === s.id);
        if (oldSpace && oldSpace.order !== s.order) {
          savePendingOperation(
            createWorkspaceOperation('SPACE_UPDATE', s.id, { order: s.order })
          );
        }
      });

      saveWorkspaceData((prev) => ({
        ...prev,
        spaces: reindexed,
      }));
    },
    [data.spaces, saveWorkspaceData]
  );

  const reorderSiblingItem = useCallback(
    (params: {
      sourceId: string;
      sourceType: 'folder' | 'tab';
      targetId: string;
      targetType: 'folder' | 'tab';
      position: 'before' | 'after' | 'inside';
    }) => {
      const { sourceId, sourceType, targetId, targetType, position } = params;
      if (sourceId === targetId) return;

      const sourceFolder = sourceType === 'folder' ? data.folders.find((f) => f.id === sourceId) : undefined;
      const sourceTab = sourceType === 'tab' ? data.tabs.find((t) => t.id === sourceId) : undefined;
      if (!sourceFolder && !sourceTab) return;

      const targetFolder = targetType === 'folder' ? data.folders.find((f) => f.id === targetId) : undefined;
      const targetTab = targetType === 'tab' ? data.tabs.find((t) => t.id === targetId) : undefined;
      if (!targetFolder && !targetTab) return;

      // Case 1: Drop inside a folder
      if (position === 'inside' && targetFolder) {
        if (sourceType === 'folder') {
          if (sourceFolder?.id === targetFolder.id) return;
          let currParent: string | undefined = targetFolder.parentFolderId;
          while (currParent) {
            if (currParent === sourceFolder?.id) return;
            const p = data.folders.find((f) => f.id === currParent);
            currParent = p?.parentFolderId;
          }
        }

        const childSiblings = getSortedSiblings(
          data.folders,
          data.tabs,
          targetFolder.parentSpaceId,
          targetFolder.id
        ).filter((s) => s.id !== sourceId);
        const maxOrder = childSiblings.reduce((max, s) => Math.max(max, s.order), 0);
        const newOrder = maxOrder + 1000;

        if (sourceType === 'tab') {
          savePendingOperation(
            createWorkspaceOperation('TAB_UPDATE', sourceId, {
              parentSpaceId: targetFolder.parentSpaceId,
              parentFolderId: targetFolder.id,
              pinned: false,
              favourite: false,
              order: newOrder,
            })
          );

          saveWorkspaceData((prev) => ({
            ...prev,
            tabs: prev.tabs.map((t) =>
              t.id === sourceId
                ? {
                    ...t,
                    parentSpaceId: targetFolder.parentSpaceId,
                    parentFolderId: targetFolder.id,
                    pinned: false,
                    favourite: false,
                    order: newOrder,
                    updatedAt: Date.now(),
                  }
                : t
            ),
          }));
          return;
        } else {
          const targetSpaceId = targetFolder.parentSpaceId;
          const descendantFolderIds = getDescendantFolderIds(sourceId, data.folders);

          savePendingOperation(
            createWorkspaceOperation('FOLDER_UPDATE', sourceId, {
              parentSpaceId: targetSpaceId,
              parentFolderId: targetFolder.id,
              order: newOrder,
            })
          );

          data.folders.forEach((f) => {
            if (descendantFolderIds.has(f.id) && f.parentSpaceId !== targetSpaceId) {
              savePendingOperation(
                createWorkspaceOperation('FOLDER_UPDATE', f.id, { parentSpaceId: targetSpaceId })
              );
            }
          });

          data.tabs.forEach((t) => {
            if (
              !t.favourite &&
              (t.parentFolderId === sourceId || (t.parentFolderId && descendantFolderIds.has(t.parentFolderId))) &&
              t.parentSpaceId !== targetSpaceId
            ) {
              savePendingOperation(
                createWorkspaceOperation('TAB_UPDATE', t.id, { parentSpaceId: targetSpaceId })
              );
            }
          });

          saveWorkspaceData((prev) => ({
            ...prev,
            folders: prev.folders.map((f) => {
              if (f.id === sourceId) {
                return {
                  ...f,
                  parentSpaceId: targetSpaceId,
                  parentFolderId: targetFolder.id,
                  order: newOrder,
                  updatedAt: Date.now(),
                };
              }
              if (descendantFolderIds.has(f.id) && f.parentSpaceId !== targetSpaceId) {
                return { ...f, parentSpaceId: targetSpaceId, updatedAt: Date.now() };
              }
              return f;
            }),
            tabs: prev.tabs.map((t) => {
              if (
                !t.favourite &&
                (t.parentFolderId === sourceId || (t.parentFolderId && descendantFolderIds.has(t.parentFolderId))) &&
                t.parentSpaceId !== targetSpaceId
              ) {
                return { ...t, parentSpaceId: targetSpaceId, updatedAt: Date.now() };
              }
              return t;
            }),
          }));
          return;
        }
      }

      // Case 2: Drop before or after target item
      const parentSpaceId = targetFolder
        ? targetFolder.parentSpaceId
        : targetTab?.parentSpaceId || data.activeSpaceId;
      const parentFolderId = targetFolder ? targetFolder.parentFolderId : targetTab?.parentFolderId;

      if (sourceType === 'folder') {
        if (sourceFolder?.id === parentFolderId) return;
        let currParent: string | undefined = parentFolderId;
        while (currParent) {
          if (currParent === sourceFolder?.id) return;
          const p = data.folders.find((f) => f.id === currParent);
          currParent = p?.parentFolderId;
        }
      }

      const siblings = getSortedSiblings(data.folders, data.tabs, parentSpaceId, parentFolderId).filter(
        (s) => s.id !== sourceId
      );

      const targetIdx = siblings.findIndex((s) => s.id === targetId);
      if (targetIdx < 0) return;

      const sourceItem: WorkspaceSiblingItem =
        sourceType === 'folder'
          ? { type: 'folder', data: sourceFolder!, id: sourceId, order: 0 }
          : { type: 'tab', data: sourceTab!, id: sourceId, order: 0 };

      const insertIdx = position === 'before' ? targetIdx : targetIdx + 1;
      siblings.splice(insertIdx, 0, sourceItem);

      const updatedOrderMap = new Map<string, number>();
      siblings.forEach((s, idx) => {
        updatedOrderMap.set(s.id, (idx + 1) * 1000);
      });

      const descendantFolderIds =
        sourceType === 'folder'
          ? getDescendantFolderIds(sourceId, data.folders)
          : new Set<string>();

      const updatedFolders = data.folders.map((f) => {
        if (f.id === sourceId) {
          return {
            ...f,
            parentSpaceId,
            parentFolderId: parentFolderId || undefined,
            order: updatedOrderMap.get(f.id) ?? f.order ?? 1000,
            updatedAt: Date.now(),
          };
        }
        if (sourceType === 'folder' && descendantFolderIds.has(f.id) && f.parentSpaceId !== parentSpaceId) {
          return {
            ...f,
            parentSpaceId,
            updatedAt: Date.now(),
          };
        }
        if (updatedOrderMap.has(f.id)) {
          return { ...f, order: updatedOrderMap.get(f.id)! };
        }
        return f;
      });

      const updatedTabs = data.tabs.map((t) => {
        if (t.id === sourceId) {
          return {
            ...t,
            parentSpaceId,
            parentFolderId: parentFolderId || undefined,
            pinned: false,
            favourite: false,
            order: updatedOrderMap.get(t.id) ?? t.order ?? 1000,
            updatedAt: Date.now(),
          };
        }
        if (
          sourceType === 'folder' &&
          !t.favourite &&
          (t.parentFolderId === sourceId || (t.parentFolderId && descendantFolderIds.has(t.parentFolderId))) &&
          t.parentSpaceId !== parentSpaceId
        ) {
          return {
            ...t,
            parentSpaceId,
            updatedAt: Date.now(),
          };
        }
        if (updatedOrderMap.has(t.id)) {
          return { ...t, order: updatedOrderMap.get(t.id)! };
        }
        return t;
      });

      updatedFolders.forEach((f) => {
        const oldFolder = data.folders.find((orig) => orig.id === f.id);
        if (
          oldFolder &&
          (oldFolder.order !== f.order ||
            oldFolder.parentSpaceId !== f.parentSpaceId ||
            oldFolder.parentFolderId !== f.parentFolderId)
        ) {
          savePendingOperation(
            createWorkspaceOperation('FOLDER_UPDATE', f.id, {
              parentSpaceId: f.parentSpaceId,
              parentFolderId: f.parentFolderId ?? null,
              order: f.order,
            })
          );
        }
      });

      updatedTabs.forEach((t) => {
        const oldTab = data.tabs.find((orig) => orig.id === t.id);
        if (
          oldTab &&
          (oldTab.order !== t.order ||
            oldTab.parentSpaceId !== t.parentSpaceId ||
            oldTab.parentFolderId !== t.parentFolderId ||
            oldTab.pinned !== t.pinned ||
            oldTab.favourite !== t.favourite)
        ) {
          savePendingOperation(
            createWorkspaceOperation('TAB_UPDATE', t.id, {
              parentSpaceId: t.parentSpaceId ?? null,
              parentFolderId: t.parentFolderId ?? null,
              pinned: t.pinned,
              favourite: t.favourite,
              order: t.order,
            })
          );
        }
      });

      saveWorkspaceData((prev) => ({
        ...prev,
        folders: updatedFolders,
        tabs: updatedTabs,
      }));
    },
    [data.activeSpaceId, data.folders, data.tabs, saveWorkspaceData]
  );

  const moveSiblingItem = useCallback(
    (itemId: string, itemType: 'folder' | 'tab', direction: 'up' | 'down') => {
      const folder = itemType === 'folder' ? data.folders.find((f) => f.id === itemId) : undefined;
      const tab = itemType === 'tab' ? data.tabs.find((t) => t.id === itemId) : undefined;
      if (!folder && !tab) return;

      const parentSpaceId = folder ? folder.parentSpaceId : tab?.parentSpaceId || data.activeSpaceId;
      const parentFolderId = folder ? folder.parentFolderId : tab?.parentFolderId;

      const siblings = getSortedSiblings(data.folders, data.tabs, parentSpaceId, parentFolderId);
      const idx = siblings.findIndex((s) => s.id === itemId);
      if (idx < 0) return;

      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= siblings.length) return;

      const [moved] = siblings.splice(idx, 1);
      siblings.splice(targetIdx, 0, moved);

      const updatedOrderMap = new Map<string, number>();
      siblings.forEach((s, i) => {
        updatedOrderMap.set(s.id, (i + 1) * 1000);
      });

      const updatedFolders = data.folders.map((f) =>
        updatedOrderMap.has(f.id)
          ? { ...f, order: updatedOrderMap.get(f.id)!, updatedAt: f.id === itemId ? Date.now() : f.updatedAt }
          : f
      );
      const updatedTabs = data.tabs.map((t) =>
        updatedOrderMap.has(t.id)
          ? { ...t, order: updatedOrderMap.get(t.id)!, updatedAt: t.id === itemId ? Date.now() : t.updatedAt }
          : t
      );

      updatedFolders.forEach((f) => {
        const oldFolder = data.folders.find((orig) => orig.id === f.id);
        if (oldFolder && oldFolder.order !== f.order) {
          savePendingOperation(
            createWorkspaceOperation('FOLDER_UPDATE', f.id, { order: f.order })
          );
        }
      });

      updatedTabs.forEach((t) => {
        const oldTab = data.tabs.find((orig) => orig.id === t.id);
        if (oldTab && oldTab.order !== t.order) {
          savePendingOperation(
            createWorkspaceOperation('TAB_UPDATE', t.id, { order: t.order })
          );
        }
      });

      saveWorkspaceData((prev) => ({
        ...prev,
        folders: updatedFolders,
        tabs: updatedTabs,
      }));
    },
    [data.activeSpaceId, data.folders, data.tabs, saveWorkspaceData]
  );

  const reorderPinnedTabs = useCallback(
    (sourceTabId: string, targetTabId: string, position: 'before' | 'after') => {
      if (sourceTabId === targetTabId) return;
      const currentSpace = activeSpace?.id || data.activeSpaceId;
      const pinned = getSortedTabs(
        data.tabs.filter((t) => !t.favourite && t.pinned && t.parentSpaceId === currentSpace)
      );
      const sourceIdx = pinned.findIndex((t) => t.id === sourceTabId);
      const targetIdx = pinned.findIndex((t) => t.id === targetTabId);
      if (sourceIdx < 0 || targetIdx < 0) return;

      const [moved] = pinned.splice(sourceIdx, 1);
      const newTargetIdx = pinned.findIndex((t) => t.id === targetTabId);
      const insertIdx = position === 'before' ? newTargetIdx : newTargetIdx + 1;
      pinned.splice(insertIdx, 0, moved);

      const orderMap = new Map<string, number>();
      pinned.forEach((t, i) => orderMap.set(t.id, (i + 1) * 1000));

      const updatedTabs = data.tabs.map((t) =>
        orderMap.has(t.id)
          ? { ...t, order: orderMap.get(t.id)!, updatedAt: t.id === sourceTabId ? Date.now() : t.updatedAt }
          : t
      );

      updatedTabs.forEach((t) => {
        const oldTab = data.tabs.find((orig) => orig.id === t.id);
        if (oldTab && oldTab.order !== t.order) {
          savePendingOperation(
            createWorkspaceOperation('TAB_UPDATE', t.id, { order: t.order })
          );
        }
      });

      saveWorkspaceData((prev) => ({ ...prev, tabs: updatedTabs }));
    },
    [activeSpace, data.activeSpaceId, data.tabs, saveWorkspaceData]
  );

  const reorderFavouriteItem = useCallback(
    (sourceId: string, targetId: string, position: 'before' | 'after') => {
      if (sourceId === targetId) return;

      type FavItem = { id: string; type: 'tab' | 'widget'; order?: number; createdAt?: number };
      const favTabs: FavItem[] = getSortedTabs(data.tabs.filter((t) => Boolean(t.favourite))).map((t) => ({
        id: t.id,
        type: 'tab' as const,
        order: t.order,
        createdAt: t.createdAt,
      }));
      const currentWidgets: FavItem[] = getSortedWidgets(data.widgets || []).map((w) => ({
        id: w.id,
        type: 'widget' as const,
        order: w.order,
        createdAt: w.createdAt,
      }));

      const allItems: FavItem[] = [...favTabs, ...currentWidgets].sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
        if (a.order !== undefined) return -1;
        if (b.order !== undefined) return 1;
        return (a.createdAt || 0) - (b.createdAt || 0);
      });

      const sourceIdx = allItems.findIndex((i) => i.id === sourceId);
      const targetIdx = allItems.findIndex((i) => i.id === targetId);
      if (sourceIdx < 0 || targetIdx < 0) return;

      const [moved] = allItems.splice(sourceIdx, 1);
      const newTargetIdx = allItems.findIndex((i) => i.id === targetId);
      const insertIdx = position === 'before' ? newTargetIdx : newTargetIdx + 1;
      allItems.splice(insertIdx, 0, moved);

      const orderMap = new Map<string, number>();
      allItems.forEach((item, idx) => {
        orderMap.set(item.id, (idx + 1) * 1000);
      });

      // Update tabs
      const updatedTabs = data.tabs.map((t) =>
        orderMap.has(t.id)
          ? { ...t, order: orderMap.get(t.id)!, updatedAt: t.id === sourceId ? Date.now() : t.updatedAt }
          : t
      );

      updatedTabs.forEach((t) => {
        const oldTab = data.tabs.find((orig) => orig.id === t.id);
        if (oldTab && oldTab.order !== t.order) {
          savePendingOperation(
            createWorkspaceOperation('TAB_UPDATE', t.id, { order: t.order })
          );
        }
      });

      // Update widgets
      const updatedWidgets = (data.widgets || []).map((w) =>
        orderMap.has(w.id)
          ? { ...w, order: orderMap.get(w.id)!, updatedAt: w.id === sourceId ? Date.now() : w.updatedAt }
          : w
      );

      updatedWidgets.forEach((w) => {
        const oldWidget = (data.widgets || []).find((orig) => orig.id === w.id);
        if (oldWidget && oldWidget.order !== w.order) {
          savePendingOperation(
            createWorkspaceOperation('WIDGET_UPDATE', w.id, { order: w.order })
          );
        }
      });

      saveWorkspaceData((prev) => ({
        ...prev,
        tabs: updatedTabs,
        widgets: updatedWidgets,
      }));
    },
    [data.tabs, data.widgets, saveWorkspaceData]
  );

  const reorderFavouriteTabs = useCallback(
    (sourceTabId: string, targetTabId: string, position: 'before' | 'after') => {
      reorderFavouriteItem(sourceTabId, targetTabId, position);
    },
    [reorderFavouriteItem]
  );

  const resetToDefault = useCallback(() => {
    clearStoredPendingOperations();
    saveWorkspaceData(DEFAULT_WORKSPACE);
  }, [saveWorkspaceData]);

  const applyLatestSnapshot = useCallback((snapshot: ArcableWorkspaceData) => {
    if (snapshot && Array.isArray(snapshot.spaces) && snapshot.spaces.length > 0) {
      // Always replay any remaining local unsynced pending operations on top of the remote snapshot.
      // This guarantees that any changes made locally while syncing was in flight (or offline)
      // are never reverted or overridden when the remote snapshot arrives.
      const pendingOps = getStoredPendingOperations();
      const resolvedSnapshot = pendingOps.length > 0
        ? replayOperations(snapshot, pendingOps)
        : snapshot;

      saveWorkspaceData((prev) => {
        const currentActive = prev.activeSpaceId;
        const activeSpaceStillExists = resolvedSnapshot.spaces.some((s) => s.id === currentActive);

        // Preserve in-memory local folder expand state as fallback
        const prevExpandMap = new Map<string, boolean>();
        prev.folders.forEach((f) => {
          if (f.isExpanded !== undefined) {
            prevExpandMap.set(f.id, f.isExpanded);
          }
        });

        const mergedFolders = (resolvedSnapshot.folders || []).map((f) => {
          const explicitExpand = f.isExpanded !== undefined
            ? f.isExpanded
            : (prevExpandMap.has(f.id)
                ? prevExpandMap.get(f.id)!
                : getLocalFolderExpanded(f.id, true));
          setLocalFolderExpanded(f.id, explicitExpand);
          return {
            ...f,
            isExpanded: explicitExpand,
          };
        });

        // Guard against resurrection: if the incoming snapshot contains tmp tabs
        // that were already locally deleted (not in prev.tmpTabs), suppress them.
        // This handles device-ID-mismatch scenarios where the Raindrop baseline
        // still holds the tab under a stale deviceId but the user deleted it locally.
        //
        // Rules:
        //  - If the tab is already in prev.tmpTabs → keep it (unchanged).
        //  - If the tab has a deviceId that differs from any known local ID → it's
        //    a genuine remote tab from another device → keep it.
        //  - Otherwise (same-device tab absent from prev) → it was deleted → suppress.
        const prevTmpIds = new Set((prev.tmpTabs || []).map((t) => t.id));
        // Also check pending delete ops for tabs whose op may not have been synced yet
        const latestPendingOps = getStoredPendingOperations();
        const pendingDeletedTmpIds = new Set<string>(
          latestPendingOps
            .filter((op) => op.type === 'TMP_TAB_DELETE')
            .map((op) => op.entityId)
        );

        const localDevId = typeof window !== 'undefined' ? getOrCreateDeviceId() : '';
        const isExt = detectDeviceType() === 'Ext';

        const filteredTmpTabs = (resolvedSnapshot.tmpTabs || []).filter((t) => {
          // Explicit pending delete → always suppress
          if (pendingDeletedTmpIds.has(t.id)) return false;
          // Already in local state → keep (no change)
          if (prevTmpIds.has(t.id)) return true;
          // If tab is from another device → genuine remote tab from another device → keep it!
          if (t.deviceId && t.deviceId !== localDevId) return true;
          // In web environment (no browser extension tabTracker), keep all incoming synced tmp tabs
          if (!isExt) return true;
          // For the local extension: if absent from prev and has browserTabId,
          // it's a local browser tab tracked by tabTracker (suppress to avoid duplication/resurrection)
          if (t.browserTabId !== undefined) return false;
          // No browserTabId: genuine remote tab from another device — keep it.
          return true;
        });

        return {
          spaces: resolvedSnapshot.spaces,
          folders: mergedFolders,
          tabs: resolvedSnapshot.tabs || [],
          tmpTabs: filteredTmpTabs,
          widgets: resolvedSnapshot.widgets || prev.widgets || [],
          customCodeRules: resolvedSnapshot.customCodeRules || prev.customCodeRules || [],
          runCodeInPageRules: resolvedSnapshot.runCodeInPageRules || prev.runCodeInPageRules || [],
          ...normalizeEnvironments(resolvedSnapshot.environmentVariables, resolvedSnapshot.environments),
          activeSpaceId: activeSpaceStillExists
            ? currentActive
            : (getSortedSpaces(resolvedSnapshot.spaces)[0]?.id || 'space_personal'),
          version: resolvedSnapshot.version || 1,
        };
      });
      return true;
    }
    return false;
  }, [saveWorkspaceData]);

  // Raindrop Sync Trigger
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const syncWithRaindropToken = useCallback(async (token: string, deviceName?: string): Promise<SyncResult> => {
    setIsSyncing(true);
    try {
      const deviceId = getOrCreateDeviceId();
      const pendingOps = getStoredPendingOperations();
      const syncedOpIds = pendingOps.map((op) => op.id);

      const result = await syncWorkspaceWithRaindrop(token, {
        localState: data,
        deviceId,
        deviceName,
        pendingOps,
      });

      setLastSyncResult(result);

      if (result.success) {
        removeStoredPendingOperations(syncedOpIds);
        if (result.latestSnapshot) {
          applyLatestSnapshot(result.latestSnapshot);
        }
      }

      return result;
    } finally {
      setIsSyncing(false);
    }
  }, [data, applyLatestSnapshot]);


  const importWorkspaceData = useCallback((imported: ArcableWorkspaceData) => {
    if (imported && Array.isArray(imported.spaces) && imported.spaces.length > 0) {
      saveWorkspaceData((prev) => {
        const currentActive = prev.activeSpaceId;
        const activeSpaceStillExists = imported.spaces.some((s) => s.id === currentActive);
        const mergedFolders = (imported.folders || []).map((f) => {
          const explicitExpand = f.isExpanded !== undefined ? f.isExpanded : true;
          setLocalFolderExpanded(f.id, explicitExpand);
          return {
            ...f,
            isExpanded: explicitExpand,
          };
        });
        return {
          spaces: imported.spaces,
          folders: mergedFolders,
          tabs: imported.tabs || [],
          tmpTabs: imported.tmpTabs || prev.tmpTabs || [],
          widgets: imported.widgets || prev.widgets || [],
          customCodeRules: imported.customCodeRules || prev.customCodeRules || [],
          runCodeInPageRules: imported.runCodeInPageRules || prev.runCodeInPageRules || [],
          ...normalizeEnvironments(imported.environmentVariables, imported.environments),
          activeSpaceId: activeSpaceStillExists
            ? currentActive
            : imported.spaces[0].id,
          version: imported.version || 1,
        };
      });
      return true;
    }
    return false;
  }, [saveWorkspaceData]);

  // Global favourites (visible across all spaces, sorted)
  const favouriteTabs = useMemo(
    () => getSortedTabs(data.tabs.filter((t) => Boolean(t.favourite))),
    [data.tabs]
  );

  // Global widgets (visible across all spaces, sorted)
  const widgets = useMemo(
    () => getSortedWidgets(data.widgets || []),
    [data.widgets]
  );

  // Helpers for filtering items by active space
  const currentSpaceId = activeSpace?.id || '';
  const pinnedTabs = useMemo(
    () =>
      getSortedTabs(
        data.tabs.filter((t) => !t.favourite && t.parentSpaceId === currentSpaceId && t.pinned)
      ),
    [data.tabs, currentSpaceId]
  );
  const rootTabs = useMemo(
    () =>
      data.tabs.filter(
        (t) => !t.favourite && t.parentSpaceId === currentSpaceId && !t.pinned && !t.parentFolderId
      ),
    [data.tabs, currentSpaceId]
  );
  const rootFolders = useMemo(
    () => data.folders.filter((f) => f.parentSpaceId === currentSpaceId && !f.parentFolderId),
    [data.folders, currentSpaceId]
  );

  const rootSiblings = useMemo(
    () => getSortedSiblings(data.folders, data.tabs, currentSpaceId, undefined),
    [data.folders, data.tabs, currentSpaceId]
  );

  const getChildFolders = useCallback((folderId: string) => {
    return data.folders.filter((f) => f.parentFolderId === folderId);
  }, [data.folders]);

  const getChildTabs = useCallback((folderId: string) => {
    return data.tabs.filter((t) => !t.favourite && t.parentFolderId === folderId && !t.pinned);
  }, [data.tabs]);

  const getChildSiblings = useCallback(
    (folderId: string) => {
      const folder = data.folders.find((f) => f.id === folderId);
      const spaceId = folder?.parentSpaceId || currentSpaceId;
      return getSortedSiblings(data.folders, data.tabs, spaceId, folderId);
    },
    [data.folders, data.tabs, currentSpaceId]
  );

  return {
    data,
    isLoaded,
    activeSpace,
    sortedSpaces,
    setActiveSpace,
    // Environment operations
    createEnvironment,
    updateEnvironment,
    deleteEnvironment,
    createEnvironmentVariable,
    renameEnvironmentVariable,
    deleteEnvironmentVariable,
    // Space operations
    createSpace,
    updateSpace,
    deleteSpace,
    convertSpaceToFolder,
    reorderSpaces,
    moveSpace,
    // Folder operations
    createFolder,
    updateFolder,
    deleteFolder,
    toggleFolderExpand,
    // Tab operations
    createTab,
    updateTab,
    deleteTab,
    duplicateTab,
    togglePinTab,
    toggleFavouriteTab,
    // Tmp Tab operations
    tmpTabs: data.tmpTabs || [],
    createTmpTab,
    updateTmpTab,
    deleteTmpTab,
    promoteTmpTab,
    // Widget operations
    widgets,
    addWidget,
    updateWidget,
    removeWidget,
    reorderWidget,
    // Sibling reordering
    reorderSiblingItem,
    moveSiblingItem,
    reorderPinnedTabs,
    reorderFavouriteTabs,
    reorderFavouriteItem,
    // Bulk/utility
    resetToDefault,
    importWorkspaceData,
    saveWorkspaceData,
    applyLatestSnapshot,
    // Raindrop sync
    syncWithRaindropToken,
    isSyncing,
    lastSyncResult,

    // Hierarchy queries
    favouriteTabs,
    pinnedTabs,
    rootTabs,
    rootFolders,
    rootSiblings,
    getChildFolders,
    getChildTabs,
    getChildSiblings,
  };
}
