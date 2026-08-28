'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Space, Folder, Tab, ArcableWorkspaceData, WorkspaceSiblingItem } from '../types/workspace';
import { SyncResult } from '../types/sync';
import { generateId } from '../utils/format';
import {
  createWorkspaceOperation,
  savePendingOperation,
  getStoredPendingOperations,
  clearStoredPendingOperations,
} from '../utils/syncEngine';
import { syncWorkspaceWithRaindrop } from '../utils/raindropSync';

export const WORKSPACE_STORAGE_KEY = 'arcable_workspace_data';

export function getSortedSpaces(spaces: Space[]): Space[] {
  return [...spaces].sort((a, b) => {
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
    .filter(
      (f) =>
        f.parentSpaceId === parentSpaceId &&
        (f.parentFolderId || undefined) === normFolderParentId
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
        t.parentSpaceId === parentSpaceId &&
        (t.parentFolderId || undefined) === normFolderParentId
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
      colors: '#6366f1',
      order: 1000,
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    },
    {
      id: 'space_work',
      name: 'Work',
      emojiIcon: '💼',
      colors: '#ec4899',
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
      colors: '#3b82f6',
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
      colors: '#10b981',
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
      colors: '#f59e0b',
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
      colors: '#8b5cf6',
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
};

function readWorkspaceFromStorage(): ArcableWorkspaceData {
  if (typeof window === 'undefined') return DEFAULT_WORKSPACE;
  try {
    const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(DEFAULT_WORKSPACE));
      return DEFAULT_WORKSPACE;
    }
    const parsed = JSON.parse(raw) as ArcableWorkspaceData;
    if (!parsed || !Array.isArray(parsed.spaces) || parsed.spaces.length === 0) {
      window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(DEFAULT_WORKSPACE));
      return DEFAULT_WORKSPACE;
    }
    return {
      spaces: parsed.spaces || [],
      folders: parsed.folders || [],
      tabs: parsed.tabs || [],
      activeSpaceId: parsed.activeSpaceId || parsed.spaces[0]?.id || 'space_personal',
      version: parsed.version || 1,
    };
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
          setData(updated);
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
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
        colors: '#6366f1',
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
          colors: '#6366f1',
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

      const nextActiveSpaceId =
        prev.activeSpaceId === id ? remaining[0].id : prev.activeSpaceId;

      return {
        ...prev,
        spaces: remaining,
        folders: prev.folders.filter((f) => f.parentSpaceId !== id),
        tabs: prev.tabs.filter((t) => t.parentSpaceId !== id),
        activeSpaceId: nextActiveSpaceId,
      };
    });
  }, [data.spaces, saveWorkspaceData]);

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
    const opPayload: Record<string, any> = { ...updates };
    if ('customEmojiIcon' in updates) opPayload.customEmojiIcon = updates.customEmojiIcon ?? null;
    if ('parentFolderId' in updates) opPayload.parentFolderId = updates.parentFolderId ?? null;
    if ('colors' in updates) opPayload.colors = updates.colors ?? null;

    savePendingOperation(createWorkspaceOperation('FOLDER_UPDATE', id, opPayload));

    saveWorkspaceData((prev) => ({
      ...prev,
      folders: prev.folders.map((f) =>
        f.id === id ? { ...f, ...updates, updatedAt: Date.now() } : f
      ),
    }));
  }, [saveWorkspaceData]);

  const toggleFolderExpand = useCallback((id: string) => {
    saveWorkspaceData((prev) => ({
      ...prev,
      folders: prev.folders.map((f) =>
        f.id === id ? { ...f, isExpanded: !f.isExpanded } : f
      ),
    }));
  }, [saveWorkspaceData]);

  const deleteFolder = useCallback((id: string, recursive: boolean = true) => {
    savePendingOperation(createWorkspaceOperation('FOLDER_DELETE', id));

    saveWorkspaceData((prev) => {
      // Find all descendant folder IDs if recursive
      const folderIdsToDelete = new Set<string>([id]);
      if (recursive) {
        let addedNew = true;
        while (addedNew) {
          addedNew = false;
          for (const f of prev.folders) {
            if (f.parentFolderId && folderIdsToDelete.has(f.parentFolderId) && !folderIdsToDelete.has(f.id)) {
              folderIdsToDelete.add(f.id);
              addedNew = true;
            }
          }
        }
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
    parentSpaceId?: string;
    customTitle?: string;
    customEmojiIcon?: string;
    pinned?: boolean;
    favourite?: boolean;
    parentFolderId?: string;
  }) => {
    let cleanUrl = tabInput.url.trim();
    if (cleanUrl && !/^https?:\/\//i.test(cleanUrl) && !cleanUrl.startsWith('about:') && !cleanUrl.startsWith('chrome:')) {
      cleanUrl = `https://${cleanUrl}`;
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
      pinned: isPinned,
      favourite: isFav || undefined,
      customTitle: tabInput.customTitle?.trim() || undefined,
      customEmojiIcon: tabInput.customEmojiIcon?.trim() || undefined,
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
    const opPayload: Record<string, any> = { ...updates };
    if ('customEmojiIcon' in updates) opPayload.customEmojiIcon = updates.customEmojiIcon ?? null;
    if ('customTitle' in updates) opPayload.customTitle = updates.customTitle ?? null;
    if ('parentFolderId' in updates) opPayload.parentFolderId = updates.parentFolderId ?? null;
    if ('parentSpaceId' in updates) opPayload.parentSpaceId = updates.parentSpaceId ?? null;
    if ('favourite' in updates) opPayload.favourite = Boolean(updates.favourite);
    if ('pinned' in updates) opPayload.pinned = Boolean(updates.pinned);

    savePendingOperation(createWorkspaceOperation('TAB_UPDATE', id, opPayload));

    saveWorkspaceData((prev) => ({
      ...prev,
      tabs: prev.tabs.map((t) => {
        if (t.id !== id) return t;
        const updated = { ...t, ...updates, updatedAt: Date.now() };

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

        return updated;
      }),
    }));
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
          savePendingOperation(
            createWorkspaceOperation('FOLDER_UPDATE', sourceId, {
              parentSpaceId: targetFolder.parentSpaceId,
              parentFolderId: targetFolder.id,
              order: newOrder,
            })
          );

          saveWorkspaceData((prev) => ({
            ...prev,
            folders: prev.folders.map((f) =>
              f.id === sourceId
                ? {
                    ...f,
                    parentSpaceId: targetFolder.parentSpaceId,
                    parentFolderId: targetFolder.id,
                    order: newOrder,
                    updatedAt: Date.now(),
                  }
                : f
            ),
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

  const reorderFavouriteTabs = useCallback(
    (sourceTabId: string, targetTabId: string, position: 'before' | 'after') => {
      if (sourceTabId === targetTabId) return;
      const favs = getSortedTabs(data.tabs.filter((t) => Boolean(t.favourite)));
      const sourceIdx = favs.findIndex((t) => t.id === sourceTabId);
      const targetIdx = favs.findIndex((t) => t.id === targetTabId);
      if (sourceIdx < 0 || targetIdx < 0) return;

      const [moved] = favs.splice(sourceIdx, 1);
      const newTargetIdx = favs.findIndex((t) => t.id === targetTabId);
      const insertIdx = position === 'before' ? newTargetIdx : newTargetIdx + 1;
      favs.splice(insertIdx, 0, moved);

      const orderMap = new Map<string, number>();
      favs.forEach((t, i) => orderMap.set(t.id, (i + 1) * 1000));

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
    [data.tabs, saveWorkspaceData]
  );

  const resetToDefault = useCallback(() => {
    clearStoredPendingOperations();
    saveWorkspaceData(DEFAULT_WORKSPACE);
  }, [saveWorkspaceData]);

  const applyLatestSnapshot = useCallback((snapshot: ArcableWorkspaceData) => {
    if (snapshot && Array.isArray(snapshot.spaces) && snapshot.spaces.length > 0) {
      saveWorkspaceData((prev) => {
        const currentActive = prev.activeSpaceId;
        const activeSpaceStillExists = snapshot.spaces.some((s) => s.id === currentActive);
        return {
          spaces: snapshot.spaces,
          folders: snapshot.folders || [],
          tabs: snapshot.tabs || [],
          activeSpaceId: activeSpaceStillExists
            ? currentActive
            : snapshot.spaces[0]?.id || 'space_personal',
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
      const result = await syncWorkspaceWithRaindrop(token, {
        localState: data,
        deviceName,
      });

      setLastSyncResult(result);

      if (result.success && result.latestSnapshot) {
        applyLatestSnapshot(result.latestSnapshot);
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
        return {
          spaces: imported.spaces,
          folders: imported.folders || [],
          tabs: imported.tabs || [],
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
    togglePinTab,
    toggleFavouriteTab,
    // Sibling reordering
    reorderSiblingItem,
    moveSiblingItem,
    reorderPinnedTabs,
    reorderFavouriteTabs,
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

