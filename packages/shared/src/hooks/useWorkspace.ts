'use client';

import { useState, useEffect, useCallback } from 'react';
import { Space, Folder, Tab, ArcableWorkspaceData } from '../types/workspace';
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

export const DEFAULT_WORKSPACE: ArcableWorkspaceData = {
  activeSpaceId: 'space_personal',
  version: 1,
  spaces: [
    {
      id: 'space_personal',
      name: 'Personal',
      emojiIcon: '🏠',
      colors: '#6366f1',
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    },
    {
      id: 'space_work',
      name: 'Work',
      emojiIcon: '💼',
      colors: '#ec4899',
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
      createdAt: 1700000005000,
      updatedAt: 1700000005000,
    },
  ],
  tabs: [
    {
      id: 'tab_arcable',
      url: 'https://arcable.dev',
      pinned: true,
      customTitle: 'Arcable Hub',
      customEmojiIcon: '✨',
      parentSpaceId: 'space_personal',
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
  const activeSpace = data.spaces.find((s) => s.id === data.activeSpaceId) || data.spaces[0];

  const setActiveSpace = useCallback((spaceId: string) => {
    savePendingOperation(createWorkspaceOperation('WORKSPACE_SET_ACTIVE_SPACE', spaceId));
    saveWorkspaceData((prev) => ({
      ...prev,
      activeSpaceId: spaceId,
    }));
  }, [saveWorkspaceData]);

  // ================= Space CRUD =================
  const createSpace = useCallback((spaceInput: { name: string; emojiIcon?: string; colors?: string }) => {
    const newSpace: Space = {
      id: generateId('space'),
      name: spaceInput.name.trim() || 'New Space',
      emojiIcon: spaceInput.emojiIcon || '📁',
      colors: spaceInput.colors || '#6366f1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    savePendingOperation(createWorkspaceOperation('SPACE_CREATE', newSpace.id, newSpace));

    saveWorkspaceData((prev) => ({
      ...prev,
      spaces: [...prev.spaces, newSpace],
      activeSpaceId: newSpace.id,
    }));

    return newSpace;
  }, [saveWorkspaceData]);

  const updateSpace = useCallback((id: string, updates: Partial<Omit<Space, 'id'>>) => {
    savePendingOperation(createWorkspaceOperation('SPACE_UPDATE', id, updates));

    saveWorkspaceData((prev) => ({
      ...prev,
      spaces: prev.spaces.map((s) =>
        s.id === id ? { ...s, ...updates, updatedAt: Date.now() } : s
      ),
    }));
  }, [saveWorkspaceData]);

  const deleteSpace = useCallback((id: string) => {
    savePendingOperation(createWorkspaceOperation('SPACE_DELETE', id));

    saveWorkspaceData((prev) => {
      const remainingSpaces = prev.spaces.filter((s) => s.id !== id);
      if (remainingSpaces.length === 0) {
        // Always keep at least one space
        const fallbackSpace: Space = {
          id: generateId('space'),
          name: 'General',
          emojiIcon: '🌐',
          colors: '#6366f1',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        return {
          ...prev,
          spaces: [fallbackSpace],
          folders: prev.folders.filter((f) => f.parentSpaceId !== id),
          tabs: prev.tabs.filter((t) => t.parentSpaceId !== id),
          activeSpaceId: fallbackSpace.id,
        };
      }

      const nextActiveSpaceId =
        prev.activeSpaceId === id ? remainingSpaces[0].id : prev.activeSpaceId;

      return {
        ...prev,
        spaces: remainingSpaces,
        folders: prev.folders.filter((f) => f.parentSpaceId !== id),
        tabs: prev.tabs.filter((t) => t.parentSpaceId !== id),
        activeSpaceId: nextActiveSpaceId,
      };
    });
  }, [saveWorkspaceData]);

  // ================= Folder CRUD =================
  const createFolder = useCallback((folderInput: {
    name: string;
    parentSpaceId: string;
    parentFolderId?: string;
    customEmojiIcon?: string;
    colors?: string;
  }) => {
    const newFolder: Folder = {
      id: generateId('folder'),
      name: folderInput.name.trim() || 'New Folder',
      parentSpaceId: folderInput.parentSpaceId,
      parentFolderId: folderInput.parentFolderId || undefined,
      customEmojiIcon: folderInput.customEmojiIcon || '📁',
      colors: folderInput.colors || '#3b82f6',
      isExpanded: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    savePendingOperation(createWorkspaceOperation('FOLDER_CREATE', newFolder.id, newFolder));

    saveWorkspaceData((prev) => ({
      ...prev,
      folders: [...prev.folders, newFolder],
    }));

    return newFolder;
  }, [saveWorkspaceData]);

  const updateFolder = useCallback((id: string, updates: Partial<Omit<Folder, 'id'>>) => {
    savePendingOperation(createWorkspaceOperation('FOLDER_UPDATE', id, updates));

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
    parentSpaceId: string;
    customTitle?: string;
    customEmojiIcon?: string;
    pinned?: boolean;
    parentFolderId?: string;
  }) => {
    let cleanUrl = tabInput.url.trim();
    if (cleanUrl && !/^https?:\/\//i.test(cleanUrl) && !cleanUrl.startsWith('about:') && !cleanUrl.startsWith('chrome:')) {
      cleanUrl = `https://${cleanUrl}`;
    }

    const newTab: Tab = {
      id: generateId('tab'),
      url: cleanUrl || 'https://arcable.dev',
      pinned: Boolean(tabInput.pinned),
      customTitle: tabInput.customTitle?.trim() || undefined,
      customEmojiIcon: tabInput.customEmojiIcon?.trim() || undefined,
      parentSpaceId: tabInput.parentSpaceId,
      parentFolderId: tabInput.pinned ? undefined : (tabInput.parentFolderId || undefined),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    savePendingOperation(createWorkspaceOperation('TAB_CREATE', newTab.id, newTab));

    saveWorkspaceData((prev) => ({
      ...prev,
      tabs: [...prev.tabs, newTab],
    }));

    return newTab;
  }, [saveWorkspaceData]);

  const updateTab = useCallback((id: string, updates: Partial<Omit<Tab, 'id'>>) => {
    savePendingOperation(createWorkspaceOperation('TAB_UPDATE', id, updates));

    saveWorkspaceData((prev) => ({
      ...prev,
      tabs: prev.tabs.map((t) => {
        if (t.id !== id) return t;
        const updated = { ...t, ...updates, updatedAt: Date.now() };
        // If pinned is true, tab shouldn't have parentFolderId
        if (updated.pinned) {
          updated.parentFolderId = undefined;
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
    savePendingOperation(createWorkspaceOperation('TAB_UPDATE', id, { pinned: nextPinned, parentFolderId: undefined }));

    saveWorkspaceData((prev) => ({
      ...prev,
      tabs: prev.tabs.map((t) =>
        t.id === id ? { ...t, pinned: !t.pinned, parentFolderId: !t.pinned ? undefined : t.parentFolderId } : t
      ),
    }));
  }, [data.tabs, saveWorkspaceData]);

  const resetToDefault = useCallback(() => {
    clearStoredPendingOperations();
    saveWorkspaceData(DEFAULT_WORKSPACE);
  }, [saveWorkspaceData]);

  const applyLatestSnapshot = useCallback((snapshot: ArcableWorkspaceData) => {
    if (snapshot && Array.isArray(snapshot.spaces) && snapshot.spaces.length > 0) {
      saveWorkspaceData({
        spaces: snapshot.spaces,
        folders: snapshot.folders || [],
        tabs: snapshot.tabs || [],
        activeSpaceId: snapshot.activeSpaceId || snapshot.spaces[0]?.id || 'space_personal',
        version: snapshot.version || 1,
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
      saveWorkspaceData({
        spaces: imported.spaces,
        folders: imported.folders || [],
        tabs: imported.tabs || [],
        activeSpaceId: imported.activeSpaceId || imported.spaces[0].id,
        version: imported.version || 1,
      });
      return true;
    }
    return false;
  }, [saveWorkspaceData]);

  // Helpers for filtering items by active space
  const currentSpaceId = activeSpace?.id || '';
  const pinnedTabs = data.tabs.filter((t) => t.parentSpaceId === currentSpaceId && t.pinned);
  const rootTabs = data.tabs.filter((t) => t.parentSpaceId === currentSpaceId && !t.pinned && !t.parentFolderId);
  const rootFolders = data.folders.filter((f) => f.parentSpaceId === currentSpaceId && !f.parentFolderId);

  const getChildFolders = useCallback((folderId: string) => {
    return data.folders.filter((f) => f.parentFolderId === folderId);
  }, [data.folders]);

  const getChildTabs = useCallback((folderId: string) => {
    return data.tabs.filter((t) => t.parentFolderId === folderId && !t.pinned);
  }, [data.tabs]);

  return {
    data,
    isLoaded,
    activeSpace,
    setActiveSpace,
    // Space operations
    createSpace,
    updateSpace,
    deleteSpace,
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
    pinnedTabs,
    rootTabs,
    rootFolders,
    getChildFolders,
    getChildTabs,
  };
}
