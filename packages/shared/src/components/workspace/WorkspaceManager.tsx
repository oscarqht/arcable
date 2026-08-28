'use client';

import React, { useState } from 'react';
import { Space, Folder, Tab, ArcableWorkspaceData } from '../../types/workspace';
import { SyncResult, WorkspaceOperation } from '../../types/sync';
import { useWorkspace } from '../../hooks/useWorkspace';
import {
  getOrCreateDeviceId,
  getStoredPendingOperations,
  clearStoredPendingOperations,
} from '../../utils/syncEngine';
import { Button } from '../Button';
import { TabRow } from './TabRow';
import { FolderItem } from './FolderItem';
import { PinnedTabsShelf } from './PinnedTabsShelf';
import { FavouriteTabsShelf } from './FavouriteTabsShelf';
import { SpaceModal } from './SpaceModal';
import { FolderModal } from './FolderModal';
import { TabModal } from './TabModal';

export interface WorkspaceManagerProps {
  onOpenTab?: (url: string) => void;
  onCaptureCurrentTab?: () => Promise<{ url: string; title?: string; favIconUrl?: string } | null>;
  compact?: boolean;
  headerTitle?: string;
  showJsonInspector?: boolean;
  raindropToken?: string;
  onSyncRaindrop?: (params: {
    localState: ArcableWorkspaceData;
    deviceId: string;
    pendingOps: WorkspaceOperation[];
  }) => Promise<SyncResult | void | any>;
}

export const WorkspaceManager: React.FC<WorkspaceManagerProps> = ({
  onOpenTab,
  onCaptureCurrentTab,
  compact = false,
  headerTitle = 'Arcable Workspace',
  showJsonInspector = true,
  raindropToken,
  onSyncRaindrop,
}) => {
  const {
    data,
    isLoaded,
    activeSpace,
    setActiveSpace,
    createSpace,
    updateSpace,
    deleteSpace,
    createFolder,
    updateFolder,
    deleteFolder,
    toggleFolderExpand,
    createTab,
    updateTab,
    deleteTab,
    togglePinTab,
    toggleFavouriteTab,
    resetToDefault,
    applyLatestSnapshot,
    favouriteTabs,
    pinnedTabs,
    rootTabs,
    rootFolders,
    getChildFolders,
    getChildTabs,
    syncWithRaindropToken,
    isSyncing: hookIsSyncing,
    lastSyncResult,
  } = useWorkspace();

  // Search/Filter query
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [isSpaceModalOpen, setIsSpaceModalOpen] = useState(false);
  const [editingSpace, setEditingSpace] = useState<Space | null>(null);

  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [defaultFolderParentId, setDefaultFolderParentId] = useState<string | undefined>();

  const [isTabModalOpen, setIsTabModalOpen] = useState(false);
  const [editingTab, setEditingTab] = useState<Tab | null>(null);
  const [defaultTabFolderId, setDefaultTabFolderId] = useState<string | undefined>();
  const [defaultTabPinned, setDefaultTabPinned] = useState(false);
  const [defaultTabFavourite, setDefaultTabFavourite] = useState(false);
  const [initialTabUrl, setInitialTabUrl] = useState('');
  const [initialTabTitle, setInitialTabTitle] = useState('');

  // JSON viewer modal
  const [isJsonModalOpen, setIsJsonModalOpen] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  // Sync state & notifications
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{ message: string; isError?: boolean } | null>(null);

  const isCurrentlySyncing = syncLoading || hookIsSyncing;

  const handleTriggerSync = async () => {
    setSyncFeedback(null);
    setSyncLoading(true);

    try {
      let result: SyncResult | null = null;

      if (onSyncRaindrop) {
        const deviceId = getOrCreateDeviceId();
        const pendingOps = getStoredPendingOperations();
        const res = await onSyncRaindrop({
          localState: data,
          deviceId,
          pendingOps,
        });

        if (res && typeof res === 'object') {
          result = res as SyncResult;
          if (res.success) {
            clearStoredPendingOperations();
            if (res.latestSnapshot) {
              applyLatestSnapshot(res.latestSnapshot);
            }
          }
        }
      } else if (raindropToken) {
        result = await syncWithRaindropToken(raindropToken);
      } else {
        setSyncFeedback({ message: 'Please connect a Raindrop account or token first.', isError: true });
        return;
      }

      if (result) {
        if (result.success) {
          setSyncFeedback({
            message: `✓ Synced with Raindrop! (${result.opsAppliedCount || 0} ops applied)`,
          });
        } else {
          setSyncFeedback({
            message: result.error || 'Failed to sync with Raindrop.',
            isError: true,
          });
        }
      } else if (onSyncRaindrop) {
        setSyncFeedback({ message: '✓ Synced with Raindrop successfully!' });
      }
    } catch (err: any) {
      setSyncFeedback({ message: err?.message || 'Sync error occurred.', isError: true });
    } finally {
      setSyncLoading(false);
      setTimeout(() => {
        setSyncFeedback((prev) => (prev?.isError ? prev : null));
      }, 4000);
    }
  };

  if (!isLoaded) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>
        Loading workspace...
      </div>
    );
  }

  // Active space color accent
  const spaceAccentColor = activeSpace?.colors || '#6366f1';

  // Handler for "+ Tab"
  const handleOpenNewTabModal = (folderId?: string, pinned: boolean = false, favourite: boolean = false) => {
    setEditingTab(null);
    setDefaultTabFolderId(folderId);
    setDefaultTabPinned(pinned);
    setDefaultTabFavourite(favourite);
    setInitialTabUrl('');
    setInitialTabTitle('');
    setIsTabModalOpen(true);
  };

  // Handler for "+ Folder"
  const handleOpenNewFolderModal = (parentFolderId?: string) => {
    setEditingFolder(null);
    setDefaultFolderParentId(parentFolderId);
    setIsFolderModalOpen(true);
  };

  // Handler to capture current tab in browser extension
  const handleCaptureTab = async () => {
    if (!onCaptureCurrentTab || !activeSpace) return;
    setIsCapturing(true);
    try {
      const activeTabInfo = await onCaptureCurrentTab();
      if (activeTabInfo && activeTabInfo.url) {
        setEditingTab(null);
        setDefaultTabFolderId(undefined);
        setDefaultTabPinned(false);
        setDefaultTabFavourite(false);
        setInitialTabUrl(activeTabInfo.url);
        setInitialTabTitle(activeTabInfo.title || '');
        setIsTabModalOpen(true);
      }
    } catch (err) {
      console.warn('Failed to capture active tab:', err);
    } finally {
      setIsCapturing(false);
    }
  };

  // Filter items if searching
  const query = searchQuery.trim().toLowerCase();
  const isSearching = query.length > 0;
  const filteredTabs = isSearching
    ? data.tabs.filter(
        (t) =>
          (t.favourite || t.parentSpaceId === activeSpace?.id) &&
          ((t.customTitle && t.customTitle.toLowerCase().includes(query)) ||
            t.url.toLowerCase().includes(query))
      )
    : [];

  const totalSpaceTabs = data.tabs.filter((t) => !t.favourite && t.parentSpaceId === activeSpace?.id).length;
  const totalSpaceFolders = data.folders.filter((f) => f.parentSpaceId === activeSpace?.id).length;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Global Favourite Tabs Shelf (Visible across all spaces) */}
      <FavouriteTabsShelf
        tabs={favouriteTabs}
        onOpenTab={onOpenTab}
        onEditTab={(tab) => {
          setEditingTab(tab);
          setIsTabModalOpen(true);
        }}
        onDeleteTab={deleteTab}
        onToggleFavouriteTab={toggleFavouriteTab}
        onAddFavouriteTab={() => handleOpenNewTabModal(undefined, false, true)}
      />

      {/* Top Space Switcher Bar */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          padding: '12px',
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Spaces ({data.spaces.length})
          </span>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {(onSyncRaindrop || raindropToken) && (
              <button
                onClick={handleTriggerSync}
                disabled={isCurrentlySyncing}
                title="Sync spaces, folders and tabs with Raindrop.io"
                style={{
                  border: '1px solid #bae6fd',
                  background: isCurrentlySyncing ? '#f0f9ff' : '#e0f2fe',
                  color: '#0284c7',
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: '6px',
                  cursor: isCurrentlySyncing ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>{isCurrentlySyncing ? '⏳' : '💧'}</span>
                <span>{isCurrentlySyncing ? 'Syncing...' : 'Raindrop Sync'}</span>
              </button>
            )}
            <button
              onClick={() => {
                setEditingSpace(null);
                setIsSpaceModalOpen(true);
              }}
              style={{
                border: 'none',
                background: '#f1f5f9',
                color: '#0284c7',
                fontSize: '12px',
                fontWeight: 600,
                padding: '3px 8px',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              + Space
            </button>
            {showJsonInspector && (
              <button
                onClick={() => setIsJsonModalOpen(true)}
                title="Inspect raw workspace JSON in localStorage"
                style={{
                  border: 'none',
                  background: '#f8fafc',
                  color: '#64748b',
                  fontSize: '12px',
                  padding: '3px 6px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                {'{ }'} JSON
              </button>
            )}
          </div>
        </div>

        {/* Sync Feedback Toast Banner */}
        {syncFeedback && (
          <div
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: syncFeedback.isError ? '#fef2f2' : '#f0fdf4',
              color: syncFeedback.isError ? '#b91c1c' : '#15803d',
              border: `1px solid ${syncFeedback.isError ? '#fecaca' : '#bbf7d0'}`,
            }}
          >
            <span>{syncFeedback.message}</span>
            <button
              onClick={() => setSyncFeedback(null)}
              style={{
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontSize: '12px',
                color: 'inherit',
                opacity: 0.7,
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Space Horizontal Pills */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            overflowX: 'auto',
            paddingBottom: '4px',
            scrollbarWidth: 'thin',
          }}
        >
          {data.spaces.map((space) => {
            const isActive = space.id === activeSpace?.id;
            const spaceColor = space.colors || '#6366f1';

            return (
              <div
                key={space.id}
                onClick={() => setActiveSpace(space.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '20px',
                  backgroundColor: isActive ? spaceColor : '#f8fafc',
                  color: isActive ? '#ffffff' : '#334155',
                  border: `1px solid ${isActive ? spaceColor : '#e2e8f0'}`,
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: isActive ? 600 : 500,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transition: 'all 0.15s ease',
                  boxShadow: isActive ? `0 2px 8px ${spaceColor}40` : 'none',
                }}
              >
                <span>{space.emojiIcon || '📁'}</span>
                <span>{space.name}</span>

                {isActive && (
                  <div style={{ display: 'flex', gap: '2px', marginLeft: '4px' }} onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => {
                        setEditingSpace(space);
                        setIsSpaceModalOpen(true);
                      }}
                      title="Edit space"
                      style={{
                        border: 'none',
                        background: 'rgba(255,255,255,0.25)',
                        color: '#ffffff',
                        fontSize: '10px',
                        padding: '1px 4px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      ✏️
                    </button>
                    {data.spaces.length > 1 && (
                      <button
                        onClick={() => {
                          if (confirm(`Delete space "${space.name}" and all its contents?`)) {
                            deleteSpace(space.id);
                          }
                        }}
                        title="Delete space"
                        style={{
                          border: 'none',
                          background: 'rgba(255,255,255,0.25)',
                          color: '#ffffff',
                          fontSize: '10px',
                          padding: '1px 4px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Action Toolbar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {onCaptureCurrentTab && (
            <Button
              size="sm"
              variant="primary"
              onClick={handleCaptureTab}
              isLoading={isCapturing}
              style={{ backgroundColor: spaceAccentColor, borderColor: spaceAccentColor }}
            >
              ⚡ Add Current Tab
            </Button>
          )}

          <Button
            size="sm"
            variant={onCaptureCurrentTab ? 'outline' : 'primary'}
            onClick={() => handleOpenNewTabModal()}
          >
            + Add Tab
          </Button>

          <Button size="sm" variant="secondary" onClick={() => handleOpenNewFolderModal()}>
            + Add Folder
          </Button>
        </div>

        {/* Search Bar */}
        <div style={{ flex: compact ? '1 1 100%' : '0 1 200px' }}>
          <input
            type="text"
            placeholder="Search in space..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              fontSize: '12px',
              boxSizing: 'border-box',
              backgroundColor: '#ffffff',
            }}
          />
        </div>
      </div>

      {/* Search Results Mode */}
      {isSearching ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>
            Found {filteredTabs.length} matching tab(s):
          </div>
          {filteredTabs.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
              No tabs found matching &ldquo;{searchQuery}&rdquo;.
            </div>
          ) : (
            filteredTabs.map((tab) => (
              <TabRow
                key={tab.id}
                tab={tab}
                onOpen={onOpenTab}
                onEdit={(t) => {
                  setEditingTab(t);
                  setIsTabModalOpen(true);
                }}
                onDelete={deleteTab}
                onTogglePin={togglePinTab}
                onToggleFavourite={toggleFavouriteTab}
              />
            ))
          )}
        </div>
      ) : (
        <>
          {/* Pinned Tabs Shelf */}
          <PinnedTabsShelf
            tabs={pinnedTabs}
            onOpenTab={onOpenTab}
            onEditTab={(tab) => {
              setEditingTab(tab);
              setIsTabModalOpen(true);
            }}
            onDeleteTab={deleteTab}
            onTogglePinTab={togglePinTab}
            onToggleFavouriteTab={toggleFavouriteTab}
            onAddPinnedTab={() => handleOpenNewTabModal(undefined, true)}
          />

          {/* Folders & Tabs Hierarchy */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              padding: '12px',
              minHeight: '120px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Space Items ({totalSpaceFolders} folders, {totalSpaceTabs} tabs)
              </span>
            </div>

            {/* Root Folders */}
            {rootFolders.map((folder) => (
              <FolderItem
                key={folder.id}
                folder={folder}
                allFolders={data.folders}
                allTabs={data.tabs}
                onToggleExpand={toggleFolderExpand}
                onEditFolder={(f) => {
                  setEditingFolder(f);
                  setIsFolderModalOpen(true);
                }}
                onDeleteFolder={(fId) => deleteFolder(fId, true)}
                onAddSubFolder={(pFolderId) => handleOpenNewFolderModal(pFolderId)}
                onAddTabInFolder={(pFolderId) => handleOpenNewTabModal(pFolderId, false)}
                onOpenTab={onOpenTab}
                onEditTab={(t) => {
                  setEditingTab(t);
                  setIsTabModalOpen(true);
                }}
                onDeleteTab={deleteTab}
                onTogglePinTab={togglePinTab}
                onToggleFavouriteTab={toggleFavouriteTab}
              />
            ))}

            {/* Root Unpinned Tabs */}
            {rootTabs.map((tab) => (
              <TabRow
                key={tab.id}
                tab={tab}
                onOpen={onOpenTab}
                onEdit={(t) => {
                  setEditingTab(t);
                  setIsTabModalOpen(true);
                }}
                onDelete={deleteTab}
                onTogglePin={togglePinTab}
                onToggleFavourite={toggleFavouriteTab}
              />
            ))}

            {/* Empty State */}
            {rootFolders.length === 0 && rootTabs.length === 0 && pinnedTabs.length === 0 && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '32px 16px',
                  color: '#94a3b8',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span style={{ fontSize: '28px' }}>📂</span>
                <span style={{ fontSize: '14px', fontWeight: 500, color: '#475569' }}>
                  This space is empty
                </span>
                <span style={{ fontSize: '12px' }}>
                  Create a tab or folder above to organize your workflow.
                </span>
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <Button size="sm" variant="primary" onClick={() => handleOpenNewTabModal()}>
                    + Add Tab
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => handleOpenNewFolderModal()}>
                    + Add Folder
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modals */}
      <SpaceModal
        isOpen={isSpaceModalOpen}
        onClose={() => {
          setIsSpaceModalOpen(false);
          setEditingSpace(null);
        }}
        space={editingSpace}
        onSave={(spaceData) => {
          if (editingSpace) {
            updateSpace(editingSpace.id, spaceData);
          } else {
            createSpace(spaceData);
          }
        }}
      />

      <FolderModal
        isOpen={isFolderModalOpen}
        onClose={() => {
          setIsFolderModalOpen(false);
          setEditingFolder(null);
        }}
        folder={editingFolder}
        allFolders={data.folders}
        allSpaces={data.spaces}
        defaultSpaceId={activeSpace?.id}
        defaultParentFolderId={defaultFolderParentId}
        onSave={(folderData) => {
          if (editingFolder) {
            updateFolder(editingFolder.id, folderData);
          } else {
            createFolder(folderData);
          }
        }}
      />

      <TabModal
        isOpen={isTabModalOpen}
        onClose={() => {
          setIsTabModalOpen(false);
          setEditingTab(null);
        }}
        tab={editingTab}
        allFolders={data.folders}
        allSpaces={data.spaces}
        defaultSpaceId={activeSpace?.id}
        defaultFolderId={defaultTabFolderId}
        initialUrl={initialTabUrl}
        initialTitle={initialTabTitle}
        initialPinned={defaultTabPinned}
        initialFavourite={defaultTabFavourite}
        onSave={(tabData) => {
          if (editingTab) {
            updateTab(editingTab.id, tabData);
          } else {
            createTab(tabData);
          }
        }}
      />

      {/* LocalStorage Single JSON Inspector Modal */}
      {isJsonModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
            backdropFilter: 'blur(4px)',
          }}
          onClick={() => setIsJsonModalOpen(false)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              padding: '24px',
              width: '100%',
              maxWidth: '620px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              border: '1px solid #e2e8f0',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                  Single LocalStorage JSON (<code style={{ fontSize: '13px', color: '#0284c7' }}>arcable_workspace_data</code>)
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                  All Spaces, Folders, and Tabs are stored locally as this unified JSON object.
                </p>
              </div>
              <button
                onClick={() => setIsJsonModalOpen(false)}
                style={{
                  border: 'none',
                  background: 'none',
                  fontSize: '18px',
                  cursor: 'pointer',
                  color: '#94a3b8',
                }}
              >
                ✕
              </button>
            </div>

            <pre
              style={{
                flex: 1,
                overflow: 'auto',
                backgroundColor: '#0f172a',
                color: '#38bdf8',
                padding: '12px',
                borderRadius: '8px',
                fontSize: '12px',
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              {JSON.stringify(data, null, 2)}
            </pre>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px' }}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (confirm('Reset workspace to initial demo structure?')) {
                    resetToDefault();
                    setIsJsonModalOpen(false);
                  }
                }}
                style={{ color: '#ef4444' }}
              >
                Reset Demo Data
              </Button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
                    alert('JSON copied to clipboard!');
                  }}
                >
                  📋 Copy JSON
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setIsJsonModalOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
