'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Space, SpaceScheme, ZenThemeConfig, Folder, Tab, TmpTab, ArcableWorkspaceData, WorkspaceSiblingItem, WorkspaceWidget, WidgetStyle, WidgetSize, TabUrlVariant, VIRTUAL_SYNCED_TABS_SPACE_ID } from '../types/workspace';
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
import { syncWorkspaceWithRaindrop, numericRaindropId } from '../utils/raindropSync';
import { getDescendantFolderIds, getAllSpaceFolderIds, getDomain } from '../utils/treeUtils';


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

  return [...matchingTabs, ...matchingFolders].sort((a, b) => {
    // Items (tabs) are rendered before folders at every level of the workspace tree.
    if (a.type !== b.type) return a.type === 'tab' ? -1 : 1;
    if (a.order !== b.order) return a.order - b.order;
    return a.id.localeCompare(b.id);
  });
}

/** Picks a stable sparse order so a move normally updates only the moved item. */
export function getSparseOrderBetween(
  previousOrder: number | undefined,
  nextOrder: number | undefined,
  step: number = 1000
): number | undefined {
  const hasPrevious = Number.isFinite(previousOrder);
  const hasNext = Number.isFinite(nextOrder);
  if (hasPrevious && hasNext) {
    const gap = nextOrder! - previousOrder!;
    return gap > 1 ? previousOrder! + Math.floor(gap / 2) : undefined;
  }
  if (hasPrevious) return previousOrder! + step;
  if (hasNext) return nextOrder! - step;
  return step;
}

export const DEFAULT_WORKSPACE: ArcableWorkspaceData = {
  activeSpaceId: '',
  version: 1,
  spaces: [],
  folders: [],
  tabs: [],
  tmpTabs: [],
  widgets: [],
  customCodeRules: [],
  runCodeInPageRules: [],
};

/** Identifies the discontinued built-in demo workspace so it is never rendered or persisted again. */
export function isLegacyDemoWorkspace(data: ArcableWorkspaceData | null | undefined): boolean {
  if (!data || data.spaces?.length !== 2 || data.folders?.length !== 4 || data.tabs?.length !== 6) {
    return false;
  }

  const spaceIds = new Set(data.spaces.map((space) => space.id));
  const folderIds = new Set(data.folders.map((folder) => folder.id));
  const tabIds = new Set(data.tabs.map((tab) => tab.id));
  return (
    ['space_personal', 'space_work'].every((id) => spaceIds.has(id)) &&
    ['folder_dev', 'folder_docs', 'folder_reads', 'folder_work_projects'].every((id) => folderIds.has(id)) &&
    ['tab_arcable', 'tab_github', 'tab_mdn', 'tab_hn', 'tab_notion', 'tab_linear'].every((id) => tabIds.has(id))
  );
}

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

    // Spaces are optional for a workspace that only uses global favourites.
    // In particular, widgets, Custom JS/CSS, and Run Code do not belong to a
    // space, so resetting every zero-space snapshot hides them from the web
    // favourite shelf before it has a chance to render.
    const hasGlobalWorkspaceData = Boolean(
      parsed?.widgets?.length ||
      parsed?.tabs?.some((tab) => tab.favourite) ||
      parsed?.customCodeRules?.length ||
      parsed?.runCodeInPageRules?.length
    );

    if (
      !parsed ||
      isLegacyDemoWorkspace(parsed) ||
      !Array.isArray(parsed.spaces) ||
      (parsed.spaces.length === 0 && !hasGlobalWorkspaceData)
    ) {
      parsed = { ...DEFAULT_WORKSPACE };
    }

    const sorted = getSortedSpaces(parsed.spaces || []);
    const activeSpaceExists =
      parsed.activeSpaceId === VIRTUAL_SYNCED_TABS_SPACE_ID ||
      sorted.some((s) => s.id === parsed.activeSpaceId);
    const resolvedActiveSpaceId = activeSpaceExists
      ? parsed.activeSpaceId
      : (sorted[0]?.id || '');

    const initial: ArcableWorkspaceData = {
      raindropRootCollectionId: parsed.raindropRootCollectionId,
      raindropMetadataItemId: parsed.raindropMetadataItemId,
      spaces: parsed.spaces || [],
      folders: (parsed.folders || []).map((f) => {
        const isExp = f.isExpanded !== undefined ? f.isExpanded : getLocalFolderExpanded(f.id, true);
        setLocalFolderExpanded(f.id, isExp);
        return {
          ...f,
          isExpanded: isExp,
        };
      }),
      tabs: (parsed.tabs || []).map((t: Tab) => {
        if (!t.favourite && t.isGroup) {
          const { isGroup, ...rest } = t;
          return rest;
        }
        return t;
      }),
      tmpTabs: parsed.tmpTabs || [],
      widgets: parsed.widgets || [],
      customCodeRules: parsed.customCodeRules || [],
      runCodeInPageRules: parsed.runCodeInPageRules || [],
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

  // ================= Space CRUD =================
  const createSpace = useCallback((spaceInput: {
    name: string;
    emojiIcon?: string;
    coverUrl?: string;
    colors?: string;
    themeNoise?: number;
    themeScheme?: SpaceScheme;
    themeConfig?: ZenThemeConfig;
  }) => {
    const sorted = getSortedSpaces(data.spaces);
    const lastSpace = sorted[sorted.length - 1];
    const highestOrder = lastSpace
      ? (lastSpace.order !== undefined ? lastSpace.order : (lastSpace.createdAt || 0))
      : 0;

    const newSpace: Space = {
      id: generateId('space'),
      name: spaceInput.name.trim() || 'New Space',
      emojiIcon: spaceInput.emojiIcon || '📁',
      coverUrl: spaceInput.coverUrl,
      colors: spaceInput.colors,
      themeNoise: spaceInput.themeNoise,
      themeScheme: spaceInput.themeScheme,
      themeConfig: spaceInput.themeConfig,
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
    const normalizedUpdates = { ...updates };
    const opPayload: Record<string, any> = { ...normalizedUpdates };
    if ('emojiIcon' in updates) opPayload.emojiIcon = updates.emojiIcon ?? null;
    if ('coverUrl' in updates) opPayload.coverUrl = updates.coverUrl ?? null;
    if ('colors' in updates) opPayload.colors = updates.colors ?? null;
    if ('themeNoise' in updates) opPayload.themeNoise = updates.themeNoise ?? null;
    if ('themeScheme' in updates) opPayload.themeScheme = updates.themeScheme ?? null;
    if ('themeConfig' in updates) opPayload.themeConfig = updates.themeConfig ?? null;

    savePendingOperation(createWorkspaceOperation('SPACE_UPDATE', id, opPayload));

    saveWorkspaceData((prev) => ({
      ...prev,
      spaces: prev.spaces.map((s) =>
        s.id === id ? { ...s, ...normalizedUpdates, updatedAt: Date.now() } : s
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

  const archiveSpace = useCallback((id: string) => {
    const spaceToArchive = data.spaces.find((s) => s.id === id);
    savePendingOperation(
      createWorkspaceOperation('SPACE_ARCHIVE', id, {
        raindropId: spaceToArchive?.raindropId,
        themeRaindropId: spaceToArchive?.themeRaindropId,
      })
    );

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
    coverUrl?: string;
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
      coverUrl: folderInput.coverUrl,
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

      // Expanded/collapsed is intentionally per-device UI state. Do not put a
      // collapse-only change in the Raindrop outbox.
      const remotePayload = { ...opPayload };
      delete remotePayload.isExpanded;
      if (Object.keys(remotePayload).length > 0) {
        savePendingOperation(createWorkspaceOperation('FOLDER_UPDATE', id, remotePayload));
      }

      // Find all descendant folder IDs
      const descendantFolderIds = getDescendantFolderIds(id, prev.folders);

      // Cascade parentSpaceId to any descendant folders whose space changed
      const updatedFolders = prev.folders.map((f) => {
        if (f.id === id) {
          return { ...f, ...finalUpdates, updatedAt: Date.now() };
        }
        if (descendantFolderIds.has(f.id) && f.parentSpaceId !== targetSpaceId) {
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

      return {
        ...prev,
        folders: prev.folders.map((f) => {
          if (f.id !== id) return f;
          return { ...f, isExpanded: nextExpanded };
        }),
      };
    });
  }, [saveWorkspaceData]);

  const setAllFoldersExpanded = useCallback((spaceId: string, isExpanded: boolean) => {
    saveWorkspaceData((prev) => {
      const folderIdsInSpace = getAllSpaceFolderIds(spaceId, prev.folders);
      if (folderIdsInSpace.size === 0) return prev;

      folderIdsInSpace.forEach((folderId) => {
        setLocalFolderExpanded(folderId, isExpanded);
      });

      return {
        ...prev,
        folders: prev.folders.map((f) => {
          if (!folderIdsInSpace.has(f.id)) return f;
          return { ...f, isExpanded };
        }),
      };
    });
  }, [saveWorkspaceData]);

  const expandAllFolders = useCallback((spaceId: string) => {
    setAllFoldersExpanded(spaceId, true);
  }, [setAllFoldersExpanded]);

  const collapseAllFolders = useCallback((spaceId: string) => {
    setAllFoldersExpanded(spaceId, false);
  }, [setAllFoldersExpanded]);

  const deleteFolder = useCallback((id: string, recursive: boolean = true) => {
    saveWorkspaceData((prev) => {
      const descendantIds = recursive ? getDescendantFolderIds(id, prev.folders) : new Set<string>();
      const folderIdsToDelete = new Set<string>([id, ...descendantIds]);
      const deletedFolder = prev.folders.find((f) => f.id === id);
      const numericFolderId = /^\d+$/.test(id) ? Number(id) : undefined;

      folderIdsToDelete.forEach((fId) => {
        removeLocalFolderExpanded(fId);
      });

      if (!recursive) {
        prev.folders.forEach((folder) => {
          if (folder.parentFolderId === id) {
            savePendingOperation(createWorkspaceOperation('FOLDER_UPDATE', folder.id, {
              parentFolderId: deletedFolder?.parentFolderId ?? null,
            }));
          }
        });
        prev.tabs.forEach((tab) => {
          if (tab.parentFolderId === id) {
            savePendingOperation(createWorkspaceOperation('TAB_UPDATE', tab.id, {
              parentFolderId: deletedFolder?.parentFolderId ?? null,
            }));
          }
        });
      }
      savePendingOperation(createWorkspaceOperation('FOLDER_DELETE', id, {
        raindropId: deletedFolder?.raindropId || numericFolderId,
        recursive,
      }));

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

  const archiveFolder = useCallback((id: string) => {
    saveWorkspaceData((prev) => {
      const descendantIds = getDescendantFolderIds(id, prev.folders);
      const folderIdsToDelete = new Set<string>([id, ...descendantIds]);
      const archivedFolder = prev.folders.find((f) => f.id === id);
      const numericFolderId = /^\d+$/.test(id) ? Number(id) : undefined;

      folderIdsToDelete.forEach((fId) => {
        removeLocalFolderExpanded(fId);
      });

      savePendingOperation(createWorkspaceOperation('FOLDER_ARCHIVE', id, {
        raindropId: archivedFolder?.raindropId || numericFolderId,
      }));

      return {
        ...prev,
        folders: prev.folders.filter((f) => !folderIdsToDelete.has(f.id)),
        tabs: prev.tabs.filter((t) => !t.parentFolderId || !folderIdsToDelete.has(t.parentFolderId)),
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
    order?: number;
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
        favIconUrl: v.favIconUrl,
        customEmojiIcon: v.customEmojiIcon,
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
      maxOrder = Math.max(
        0,
        ...data.tabs.filter((t) => t.favourite).map((t) => (t.order !== undefined ? t.order : t.createdAt || 0)),
        ...(data.widgets || []).map((w) => (w.order !== undefined ? w.order : w.createdAt || 0))
      );
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
      order: tabInput.order !== undefined ? tabInput.order : maxOrder + 1000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    savePendingOperation(createWorkspaceOperation('TAB_CREATE', newTab.id, newTab));

    saveWorkspaceData((prev) => ({
      ...prev,
      tabs: [...prev.tabs, newTab],
    }));

    return newTab;
  }, [activeSpace, data.folders, data.tabs, data.widgets, saveWorkspaceData]);

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
            favIconUrl: v.favIconUrl,
            customEmojiIcon: v.customEmojiIcon,
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
      if ('urlVariants' in normalizedUpdates) {
        opPayload.urlVariants = normalizedUpdates.urlVariants ?? null;
        const currentVariants = currentTab.urlVariants || [];
        const nextVariants = normalizedUpdates.urlVariants || [];
        const deletedVariantIds = currentVariants
          .filter((cv) => !nextVariants.some((nv) => nv.id === cv.id))
          .map((v) => v.id);
        if (deletedVariantIds.length > 0) {
          opPayload.deletedVariantIds = deletedVariantIds;
        }
      }
      if ('defaultVariantId' in normalizedUpdates) opPayload.defaultVariantId = normalizedUpdates.defaultVariantId ?? null;
      if (normalizedUpdates.url) opPayload.url = normalizedUpdates.url;
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
    saveWorkspaceData((prev) => {
      const deletedTab = prev.tabs.find((tab) => tab.id === id);
      const numericTabId = /^\d+$/.test(id) ? Number(id) : undefined;
      const parent = deletedTab?.parentFolderId
        ? prev.folders.find((folder) => folder.id === deletedTab.parentFolderId)
        : prev.spaces.find((space) => space.id === deletedTab?.parentSpaceId);
      const numericParentId = parent && /^\d+$/.test(parent.id) ? Number(parent.id) : undefined;
      const secondaryVariantIds = (deletedTab?.urlVariants || [])
        .map((v) => numericRaindropId(v.id))
        .filter((vid): vid is number => Boolean(vid) && vid !== (deletedTab?.raindropId || numericTabId));
      savePendingOperation(createWorkspaceOperation('TAB_DELETE', id, {
        raindropId: deletedTab?.raindropId || numericTabId,
        variantRaindropIds: secondaryVariantIds.length > 0 ? secondaryVariantIds : undefined,
        collectionId: deletedTab?.favourite
          ? prev.raindropRootCollectionId
          : parent?.raindropId || numericParentId,
      }));

      // If the deleted tab is a group tab, also delete any child widgets belonging to it
      const childWidgets = (prev.widgets || []).filter((w) => w.parentGroupId === id);
      childWidgets.forEach((w) => {
        savePendingOperation(createWorkspaceOperation('WIDGET_DELETE', w.id, {
          raindropId: w.raindropId,
        }));
      });

      return {
        ...prev,
        tabs: prev.tabs.filter((t) => t.id !== id),
        widgets: (prev.widgets || []).filter((w) => w.parentGroupId !== id),
      };
    });
  }, [saveWorkspaceData]);

  const archiveTab = useCallback((id: string) => {
    saveWorkspaceData((prev) => {
      const archivedTab = prev.tabs.find((tab) => tab.id === id);
      const numericTabId = /^\d+$/.test(id) ? Number(id) : undefined;
      const parent = archivedTab?.parentFolderId
        ? prev.folders.find((folder) => folder.id === archivedTab.parentFolderId)
        : prev.spaces.find((space) => space.id === archivedTab?.parentSpaceId);
      const numericParentId = parent && /^\d+$/.test(parent.id) ? Number(parent.id) : undefined;
      const secondaryVariantIds = (archivedTab?.urlVariants || [])
        .map((v) => numericRaindropId(v.id))
        .filter((vid): vid is number => Boolean(vid) && vid !== (archivedTab?.raindropId || numericTabId));
      savePendingOperation(createWorkspaceOperation('TAB_ARCHIVE', id, {
        raindropId: archivedTab?.raindropId || numericTabId,
        variantRaindropIds: secondaryVariantIds.length > 0 ? secondaryVariantIds : undefined,
        collectionId: archivedTab?.favourite
          ? prev.raindropRootCollectionId
          : parent?.raindropId || numericParentId,
      }));
      return {
        ...prev,
        tabs: prev.tabs.filter((t) => t.id !== id),
      };
    });
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

    let nextOrder = existing?.order;
    if (nextFavourite) {
      const existingWidgets = data.widgets || [];
      const favTabs = data.tabs.filter((t) => Boolean(t.favourite) && t.id !== id);
      const maxOrder = Math.max(
        0,
        ...existingWidgets.map((w) => (w.order !== undefined ? w.order : w.createdAt || 0)),
        ...favTabs.map((t) => (t.order !== undefined ? t.order : t.createdAt || 0))
      );
      nextOrder = maxOrder + 1000;
    }

    const updates: Partial<Tab> = nextFavourite
      ? {
          favourite: true,
          pinned: false,
          order: nextOrder,
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
          order: nextOrder,
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
  }, [activeSpace, data.spaces, data.tabs, data.widgets, saveWorkspaceData]);

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
              favIconUrl: v.favIconUrl,
              customEmojiIcon: v.customEmojiIcon,
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
    saveWorkspaceData((prev) => ({
      ...prev,
      tmpTabs: (prev.tmpTabs || []).filter((t) => t.id !== id),
    }));
  }, [saveWorkspaceData]);

  const promoteTmpTab = useCallback((tmpTab: TmpTab, targetSpaceId?: string, targetFolderId?: string, order?: number) => {
    const savedTab = createTab({
      url: tmpTab.url,
      customTitle: tmpTab.customTitle || tmpTab.title,
      favIconUrl: tmpTab.favIconUrl,
      parentSpaceId: targetSpaceId || activeSpace?.id,
      parentFolderId: targetFolderId,
      order,
    });

    deleteTmpTab(tmpTab.id);

    return savedTab;
  }, [activeSpace, createTab, deleteTmpTab]);

  // ================= Widget Operations =================
  const addWidget = useCallback(
    (widgetInput: {
      style: WidgetStyle;
      size?: WidgetSize;
      config?: Record<string, any>;
      parentGroupId?: string;
    }) => {
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
        parentGroupId: widgetInput.parentGroupId || undefined,
        order: maxOrder + 1000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      savePendingOperation(createWorkspaceOperation('WIDGET_CREATE', newWidget.id, newWidget));

      saveWorkspaceData((prev) => {
        if ((prev.widgets || []).some((w) => w.id === newWidget.id)) {
          return prev;
        }

        let updatedTabs = prev.tabs;
        if (widgetInput.parentGroupId) {
          const groupTab = prev.tabs.find((t) => t.id === widgetInput.parentGroupId);
          if (groupTab) {
            const nextGroupItemOrder = [
              ...(groupTab.groupItemOrder || []),
              { type: 'widget' as const, id: newWidget.id },
            ];
            const updatedGroupTab: Tab = {
              ...groupTab,
              isGroup: true,
              groupItemOrder: nextGroupItemOrder,
              updatedAt: Date.now(),
            };
            savePendingOperation(
              createWorkspaceOperation('TAB_UPDATE', groupTab.id, {
                isGroup: true,
                groupItemOrder: nextGroupItemOrder,
              })
            );
            updatedTabs = prev.tabs.map((t) => (t.id === groupTab.id ? updatedGroupTab : t));
          }
        }

        return {
          ...prev,
          tabs: updatedTabs,
          widgets: [...(prev.widgets || []), newWidget],
        };
      });

      return newWidget;
    },
    [data.widgets, data.tabs, saveWorkspaceData]
  );

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
    saveWorkspaceData((prev) => {
      const deletedWidget = (prev.widgets || []).find((w) => w.id === id);
      savePendingOperation(createWorkspaceOperation('WIDGET_DELETE', id, {
        raindropId: deletedWidget?.raindropId,
      }));

      // If this widget was part of a group, clean up the group
      let updatedTabs = prev.tabs;
      if (deletedWidget?.parentGroupId) {
        const groupTab = prev.tabs.find((t) => t.id === deletedWidget.parentGroupId);
        if (groupTab) {
          const remainingWidgets = (prev.widgets || []).filter((w) => w.id !== id && w.parentGroupId === groupTab.id);
          const remainingVariants = (groupTab.urlVariants || []).filter((v) => Boolean(v.url));

          if (remainingWidgets.length === 0 && remainingVariants.length === 0) {
            const numericSourceId = /^\d+$/.test(groupTab.id) ? Number(groupTab.id) : undefined;
            savePendingOperation(
              createWorkspaceOperation('TAB_DELETE', groupTab.id, {
                raindropId: groupTab.raindropId || numericSourceId,
                collectionId: prev.raindropRootCollectionId,
              })
            );
            updatedTabs = prev.tabs.filter((t) => t.id !== groupTab.id);
          } else if (remainingWidgets.length === 0 && remainingVariants.length === 1) {
            const onlyVariant = remainingVariants[0];
            const revertedTab: Tab = {
              ...groupTab,
              customTitle: onlyVariant.name || groupTab.customTitle,
              url: onlyVariant.url || groupTab.url,
              favIconUrl: onlyVariant.favIconUrl || groupTab.favIconUrl,
              customEmojiIcon: onlyVariant.customEmojiIcon || groupTab.customEmojiIcon,
              isGroup: false,
              urlVariants: undefined,
              defaultVariantId: undefined,
              groupItemOrder: undefined,
              updatedAt: Date.now(),
            };
            savePendingOperation(
              createWorkspaceOperation('TAB_UPDATE', groupTab.id, {
                title: revertedTab.customTitle,
                url: revertedTab.url,
                favIconUrl: revertedTab.favIconUrl,
                customEmojiIcon: revertedTab.customEmojiIcon,
                isGroup: false,
                urlVariants: null,
                defaultVariantId: null,
                groupItemOrder: null,
              })
            );
            updatedTabs = prev.tabs.map((t) => (t.id === groupTab.id ? revertedTab : t));
          } else {
            const nextGroupItemOrder = (groupTab.groupItemOrder || []).filter((e) => e.id !== id);
            const updatedGroupTab: Tab = {
              ...groupTab,
              groupItemOrder: nextGroupItemOrder.length > 0 ? nextGroupItemOrder : undefined,
              updatedAt: Date.now(),
            };
            savePendingOperation(
              createWorkspaceOperation('TAB_UPDATE', groupTab.id, {
                groupItemOrder: updatedGroupTab.groupItemOrder || null,
              })
            );
            updatedTabs = prev.tabs.map((t) => (t.id === groupTab.id ? updatedGroupTab : t));
          }
        }
      }

      return {
        ...prev,
        tabs: updatedTabs,
        widgets: (prev.widgets || []).filter((w) => w.id !== id),
      };
    });
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

    const reindexed = sorted.map((w, idx) => {
      const newOrder = (idx + 1) * 1000;
      return {
        ...w,
        order: newOrder,
        updatedAt: w.id === sourceId || w.order !== newOrder ? Date.now() : w.updatedAt,
      };
    });

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

      const reindexed = sorted.map((s, idx) => {
        const newOrder = (idx + 1) * 1000;
        return {
          ...s,
          order: newOrder,
          updatedAt: s.id === sourceSpaceId || s.order !== newOrder ? Date.now() : s.updatedAt,
        };
      });

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

      const reindexed = sorted.map((s, i) => {
        const newOrder = (i + 1) * 1000;
        return {
          ...s,
          order: newOrder,
          updatedAt: s.id === spaceId || s.order !== newOrder ? Date.now() : s.updatedAt,
        };
      });

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

      // Items and folders are grouped separately in the same level (items/tabs first, then folders).
      // 1. Prevent dragging folders onto tab items.
      if (sourceType === 'folder' && targetType === 'tab') {
        return;
      }

      // 2. Prevent dragging tab items to before or after folders (only dropping inside a folder is allowed).
      if (sourceType === 'tab' && targetType === 'folder' && position !== 'inside') {
        return;
      }

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

      const updatedOrderMap = new Map<string, number>();

      if (sourceType === 'folder') {
        const sourceItem = { type: 'folder' as const, data: sourceFolder!, id: sourceId, order: 0 };
        const folderSiblings = siblings.filter((s): s is WorkspaceSiblingItem & { type: 'folder' } => s.type === 'folder');
        let targetIdx = folderSiblings.findIndex((s) => s.id === targetId);
        if (targetIdx < 0) {
          targetIdx = position === 'before' ? 0 : folderSiblings.length;
        }
        const insertIdx = position === 'before' ? targetIdx : targetIdx + 1;
        folderSiblings.splice(Math.max(0, Math.min(insertIdx, folderSiblings.length)), 0, sourceItem);
        folderSiblings.forEach((s, idx) => {
          updatedOrderMap.set(s.id, (idx + 1) * 1000);
        });
      } else {
        const sourceItem = { type: 'tab' as const, data: sourceTab!, id: sourceId, order: 0 };
        const tabSiblings = siblings.filter((s): s is WorkspaceSiblingItem & { type: 'tab' } => s.type === 'tab');
        let targetIdx = tabSiblings.findIndex((s) => s.id === targetId);
        if (targetIdx < 0) {
          targetIdx = position === 'before' ? 0 : tabSiblings.length;
        }
        const insertIdx = position === 'before' ? targetIdx : targetIdx + 1;
        tabSiblings.splice(Math.max(0, Math.min(insertIdx, tabSiblings.length)), 0, sourceItem);
        tabSiblings.forEach((s, idx) => {
          updatedOrderMap.set(s.id, (idx + 1) * 1000);
        });
      }

      const descendantFolderIds =
        sourceType === 'folder'
          ? getDescendantFolderIds(sourceId, data.folders)
          : new Set<string>();

      const updatedFolders = data.folders.map((f) => {
        const newOrder = updatedOrderMap.get(f.id);
        const orderChanged = newOrder !== undefined && newOrder !== f.order;
        if (f.id === sourceId) {
          return {
            ...f,
            parentSpaceId,
            parentFolderId: parentFolderId || undefined,
            order: newOrder ?? f.order ?? 1000,
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
        if (newOrder !== undefined) {
          return {
            ...f,
            order: newOrder,
            updatedAt: orderChanged ? Date.now() : f.updatedAt,
          };
        }
        return f;
      });

      const updatedTabs = data.tabs.map((t) => {
        const newOrder = updatedOrderMap.get(t.id);
        const orderChanged = newOrder !== undefined && newOrder !== t.order;
        if (t.id === sourceId) {
          return {
            ...t,
            parentSpaceId,
            parentFolderId: parentFolderId || undefined,
            pinned: false,
            favourite: false,
            order: newOrder ?? t.order ?? 1000,
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
        if (newOrder !== undefined) {
          return {
            ...t,
            order: newOrder,
            updatedAt: orderChanged ? Date.now() : t.updatedAt,
          };
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
      const updatedOrderMap = new Map<string, number>();

      if (itemType === 'folder') {
        const folderSiblings = siblings.filter((s) => s.type === 'folder');
        const idx = folderSiblings.findIndex((s) => s.id === itemId);
        if (idx < 0) return;

        const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= folderSiblings.length) return;

        const [moved] = folderSiblings.splice(idx, 1);
        folderSiblings.splice(targetIdx, 0, moved);

        folderSiblings.forEach((s, i) => {
          updatedOrderMap.set(s.id, (i + 1) * 1000);
        });
      } else {
        const tabSiblings = siblings.filter((s) => s.type === 'tab');
        const idx = tabSiblings.findIndex((s) => s.id === itemId);
        if (idx < 0) return;

        const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= tabSiblings.length) return;

        const [moved] = tabSiblings.splice(idx, 1);
        tabSiblings.splice(targetIdx, 0, moved);

        tabSiblings.forEach((s, i) => {
          updatedOrderMap.set(s.id, (i + 1) * 1000);
        });
      }

      const updatedFolders = data.folders.map((f) => {
        const newOrder = updatedOrderMap.get(f.id);
        if (newOrder !== undefined) {
          return {
            ...f,
            order: newOrder,
            updatedAt: f.id === itemId || f.order !== newOrder ? Date.now() : f.updatedAt,
          };
        }
        return f;
      });
      const updatedTabs = data.tabs.map((t) => {
        const newOrder = updatedOrderMap.get(t.id);
        if (newOrder !== undefined) {
          return {
            ...t,
            order: newOrder,
            updatedAt: t.id === itemId || t.order !== newOrder ? Date.now() : t.updatedAt,
          };
        }
        return t;
      });

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

      const updatedTabs = data.tabs.map((t) => {
        const newOrder = orderMap.get(t.id);
        if (newOrder !== undefined) {
          return {
            ...t,
            order: newOrder,
            updatedAt: t.id === sourceTabId || t.order !== newOrder ? Date.now() : t.updatedAt,
          };
        }
        return t;
      });

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
      const currentWidgets: FavItem[] = getSortedWidgets(data.widgets || [])
        .filter((w) => !w.parentGroupId)
        .map((w) => ({
          id: w.id,
          type: 'widget' as const,
          order: w.order,
          createdAt: w.createdAt,
        }));

      const allItems: FavItem[] = [...favTabs, ...currentWidgets].sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) {
          if (a.order !== b.order) return a.order - b.order;
          return (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id);
        }
        if (a.order !== undefined) return -1;
        if (b.order !== undefined) return 1;
        return (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id);
      });
      const originalOrder = allItems.map((item) => item.id);

      const sourceIdx = allItems.findIndex((i) => i.id === sourceId);
      const targetIdx = allItems.findIndex((i) => i.id === targetId);
      if (targetIdx < 0) return;

      const sourceWidget = (data.widgets || []).find((w) => w.id === sourceId);
      let moved: FavItem;
      let extractedFromGroupId: string | undefined = undefined;

      if (sourceIdx < 0 && sourceWidget && sourceWidget.parentGroupId) {
        // Dragged out of a group onto the root shelf!
        extractedFromGroupId = sourceWidget.parentGroupId;
        moved = { id: sourceWidget.id, type: 'widget', createdAt: sourceWidget.createdAt };
      } else if (sourceIdx >= 0) {
        [moved] = allItems.splice(sourceIdx, 1);
      } else {
        return;
      }

      const newTargetIdx = allItems.findIndex((i) => i.id === targetId);
      const insertIdx = position === 'before' ? newTargetIdx : newTargetIdx + 1;
      allItems.splice(insertIdx, 0, moved);

      if (!extractedFromGroupId && allItems.every((item, index) => item.id === originalOrder[index])) return;

      const orderMap = new Map<string, number>();
      allItems.forEach((item, idx) => {
        orderMap.set(item.id, (idx + 1) * 1000);
      });

      // Update tabs (and clean up groupItemOrder if extracted from a group)
      const updatedTabs = data.tabs.map((t) => {
        const newOrder = orderMap.get(t.id);
        let updatedTab = t;
        if (extractedFromGroupId && t.id === extractedFromGroupId) {
          const nextOrder = (t.groupItemOrder || []).filter((e) => e.id !== sourceId);
          updatedTab = {
            ...updatedTab,
            groupItemOrder: nextOrder.length > 0 ? nextOrder : undefined,
          };
          savePendingOperation(
            createWorkspaceOperation('TAB_UPDATE', t.id, {
              groupItemOrder: updatedTab.groupItemOrder || null,
            })
          );
        }
        if (newOrder !== undefined) {
          return {
            ...updatedTab,
            order: newOrder,
            updatedAt: t.id === sourceId || t.order !== newOrder ? Date.now() : t.updatedAt,
          };
        }
        return updatedTab;
      });

      updatedTabs.forEach((t) => {
        const oldTab = data.tabs.find((orig) => orig.id === t.id);
        if (oldTab && oldTab.order !== t.order) {
          savePendingOperation(
            createWorkspaceOperation('TAB_UPDATE', t.id, { order: t.order })
          );
        }
      });

      // Update widgets
      const updatedWidgets = (data.widgets || []).map((w) => {
        const newOrder = orderMap.get(w.id);
        const isExtracted = extractedFromGroupId && w.id === sourceId;
        if (newOrder !== undefined || isExtracted) {
          return {
            ...w,
            parentGroupId: isExtracted ? undefined : w.parentGroupId,
            order: newOrder !== undefined ? newOrder : w.order,
            updatedAt: w.id === sourceId || w.order !== newOrder ? Date.now() : w.updatedAt,
          };
        }
        return w;
      });

      if (extractedFromGroupId) {
        savePendingOperation(
          createWorkspaceOperation('WIDGET_UPDATE', sourceId, {
            parentGroupId: null,
            order: orderMap.get(sourceId),
          })
        );
      }

      updatedWidgets.forEach((w) => {
        if (w.id === sourceId && extractedFromGroupId) return;
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

  const reorderGroupVariants = useCallback(
    (groupTabId: string, sourceItemId: string, targetItemId: string, position: 'before' | 'after') => {
      saveWorkspaceData((prev) => {
        const tab = prev.tabs.find((t) => t.id === groupTabId);
        if (!tab || sourceItemId === targetItemId) return prev;

        const childWidgets = (prev.widgets || []).filter((w) => w.parentGroupId === groupTabId);
        const variants = tab.urlVariants || [];

        // Build current unified item list
        let existingOrder = tab.groupItemOrder ? [...tab.groupItemOrder] : [];
        const knownIds = new Set(existingOrder.map((e) => e.id));

        for (const v of variants) {
          if (!knownIds.has(v.id)) {
            existingOrder.push({ type: 'tab', id: v.id });
            knownIds.add(v.id);
          }
        }
        for (const w of childWidgets) {
          if (!knownIds.has(w.id)) {
            existingOrder.push({ type: 'widget', id: w.id });
            knownIds.add(w.id);
          }
        }

        const sourceIndex = existingOrder.findIndex((e) => e.id === sourceItemId);
        if (sourceIndex === -1) return prev;
        const [moved] = existingOrder.splice(sourceIndex, 1);
        let targetIndex = existingOrder.findIndex((e) => e.id === targetItemId);
        if (targetIndex === -1) return prev;
        if (position === 'after') targetIndex += 1;
        existingOrder.splice(targetIndex, 0, moved);

        // Sort urlVariants to match relative order in existingOrder
        const nextVariants = [...variants].sort((a, b) => {
          const idxA = existingOrder.findIndex((e) => e.id === a.id);
          const idxB = existingOrder.findIndex((e) => e.id === b.id);
          return (idxA === -1 ? 9999 : idxA) - (idxB === -1 ? 9999 : idxB);
        });

        const nextDefaultVariantId = nextVariants[0]?.id || tab.defaultVariantId;
        const nextUrl = nextVariants[0]?.url || tab.url;

        const updatedTab: Tab = {
          ...tab,
          urlVariants: nextVariants.length > 0 ? nextVariants : tab.urlVariants,
          defaultVariantId: nextDefaultVariantId,
          url: nextUrl,
          groupItemOrder: existingOrder,
          updatedAt: Date.now(),
        };

        const opPayload: Record<string, any> = {
          urlVariants: updatedTab.urlVariants,
          defaultVariantId: nextDefaultVariantId,
          url: nextUrl,
          groupItemOrder: existingOrder,
          updatedAt: updatedTab.updatedAt,
        };
        savePendingOperation(createWorkspaceOperation('TAB_UPDATE', groupTabId, opPayload));

        return {
          ...prev,
          tabs: prev.tabs.map((t) => (t.id === groupTabId ? updatedTab : t)),
        };
      });
    },
    [saveWorkspaceData]
  );

  const mergeTabsIntoGroup = useCallback(
    (sourceId: string, targetId: string) => {
      saveWorkspaceData((prev) => {
        if (sourceId === targetId) return prev;

        const sourceTab = prev.tabs.find((t) => t.id === sourceId);
        const sourceWidget = (prev.widgets || []).find((w) => w.id === sourceId);
        const targetTab = prev.tabs.find((t) => t.id === targetId);
        const targetWidget = (prev.widgets || []).find((w) => w.id === targetId);

        // Case 1: Widget onto Widget -> create new group tab holding both widgets
        if (sourceWidget && targetWidget) {
          const groupId = generateId('tab');
          const groupOrder = targetWidget.order ?? 0;
          const groupItemOrder: Array<{ type: 'tab' | 'widget'; id: string }> = [
            { type: 'widget', id: targetWidget.id },
            { type: 'widget', id: sourceWidget.id },
          ];

          const newGroupTab: Tab = {
            id: groupId,
            url: 'https://arcable.dev',
            favourite: true,
            pinned: false,
            isGroup: true,
            customTitle: 'Group',
            order: groupOrder,
            groupItemOrder,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };

          savePendingOperation(
            createWorkspaceOperation('TAB_CREATE', groupId, {
              url: newGroupTab.url,
              title: newGroupTab.customTitle,
              customTitle: newGroupTab.customTitle,
              favourite: true,
              isGroup: true,
              order: groupOrder,
              groupItemOrder,
            })
          );

          savePendingOperation(
            createWorkspaceOperation('WIDGET_UPDATE', targetWidget.id, {
              parentGroupId: groupId,
            })
          );
          savePendingOperation(
            createWorkspaceOperation('WIDGET_UPDATE', sourceWidget.id, {
              parentGroupId: groupId,
            })
          );

          const updatedWidgets = (prev.widgets || []).map((w) => {
            if (w.id === targetWidget.id || w.id === sourceWidget.id) {
              return { ...w, parentGroupId: groupId, updatedAt: Date.now() };
            }
            return w;
          });

          return {
            ...prev,
            tabs: [...prev.tabs, newGroupTab],
            widgets: updatedWidgets,
          };
        }

        // Case 2: Widget onto Tab (or Group Tab)
        if (sourceWidget && targetTab) {
          const targetBaseId = targetTab.raindropId ? String(targetTab.raindropId) : targetTab.id;
          const existingVariants: TabUrlVariant[] =
            targetTab.urlVariants && targetTab.urlVariants.length > 0
              ? targetTab.urlVariants
              : [
                  {
                    id: targetBaseId || generateId('var'),
                    name: targetTab.customTitle?.trim() || getDomain(targetTab.url) || 'Item 1',
                    url: targetTab.url,
                    favIconUrl: targetTab.favIconUrl,
                    customEmojiIcon: targetTab.customEmojiIcon,
                  },
                ];

          const existingOrder: Array<{ type: 'tab' | 'widget'; id: string }> = targetTab.groupItemOrder
            ? [...targetTab.groupItemOrder]
            : existingVariants.map((v) => ({ type: 'tab', id: v.id }));

          if (!existingOrder.some((e) => e.id === sourceWidget.id)) {
            existingOrder.push({ type: 'widget', id: sourceWidget.id });
          }

          const defaultVariant =
            (targetTab.defaultVariantId && existingVariants.find((v) => v.id === targetTab.defaultVariantId)) ||
            existingVariants[0];
          const groupTitle = targetTab.customTitle?.trim() || 'Group';

          const updatedTarget: Tab = {
            ...targetTab,
            customTitle: groupTitle,
            url: defaultVariant.url,
            urlVariants: existingVariants,
            defaultVariantId: defaultVariant.id,
            groupItemOrder: existingOrder,
            isGroup: true,
            updatedAt: Date.now(),
          };

          savePendingOperation(
            createWorkspaceOperation('TAB_UPDATE', targetTab.id, {
              title: groupTitle,
              customTitle: groupTitle,
              isGroup: true,
              url: defaultVariant.url,
              urlVariants: existingVariants,
              defaultVariantId: defaultVariant.id,
              groupItemOrder: existingOrder,
            })
          );

          savePendingOperation(
            createWorkspaceOperation('WIDGET_UPDATE', sourceWidget.id, {
              parentGroupId: targetTab.id,
            })
          );

          const updatedWidgets = (prev.widgets || []).map((w) =>
            w.id === sourceWidget.id ? { ...w, parentGroupId: targetTab.id, updatedAt: Date.now() } : w
          );

          return {
            ...prev,
            tabs: prev.tabs.map((t) => (t.id === targetTab.id ? updatedTarget : t)),
            widgets: updatedWidgets,
          };
        }

        // Case 3: Tab onto Widget
        if (sourceTab && targetWidget) {
          const sourceBaseId = sourceTab.raindropId ? String(sourceTab.raindropId) : sourceTab.id;
          const sourceVariants: TabUrlVariant[] =
            sourceTab.urlVariants && sourceTab.urlVariants.length > 0
              ? sourceTab.urlVariants
              : [
                  {
                    id: sourceBaseId || generateId('var'),
                    name: sourceTab.customTitle?.trim() || getDomain(sourceTab.url) || 'Item 1',
                    url: sourceTab.url,
                    favIconUrl: sourceTab.favIconUrl,
                    customEmojiIcon: sourceTab.customEmojiIcon,
                  },
                ];

          const groupItemOrder: Array<{ type: 'tab' | 'widget'; id: string }> = [
            { type: 'widget', id: targetWidget.id },
            ...sourceVariants.map((v) => ({ type: 'tab' as const, id: v.id })),
          ];

          const defaultVariant =
            (sourceTab.defaultVariantId && sourceVariants.find((v) => v.id === sourceTab.defaultVariantId)) ||
            sourceVariants[0];
          const groupTitle = sourceTab.customTitle?.trim() || 'Group';

          const updatedTab: Tab = {
            ...sourceTab,
            customTitle: groupTitle,
            url: defaultVariant.url,
            urlVariants: sourceVariants,
            defaultVariantId: defaultVariant.id,
            groupItemOrder,
            isGroup: true,
            order: targetWidget.order ?? sourceTab.order,
            updatedAt: Date.now(),
          };

          savePendingOperation(
            createWorkspaceOperation('TAB_UPDATE', sourceTab.id, {
              title: groupTitle,
              customTitle: groupTitle,
              isGroup: true,
              url: defaultVariant.url,
              urlVariants: sourceVariants,
              defaultVariantId: defaultVariant.id,
              groupItemOrder,
              order: updatedTab.order,
            })
          );

          savePendingOperation(
            createWorkspaceOperation('WIDGET_UPDATE', targetWidget.id, {
              parentGroupId: sourceTab.id,
            })
          );

          const updatedWidgets = (prev.widgets || []).map((w) =>
            w.id === targetWidget.id ? { ...w, parentGroupId: sourceTab.id, updatedAt: Date.now() } : w
          );

          return {
            ...prev,
            tabs: prev.tabs.map((t) => (t.id === sourceTab.id ? updatedTab : t)),
            widgets: updatedWidgets,
          };
        }

        // Case 4: Tab onto Tab
        if (!sourceTab || !targetTab) return prev;

        const targetBaseId = targetTab.raindropId ? String(targetTab.raindropId) : targetTab.id;
        const targetVariants: TabUrlVariant[] =
          targetTab.urlVariants && targetTab.urlVariants.length > 0
            ? targetTab.urlVariants.map((v, i) => ({
                ...v,
                favIconUrl: v.favIconUrl || (i === 0 ? targetTab.favIconUrl : undefined),
                customEmojiIcon: v.customEmojiIcon || (i === 0 ? targetTab.customEmojiIcon : undefined),
              }))
            : [
                {
                  id: targetBaseId || generateId('var'),
                  name: targetTab.customTitle?.trim() || getDomain(targetTab.url) || 'Item 1',
                  url: targetTab.url,
                  favIconUrl: targetTab.favIconUrl,
                  customEmojiIcon: targetTab.customEmojiIcon,
                },
              ];

        const sourceBaseId = sourceTab.raindropId ? String(sourceTab.raindropId) : sourceTab.id;
        const sourceVariants: TabUrlVariant[] =
          sourceTab.urlVariants && sourceTab.urlVariants.length > 0
            ? sourceTab.urlVariants.map((v, i) => ({
                ...v,
                favIconUrl: v.favIconUrl || (i === 0 ? sourceTab.favIconUrl : undefined),
                customEmojiIcon: v.customEmojiIcon || (i === 0 ? sourceTab.customEmojiIcon : undefined),
              }))
            : [
                {
                  id: sourceBaseId || generateId('var'),
                  name: sourceTab.customTitle?.trim() || getDomain(sourceTab.url) || 'Item 2',
                  url: sourceTab.url,
                  favIconUrl: sourceTab.favIconUrl,
                  customEmojiIcon: sourceTab.customEmojiIcon,
                },
              ];

        // Deduplicate variants by URL to prevent identical duplicates from accumulating
        const combinedVariants = [...targetVariants, ...sourceVariants];
        const seenUrls = new Set<string>();
        const mergedVariants: TabUrlVariant[] = [];
        for (const variant of combinedVariants) {
          const urlKey = (variant.url || '').trim().toLowerCase();
          if (urlKey && seenUrls.has(urlKey)) {
            continue;
          }
          if (urlKey) seenUrls.add(urlKey);
          mergedVariants.push(variant);
        }
        if (mergedVariants.length === 0 && combinedVariants.length > 0) {
          mergedVariants.push(combinedVariants[0]);
        }

        const defaultVariant =
          (targetTab.defaultVariantId && mergedVariants.find((v) => v.id === targetTab.defaultVariantId)) ||
          mergedVariants[0];
        const groupTitle = targetTab.customTitle?.trim() || 'Group';

        // Keep existing child widgets in the group's item order
        const targetChildWidgets = (prev.widgets || []).filter((w) => w.parentGroupId === targetTab.id);
        const sourceChildWidgets = (prev.widgets || []).filter((w) => w.parentGroupId === sourceTab.id);

        const groupItemOrder: Array<{ type: 'tab' | 'widget'; id: string }> = [
          ...mergedVariants.map((v) => ({ type: 'tab' as const, id: v.id })),
          ...targetChildWidgets.map((w) => ({ type: 'widget' as const, id: w.id })),
          ...sourceChildWidgets.map((w) => ({ type: 'widget' as const, id: w.id })),
        ];

        const updatedTarget: Tab = {
          ...targetTab,
          customTitle: groupTitle,
          url: defaultVariant.url,
          urlVariants: mergedVariants,
          defaultVariantId: defaultVariant.id,
          groupItemOrder,
          isGroup: true,
          updatedAt: Date.now(),
        };

        // 1. Update target tab with merged variants
        savePendingOperation(
          createWorkspaceOperation('TAB_UPDATE', targetTab.id, {
            title: groupTitle,
            customTitle: groupTitle,
            isGroup: true,
            url: defaultVariant.url,
            urlVariants: mergedVariants,
            defaultVariantId: defaultVariant.id,
            groupItemOrder,
          })
        );

        // If sourceTab had child widgets, re-assign their parentGroupId to targetTab.id
        if (sourceChildWidgets.length > 0) {
          sourceChildWidgets.forEach((w) => {
            savePendingOperation(
              createWorkspaceOperation('WIDGET_UPDATE', w.id, {
                parentGroupId: targetTab.id,
              })
            );
          });
        }

        // 2. Delete source tab, while preserving any remote IDs that were absorbed into mergedVariants
        const numericSourceId = /^\d+$/.test(sourceTab.id) ? Number(sourceTab.id) : undefined;
        const sourceRemoteId = sourceTab.raindropId || numericSourceId;
        const parent = sourceTab.parentFolderId
          ? prev.folders.find((f) => f.id === sourceTab.parentFolderId)
          : prev.spaces.find((s) => s.id === sourceTab.parentSpaceId);
        const numericParentId = parent && /^\d+$/.test(parent.id) ? Number(parent.id) : undefined;

        const isSourceAbsorbed =
          Boolean(sourceRemoteId) &&
          mergedVariants.some((v) => numericRaindropId(v.id) === sourceRemoteId);

        const secondaryVariantIds = (sourceTab.urlVariants || [])
          .map((v) => numericRaindropId(v.id))
          .filter(
            (vid): vid is number =>
              Boolean(vid) &&
              vid !== sourceRemoteId &&
              !mergedVariants.some((mv) => numericRaindropId(mv.id) === vid)
          );

        savePendingOperation(
          createWorkspaceOperation('TAB_DELETE', sourceTab.id, {
            raindropId: isSourceAbsorbed ? undefined : sourceRemoteId,
            variantRaindropIds: secondaryVariantIds.length > 0 ? secondaryVariantIds : undefined,
            collectionId: sourceTab.favourite
              ? prev.raindropRootCollectionId
              : parent?.raindropId || numericParentId,
          })
        );

        const updatedWidgets = (prev.widgets || []).map((w) => {
          if (w.parentGroupId === sourceTab.id) {
            return { ...w, parentGroupId: targetTab.id, updatedAt: Date.now() };
          }
          return w;
        });

        return {
          ...prev,
          tabs: prev.tabs
            .filter((t) => t.id !== sourceId)
            .map((t) => (t.id === targetId ? updatedTarget : t)),
          widgets: updatedWidgets,
        };
      });
    },
    [saveWorkspaceData]
  );

  const ungroupTab = useCallback(
    (tabId: string) => {
      saveWorkspaceData((prev) => {
        const groupTab = prev.tabs.find((t) => t.id === tabId);
        if (!groupTab) return prev;

        const childWidgets = (prev.widgets || []).filter((w) => w.parentGroupId === tabId);
        const variants = groupTab.urlVariants || [];

        // If no variants and no child widgets, delete the empty group!
        if (variants.length === 0 && childWidgets.length === 0) {
          const numericSourceId = /^\d+$/.test(groupTab.id) ? Number(groupTab.id) : undefined;
          savePendingOperation(
            createWorkspaceOperation('TAB_DELETE', groupTab.id, {
              raindropId: groupTab.raindropId || numericSourceId,
              collectionId: prev.raindropRootCollectionId,
            })
          );
          return {
            ...prev,
            tabs: prev.tabs.filter((t) => t.id !== tabId),
          };
        }

        // If it was a widget-only group (no variants):
        if (variants.length === 0) {
          // Delete groupTab
          const numericSourceId = /^\d+$/.test(groupTab.id) ? Number(groupTab.id) : undefined;
          savePendingOperation(
            createWorkspaceOperation('TAB_DELETE', groupTab.id, {
              raindropId: groupTab.raindropId || numericSourceId,
              collectionId: prev.raindropRootCollectionId,
            })
          );

          // Unpack child widgets to root shelf at groupTab's position
          const currentWidgets = getSortedWidgets(prev.widgets || [])
            .filter((w) => !w.parentGroupId && w.parentGroupId !== tabId)
            .map((w) => ({
              id: w.id,
              type: 'widget' as const,
              order: w.order,
              createdAt: w.createdAt,
            }));
          const favTabs = getSortedTabs(prev.tabs.filter((t) => Boolean(t.favourite) && t.id !== tabId)).map((t) => ({
            id: t.id,
            type: 'tab' as const,
            order: t.order,
            createdAt: t.createdAt,
          }));

          type FavItem = { id: string; type: 'tab' | 'widget'; order?: number; createdAt?: number };
          const allItems: FavItem[] = [...favTabs, ...currentWidgets].sort((a, b) => {
            if (a.order !== undefined && b.order !== undefined) {
              if (a.order !== b.order) return a.order - b.order;
              return (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id);
            }
            if (a.order !== undefined) return -1;
            if (b.order !== undefined) return 1;
            return (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id);
          });

          // Insert unpacked child widgets at target position
          const unpackedItems: FavItem[] = childWidgets.map((w) => ({ id: w.id, type: 'widget' as const }));
          const targetIndex = allItems.findIndex((item) => (item.order ?? 0) >= (groupTab.order ?? 0));
          if (targetIndex >= 0) {
            allItems.splice(targetIndex, 0, ...unpackedItems);
          } else {
            allItems.push(...unpackedItems);
          }

          const orderMap = new Map<string, number>();
          allItems.forEach((item, idx) => {
            orderMap.set(item.id, (idx + 1) * 1000);
          });

          const finalTabs = prev.tabs.filter((t) => t.id !== tabId).map((t) => {
            const newOrder = orderMap.get(t.id);
            return newOrder !== undefined ? { ...t, order: newOrder } : t;
          });

          const finalWidgets = (prev.widgets || []).map((w) => {
            if (w.parentGroupId === tabId) {
              const newOrder = orderMap.get(w.id) ?? (groupTab.order || 0);
              savePendingOperation(
                createWorkspaceOperation('WIDGET_UPDATE', w.id, {
                  parentGroupId: null,
                  order: newOrder,
                })
              );
              return { ...w, parentGroupId: undefined, order: newOrder, updatedAt: Date.now() };
            }
            const newOrder = orderMap.get(w.id);
            return newOrder !== undefined ? { ...w, order: newOrder } : w;
          });

          return {
            ...prev,
            tabs: finalTabs,
            widgets: finalWidgets,
          };
        }

        if (variants.length <= 1) {
          const updatedTab: Tab = {
            ...groupTab,
            customTitle: variants[0]?.name || groupTab.customTitle,
            url: variants[0]?.url || groupTab.url,
            favIconUrl: variants[0]?.favIconUrl || groupTab.favIconUrl,
            customEmojiIcon: variants[0]?.customEmojiIcon || groupTab.customEmojiIcon,
            isGroup: false,
            urlVariants: undefined,
            defaultVariantId: undefined,
            groupItemOrder: undefined,
            updatedAt: Date.now(),
          };
          savePendingOperation(
            createWorkspaceOperation('TAB_UPDATE', groupTab.id, {
              title: updatedTab.customTitle,
              url: updatedTab.url,
              favIconUrl: updatedTab.favIconUrl,
              customEmojiIcon: updatedTab.customEmojiIcon,
              isGroup: false,
              urlVariants: null,
              defaultVariantId: null,
              groupItemOrder: null,
            })
          );

          // Unpack child widgets to root shelf at groupTab's position
          const finalWidgets = (prev.widgets || []).map((w, wIdx) => {
            if (w.parentGroupId === tabId) {
              const newOrder = (groupTab.order || 0) + (wIdx + 1) * 10;
              savePendingOperation(
                createWorkspaceOperation('WIDGET_UPDATE', w.id, {
                  parentGroupId: null,
                  order: newOrder,
                })
              );
              return { ...w, parentGroupId: undefined, order: newOrder, updatedAt: Date.now() };
            }
            return w;
          });

          return {
            ...prev,
            tabs: prev.tabs.map((t) => (t.id === tabId ? updatedTab : t)),
            widgets: finalWidgets,
          };
        }

        const secondaryVariantIds = variants
          .slice(1)
          .map((v) => v.id)
          .filter(Boolean);

        // First variant stays on the existing tab preserving identity & browser associations
        const firstVariant = variants[0];
        const updatedFirstTab: Tab = {
          ...groupTab,
          customTitle: firstVariant.name || groupTab.customTitle,
          url: firstVariant.url,
          favIconUrl: firstVariant.favIconUrl || groupTab.favIconUrl,
          customEmojiIcon: firstVariant.customEmojiIcon || groupTab.customEmojiIcon,
          isGroup: false,
          urlVariants: undefined,
          defaultVariantId: undefined,
          groupItemOrder: undefined,
          updatedAt: Date.now(),
        };

        // Remaining variants become separate new tabs
        const newTabs: Tab[] = variants.slice(1).map((v, idx) => {
          const matchingFavIcon =
            v.favIconUrl ||
            prev.tabs.find((t) => t.url === v.url && t.favIconUrl)?.favIconUrl ||
            prev.tmpTabs?.find((t) => t.url === v.url && t.favIconUrl)?.favIconUrl;

          const newTab: Tab = {
            id: generateId('tab'),
            url: v.url,
            customTitle: v.name,
            favIconUrl: matchingFavIcon,
            customEmojiIcon: v.customEmojiIcon,
            pinned: Boolean(groupTab.pinned),
            favourite: Boolean(groupTab.favourite),
            parentSpaceId: groupTab.parentSpaceId,
            parentFolderId: groupTab.parentFolderId,
            createdAt: Date.now() + idx,
            updatedAt: Date.now() + idx,
          };
          return newTab;
        });

        // Replace groupTab with [updatedFirstTab, ...newTabs] in tab list
        const groupIdxInPrev = prev.tabs.findIndex((t) => t.id === tabId);
        const nextTabsList = [...prev.tabs];
        if (groupIdxInPrev >= 0) {
          nextTabsList.splice(groupIdxInPrev, 1, updatedFirstTab, ...newTabs);
        } else {
          nextTabsList.push(updatedFirstTab, ...newTabs);
        }

        let updatedWidgets = prev.widgets || [];

        if (groupTab.favourite) {
          // Keep all children tabs and widgets at the EXACT place on the favourite shelf where the group was
          type FavItem = { id: string; type: 'tab' | 'widget'; order?: number; createdAt?: number };
          const favTabs: FavItem[] = getSortedTabs(prev.tabs.filter((t) => Boolean(t.favourite))).map((t) => ({
            id: t.id,
            type: 'tab' as const,
            order: t.order,
            createdAt: t.createdAt,
          }));
          const currentWidgets: FavItem[] = getSortedWidgets(prev.widgets || [])
            .filter((w) => !w.parentGroupId)
            .map((w) => ({
              id: w.id,
              type: 'widget' as const,
              order: w.order,
              createdAt: w.createdAt,
            }));

          const allItems: FavItem[] = [...favTabs, ...currentWidgets].sort((a, b) => {
            if (a.order !== undefined && b.order !== undefined) {
              if (a.order !== b.order) return a.order - b.order;
              return (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id);
            }
            if (a.order !== undefined) return -1;
            if (b.order !== undefined) return 1;
            return (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id);
          });

          // Replace the group entry at its exact index in allItems with [updatedFirstTab, ...newTabs, ...childWidgets]
          const groupIdx = allItems.findIndex((item) => item.id === tabId);
          const unpackedItems: FavItem[] = [
            { id: updatedFirstTab.id, type: 'tab' as const },
            ...newTabs.map((nt) => ({ id: nt.id, type: 'tab' as const })),
            ...childWidgets.map((w) => ({ id: w.id, type: 'widget' as const })),
          ];
          if (groupIdx >= 0) {
            allItems.splice(groupIdx, 1, ...unpackedItems);
          } else {
            allItems.push(...unpackedItems);
          }

          // Re-index all favourite items sequentially
          const orderMap = new Map<string, number>();
          allItems.forEach((item, idx) => {
            orderMap.set(item.id, (idx + 1) * 1000);
          });

          // Update tab orders
          const finalTabs = nextTabsList.map((t) => {
            const newOrder = orderMap.get(t.id);
            if (newOrder !== undefined) {
              return { ...t, order: newOrder };
            }
            return t;
          });

          // Update widget orders & clear parentGroupId for childWidgets
          updatedWidgets = (prev.widgets || []).map((w) => {
            if (w.parentGroupId === tabId) {
              const newOrder = orderMap.get(w.id);
              savePendingOperation(
                createWorkspaceOperation('WIDGET_UPDATE', w.id, {
                  parentGroupId: null,
                  order: newOrder,
                })
              );
              return {
                ...w,
                parentGroupId: undefined,
                order: newOrder !== undefined ? newOrder : w.order,
                updatedAt: Date.now(),
              };
            }
            const newOrder = orderMap.get(w.id);
            if (newOrder !== undefined) {
              return { ...w, order: newOrder };
            }
            return w;
          });

          // Save pending operations:
          const firstTabFinal = finalTabs.find((t) => t.id === updatedFirstTab.id) || updatedFirstTab;
          savePendingOperation(
            createWorkspaceOperation('TAB_UPDATE', groupTab.id, {
              title: firstTabFinal.customTitle,
              url: firstTabFinal.url,
              favIconUrl: firstTabFinal.favIconUrl,
              customEmojiIcon: firstTabFinal.customEmojiIcon,
              urlVariants: null,
              defaultVariantId: null,
              groupItemOrder: null,
              order: firstTabFinal.order,
              deletedVariantIds: secondaryVariantIds.length > 0 ? secondaryVariantIds : undefined,
            })
          );

          newTabs.forEach((nt) => {
            const ntFinal = finalTabs.find((t) => t.id === nt.id) || nt;
            savePendingOperation(createWorkspaceOperation('TAB_CREATE', ntFinal.id, ntFinal));
          });

          finalTabs.forEach((t) => {
            if (t.id === groupTab.id || newTabs.some((nt) => nt.id === t.id)) return;
            const oldTab = prev.tabs.find((orig) => orig.id === t.id);
            if (oldTab && oldTab.order !== t.order) {
              savePendingOperation(createWorkspaceOperation('TAB_UPDATE', t.id, { order: t.order }));
            }
          });

          updatedWidgets.forEach((w) => {
            if (w.parentGroupId === tabId) return;
            const oldWidget = (prev.widgets || []).find((orig) => orig.id === w.id);
            if (oldWidget && oldWidget.order !== w.order) {
              savePendingOperation(createWorkspaceOperation('WIDGET_UPDATE', w.id, { order: w.order }));
            }
          });

          return {
            ...prev,
            tabs: finalTabs,
            widgets: updatedWidgets,
          };
        } else if (groupTab.pinned) {
          // Pinned tabs
          const pinnedTabs = getSortedTabs(prev.tabs.filter((t) => t.pinned));
          const groupIdx = pinnedTabs.findIndex((t) => t.id === tabId);
          const unpackedTabs = [updatedFirstTab, ...newTabs];
          if (groupIdx >= 0) {
            pinnedTabs.splice(groupIdx, 1, ...unpackedTabs);
          } else {
            pinnedTabs.push(...unpackedTabs);
          }

          const orderMap = new Map<string, number>();
          pinnedTabs.forEach((t, idx) => {
            orderMap.set(t.id, (idx + 1) * 1000);
          });

          const finalTabs = nextTabsList.map((t) => {
            const newOrder = orderMap.get(t.id);
            return newOrder !== undefined ? { ...t, order: newOrder } : t;
          });

          const firstTabFinal = finalTabs.find((t) => t.id === updatedFirstTab.id) || updatedFirstTab;
          savePendingOperation(
            createWorkspaceOperation('TAB_UPDATE', groupTab.id, {
              title: firstTabFinal.customTitle,
              url: firstTabFinal.url,
              favIconUrl: firstTabFinal.favIconUrl,
              customEmojiIcon: firstTabFinal.customEmojiIcon,
              urlVariants: null,
              defaultVariantId: null,
              groupItemOrder: null,
              order: firstTabFinal.order,
              deletedVariantIds: secondaryVariantIds.length > 0 ? secondaryVariantIds : undefined,
            })
          );

          newTabs.forEach((nt) => {
            const ntFinal = finalTabs.find((t) => t.id === nt.id) || nt;
            savePendingOperation(createWorkspaceOperation('TAB_CREATE', ntFinal.id, ntFinal));
          });

          finalTabs.forEach((t) => {
            if (t.id === groupTab.id || newTabs.some((nt) => nt.id === t.id)) return;
            const oldTab = prev.tabs.find((orig) => orig.id === t.id);
            if (oldTab && oldTab.order !== t.order) {
              savePendingOperation(createWorkspaceOperation('TAB_UPDATE', t.id, { order: t.order }));
            }
          });

          return {
            ...prev,
            tabs: finalTabs,
          };
        } else {
          // Regular space / folder tabs
          const siblings = prev.tabs
            .filter(
              (t) =>
                !t.favourite &&
                !t.pinned &&
                t.parentSpaceId === groupTab.parentSpaceId &&
                t.parentFolderId === groupTab.parentFolderId
            )
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt || 0) - (b.createdAt || 0));

          const groupIdx = siblings.findIndex((t) => t.id === tabId);
          const unpackedTabs = [updatedFirstTab, ...newTabs];
          if (groupIdx >= 0) {
            siblings.splice(groupIdx, 1, ...unpackedTabs);
          } else {
            siblings.push(...unpackedTabs);
          }

          const orderMap = new Map<string, number>();
          siblings.forEach((t, idx) => {
            orderMap.set(t.id, (idx + 1) * 1000);
          });

          const finalTabs = nextTabsList.map((t) => {
            const newOrder = orderMap.get(t.id);
            return newOrder !== undefined ? { ...t, order: newOrder } : t;
          });

          const firstTabFinal = finalTabs.find((t) => t.id === updatedFirstTab.id) || updatedFirstTab;
          savePendingOperation(
            createWorkspaceOperation('TAB_UPDATE', groupTab.id, {
              title: firstTabFinal.customTitle,
              url: firstTabFinal.url,
              favIconUrl: firstTabFinal.favIconUrl,
              customEmojiIcon: firstTabFinal.customEmojiIcon,
              urlVariants: null,
              defaultVariantId: null,
              groupItemOrder: null,
              order: firstTabFinal.order,
              deletedVariantIds: secondaryVariantIds.length > 0 ? secondaryVariantIds : undefined,
            })
          );

          newTabs.forEach((nt) => {
            const ntFinal = finalTabs.find((t) => t.id === nt.id) || nt;
            savePendingOperation(createWorkspaceOperation('TAB_CREATE', ntFinal.id, ntFinal));
          });

          finalTabs.forEach((t) => {
            if (t.id === groupTab.id || newTabs.some((nt) => nt.id === t.id)) return;
            const oldTab = prev.tabs.find((orig) => orig.id === t.id);
            if (oldTab && oldTab.order !== t.order) {
              savePendingOperation(createWorkspaceOperation('TAB_UPDATE', t.id, { order: t.order }));
            }
          });

          return {
            ...prev,
            tabs: finalTabs,
          };
        }
      });
    },
    [saveWorkspaceData]
  );

  const moveWidgetToGroup = useCallback(
    (widgetId: string, targetGroupId: string) => {
      saveWorkspaceData((prev) => {
        const widget = (prev.widgets || []).find((w) => w.id === widgetId);
        const groupTab = prev.tabs.find((t) => t.id === targetGroupId);
        if (!widget || !groupTab) return prev;

        const nextGroupItemOrder = [
          ...(groupTab.groupItemOrder || []),
          { type: 'widget' as const, id: widgetId },
        ];

        const updatedGroupTab: Tab = {
          ...groupTab,
          isGroup: true,
          groupItemOrder: nextGroupItemOrder,
          updatedAt: Date.now(),
        };

        const updatedWidgets = (prev.widgets || []).map((w) =>
          w.id === widgetId ? { ...w, parentGroupId: targetGroupId, updatedAt: Date.now() } : w
        );

        savePendingOperation(
          createWorkspaceOperation('WIDGET_UPDATE', widgetId, {
            parentGroupId: targetGroupId,
          })
        );
        savePendingOperation(
          createWorkspaceOperation('TAB_UPDATE', targetGroupId, {
            isGroup: true,
            groupItemOrder: nextGroupItemOrder,
          })
        );

        return {
          ...prev,
          tabs: prev.tabs.map((t) => (t.id === targetGroupId ? updatedGroupTab : t)),
          widgets: updatedWidgets,
        };
      });
    },
    [saveWorkspaceData]
  );

  const extractWidgetFromGroup = useCallback(
    (widgetId: string, targetOrder?: number) => {
      saveWorkspaceData((prev) => {
        const widget = (prev.widgets || []).find((w) => w.id === widgetId);
        if (!widget || !widget.parentGroupId) return prev;
        const parentGroupId = widget.parentGroupId;
        const groupTab = prev.tabs.find((t) => t.id === parentGroupId);

        const nextGroupItemOrder = (groupTab?.groupItemOrder || []).filter((e) => e.id !== widgetId);
        const newOrder = targetOrder !== undefined ? targetOrder : (groupTab?.order ? groupTab.order + 10 : widget.order);

        const updatedWidgets = (prev.widgets || []).map((w) =>
          w.id === widgetId ? { ...w, parentGroupId: undefined, order: newOrder, updatedAt: Date.now() } : w
        );

        savePendingOperation(
          createWorkspaceOperation('WIDGET_UPDATE', widgetId, {
            parentGroupId: null,
            order: newOrder,
          })
        );

        let updatedTabs = prev.tabs;
        if (groupTab) {
          const remainingWidgets = (prev.widgets || []).filter((w) => w.id !== widgetId && w.parentGroupId === parentGroupId);
          const remainingVariants = (groupTab.urlVariants || []).filter((v) => Boolean(v.url));

          if (remainingWidgets.length === 0 && remainingVariants.length === 0) {
            const numericSourceId = /^\d+$/.test(groupTab.id) ? Number(groupTab.id) : undefined;
            savePendingOperation(
              createWorkspaceOperation('TAB_DELETE', groupTab.id, {
                raindropId: groupTab.raindropId || numericSourceId,
                collectionId: prev.raindropRootCollectionId,
              })
            );
            updatedTabs = prev.tabs.filter((t) => t.id !== parentGroupId);
          } else if (remainingWidgets.length === 0 && remainingVariants.length === 1) {
            const onlyVariant = remainingVariants[0];
            const revertedTab: Tab = {
              ...groupTab,
              customTitle: onlyVariant.name || groupTab.customTitle,
              url: onlyVariant.url || groupTab.url,
              favIconUrl: onlyVariant.favIconUrl || groupTab.favIconUrl,
              customEmojiIcon: onlyVariant.customEmojiIcon || groupTab.customEmojiIcon,
              isGroup: false,
              urlVariants: undefined,
              defaultVariantId: undefined,
              groupItemOrder: undefined,
              updatedAt: Date.now(),
            };
            savePendingOperation(
              createWorkspaceOperation('TAB_UPDATE', parentGroupId, {
                title: revertedTab.customTitle,
                url: revertedTab.url,
                favIconUrl: revertedTab.favIconUrl,
                customEmojiIcon: revertedTab.customEmojiIcon,
                isGroup: false,
                urlVariants: null,
                defaultVariantId: null,
                groupItemOrder: null,
              })
            );
            updatedTabs = prev.tabs.map((t) => (t.id === parentGroupId ? revertedTab : t));
          } else {
            const updatedGroupTab: Tab = {
              ...groupTab,
              groupItemOrder: nextGroupItemOrder.length > 0 ? nextGroupItemOrder : undefined,
              updatedAt: Date.now(),
            };
            savePendingOperation(
              createWorkspaceOperation('TAB_UPDATE', parentGroupId, {
                groupItemOrder: updatedGroupTab.groupItemOrder || null,
              })
            );
            updatedTabs = prev.tabs.map((t) => (t.id === parentGroupId ? updatedGroupTab : t));
          }
        }

        return {
          ...prev,
          tabs: updatedTabs,
          widgets: updatedWidgets,
        };
      });
    },
    [saveWorkspaceData]
  );

  const resetToDefault = useCallback(() => {
    clearStoredPendingOperations();
    saveWorkspaceData(DEFAULT_WORKSPACE);
  }, [saveWorkspaceData]);

  const applyLatestSnapshot = useCallback((snapshot: ArcableWorkspaceData) => {
    // An existing Arcable root can legitimately have no child collections yet.
    // Treat that as an authoritative empty remote tree rather than retaining a
    // stale local sample workspace.
    if (snapshot && Array.isArray(snapshot.spaces)) {
      saveWorkspaceData((prev) => {
        const currentActive = prev.activeSpaceId;
        const activeSpaceStillExists =
          currentActive === VIRTUAL_SYNCED_TABS_SPACE_ID ||
          snapshot.spaces.some((s) => s.id === currentActive);
        // A missing root collection ID indicates the workspace has not been
        // initialized in Raindrop. Do not erase data which this client can
        // create on its next sync.
        const remoteMetadataMissing = !snapshot.raindropRootCollectionId;

        // Preserve in-memory local folder expand state as fallback
        const prevExpandMap = new Map<string, boolean>();
        prev.folders.forEach((f) => {
          if (f.isExpanded !== undefined) {
            prevExpandMap.set(f.id, f.isExpanded);
          }
        });

        const mergedFolders = (snapshot.folders || []).map((f) => {
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

        return {
          raindropRootCollectionId: snapshot.raindropRootCollectionId ?? prev.raindropRootCollectionId,
          raindropMetadataItemId: snapshot.raindropMetadataItemId !== undefined
            ? snapshot.raindropMetadataItemId
            : prev.raindropMetadataItemId,
          spaces: snapshot.spaces,
          folders: mergedFolders,
          tabs: snapshot.tabs || [],
          tmpTabs: prev.tmpTabs || [], // Tmp tabs are local only!
          widgets: remoteMetadataMissing ? (prev.widgets || []) : (snapshot.widgets || []),
          customCodeRules: remoteMetadataMissing ? (prev.customCodeRules || []) : (snapshot.customCodeRules || []),
          runCodeInPageRules: remoteMetadataMissing ? (prev.runCodeInPageRules || []) : (snapshot.runCodeInPageRules || []),
          activeSpaceId: activeSpaceStillExists
            ? currentActive
            : (getSortedSpaces(snapshot.spaces)[0]?.id || 'space_personal'),
          version: snapshot.version || 1,
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
      const pendingOps = getStoredPendingOperations();
      const result = await syncWorkspaceWithRaindrop(token, {
        localState: data,
        deviceName,
        pendingOps,
      });

      setLastSyncResult(result);

      if (result.success) {
        clearStoredPendingOperations();
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
        const activeSpaceStillExists =
          currentActive === VIRTUAL_SYNCED_TABS_SPACE_ID ||
          imported.spaces.some((s) => s.id === currentActive);
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
    // Space operations
    createSpace,
    updateSpace,
    deleteSpace,
    archiveSpace,
    convertSpaceToFolder,
    reorderSpaces,
    moveSpace,
    // Folder operations
    createFolder,
    updateFolder,
    deleteFolder,
    archiveFolder,
    toggleFolderExpand,
    setAllFoldersExpanded,
    expandAllFolders,
    collapseAllFolders,
    // Tab operations
    createTab,
    updateTab,
    deleteTab,
    archiveTab,
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
    reorderGroupVariants,
    mergeTabsIntoGroup,
    ungroupTab,
    moveWidgetToGroup,
    extractWidgetFromGroup,
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
