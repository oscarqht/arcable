'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Space, Folder, Tab, ArcableWorkspaceData } from '../../types/workspace';
import { SyncResult, WorkspaceOperation } from '../../types/sync';
import { useWorkspace } from '../../hooks/useWorkspace';
import {
  getOrCreateDeviceId,
  getStoredPendingOperations,
  clearStoredPendingOperations,
} from '../../utils/syncEngine';
import { Button } from '../Button';
import { SpaceCard } from './SpaceCard';
import { FavouriteTabsShelf } from './FavouriteTabsShelf';
import { SpaceModal } from './SpaceModal';
import { FolderModal } from './FolderModal';
import { TabModal } from './TabModal';
import {
  GridViewIcon,
  ListViewIcon,
  PlusIcon,
  SearchIcon,
  CloseIcon,
  DropletIcon,
  EditIcon,
  TrashIcon,
} from '../Icons';

export interface WorkspaceManagerProps {
  onOpenTab?: (url: string) => void;
  onCaptureCurrentTab?: () => Promise<{ url: string; title?: string; favIconUrl?: string } | null>;
  compact?: boolean;
  headerTitle?: string;
  showJsonInspector?: boolean;
  raindropToken?: string;
  autoSync?: boolean;
  defaultViewMode?: 'grid' | 'focused';
  onSyncRaindrop?: (params: {
    localState: ArcableWorkspaceData;
    deviceId: string;
    pendingOps: WorkspaceOperation[];
  }) => Promise<SyncResult | void | any>;
}

export function WorkspaceManager({
  onOpenTab,
  onCaptureCurrentTab,
  compact = false,
  headerTitle = 'Arcable Workspace',
  showJsonInspector = true,
  raindropToken,
  autoSync = true,
  defaultViewMode = 'grid',
  onSyncRaindrop,
}: WorkspaceManagerProps) {
  const {
    data,
    isLoaded,
    activeSpace,
    sortedSpaces,
    setActiveSpace,
    createSpace,
    updateSpace,
    deleteSpace,
    reorderSpaces,
    moveSpace,
    createFolder,
    updateFolder,
    deleteFolder,
    toggleFolderExpand,
    createTab,
    updateTab,
    deleteTab,
    togglePinTab,
    toggleFavouriteTab,
    reorderSiblingItem,
    moveSiblingItem,
    reorderPinnedTabs,
    reorderFavouriteTabs,
    resetToDefault,
    applyLatestSnapshot,
    favouriteTabs,
    isSyncing: hookIsSyncing,
  } = useWorkspace();

  // View mode: 'grid' (Synctable multi-card dashboard) or 'focused' (Single active space)
  const [viewMode, setViewMode] = useState<'grid' | 'focused'>(compact ? 'focused' : defaultViewMode);

  // Global search query
  const [globalSearch, setGlobalSearch] = useState('');

  // Space collapse map
  const [spaceCollapseMap, setSpaceCollapseMap] = useState<Record<string, boolean>>({});
  const [spacesMounted, setSpacesMounted] = useState(false);

  // Space DnD State
  const [dragOverSpaceId, setDragOverSpaceId] = useState<string | null>(null);
  const [spaceDropPos, setSpaceDropPos] = useState<'before' | 'after' | null>(null);

  // Modals state
  const [isSpaceModalOpen, setIsSpaceModalOpen] = useState(false);
  const [editingSpace, setEditingSpace] = useState<Space | null>(null);

  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [targetSpaceIdForModal, setTargetSpaceIdForModal] = useState<string | undefined>();
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

  // Load persistent space collapse state
  useEffect(() => {
    setSpacesMounted(true);
    const initialMap: Record<string, boolean> = {};
    for (const sp of sortedSpaces) {
      const key = `arcable_collapse_space_${sp.id}`;
      try {
        const stored = localStorage.getItem(key);
        if (stored !== null) {
          initialMap[sp.id] = stored === 'true';
        }
      } catch {}
    }
    setSpaceCollapseMap(initialMap);
  }, [sortedSpaces]);

  const toggleSpaceCollapse = (spaceId: string) => {
    setSpaceCollapseMap((prev) => {
      const current = prev[spaceId] ?? false;
      const next = !current;
      try {
        localStorage.setItem(`arcable_collapse_space_${spaceId}`, String(next));
      } catch {}
      return {
        ...prev,
        [spaceId]: next,
      };
    });
  };

  const performSync = async (silent: boolean = false) => {
    if (!silent) {
      setSyncFeedback(null);
      setSyncLoading(true);
    }

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
        // Token sync fallback handled via API or parent
      } else {
        if (!silent) {
          setSyncFeedback({ message: 'Please connect a Raindrop account or token first.', isError: true });
        }
        return;
      }

      if (result) {
        if (result.success) {
          if (!silent) {
            setSyncFeedback({
              message: `✓ Synced with Raindrop! (${result.opsAppliedCount || 0} operations)`,
            });
          }
        } else {
          if (!silent) {
            setSyncFeedback({
              message: result.error || 'Failed to sync with Raindrop.',
              isError: true,
            });
          }
        }
      } else if (onSyncRaindrop && !silent) {
        setSyncFeedback({ message: '✓ Synced with Raindrop successfully!' });
      }
    } catch (err: any) {
      if (!silent) {
        setSyncFeedback({ message: err?.message || 'Sync error occurred.', isError: true });
      }
    } finally {
      if (!silent) {
        setSyncLoading(false);
        setTimeout(() => {
          setSyncFeedback((prev) => (prev?.isError ? prev : null));
        }, 4000);
      }
    }
  };

  const handleTriggerSync = () => performSync(false);

  // Auto-sync on mount if authenticated
  useEffect(() => {
    if (autoSync && (onSyncRaindrop || raindropToken)) {
      performSync(true);
    }
  }, [autoSync, Boolean(onSyncRaindrop), Boolean(raindropToken)]);

  // Debounced auto-sync when local changes occur
  useEffect(() => {
    if (!autoSync || (!onSyncRaindrop && !raindropToken)) return;

    const pending = getStoredPendingOperations();
    if (pending.length === 0) return;

    const timer = setTimeout(() => {
      performSync(true);
    }, 1500);

    return () => clearTimeout(timer);
  }, [data, autoSync, Boolean(onSyncRaindrop), Boolean(raindropToken)]);

  // Space DnD Handlers
  const handleSpaceDragStart = (e: React.DragEvent, spaceId: string) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ id: spaceId, type: 'space' }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleSpaceDragOver = (e: React.DragEvent, spaceId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    const pos = e.clientX < midX ? 'before' : 'after';
    setDragOverSpaceId(spaceId);
    setSpaceDropPos(pos);
  };

  const handleSpaceDrop = (e: React.DragEvent, targetSpaceId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const pos = spaceDropPos || 'after';
    setDragOverSpaceId(null);
    setSpaceDropPos(null);

    try {
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;
      const parsed = JSON.parse(raw) as { id: string; type: string };
      if (!parsed || parsed.type !== 'space' || parsed.id === targetSpaceId) return;

      reorderSpaces(parsed.id, targetSpaceId, pos);
    } catch {}
  };

  // Open modals
  const handleOpenNewTabModal = (
    spaceId?: string,
    folderId?: string,
    pinned: boolean = false,
    favourite: boolean = false
  ) => {
    setEditingTab(null);
    setTargetSpaceIdForModal(spaceId || activeSpace?.id);
    setDefaultTabFolderId(folderId);
    setDefaultTabPinned(pinned);
    setDefaultTabFavourite(favourite);
    setInitialTabUrl('');
    setInitialTabTitle('');
    setIsTabModalOpen(true);
  };

  const handleOpenNewFolderModal = (spaceId?: string, parentFolderId?: string) => {
    setEditingFolder(null);
    setTargetSpaceIdForModal(spaceId || activeSpace?.id);
    setDefaultFolderParentId(parentFolderId);
    setIsFolderModalOpen(true);
  };

  // Capture active browser tab
  const handleCaptureTab = async () => {
    if (!onCaptureCurrentTab) return;
    setIsCapturing(true);
    try {
      const activeTabInfo = await onCaptureCurrentTab();
      if (activeTabInfo && activeTabInfo.url) {
        setEditingTab(null);
        setTargetSpaceIdForModal(activeSpace?.id);
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

  // Split expanded and collapsed spaces for Synctable grid layout
  const { expandedSpaces, collapsedSpaces } = useMemo(() => {
    const expanded: Space[] = [];
    const collapsed: Space[] = [];

    for (const sp of sortedSpaces) {
      const isSpCollapsed = spacesMounted ? (spaceCollapseMap[sp.id] ?? false) : false;
      if (isSpCollapsed) {
        collapsed.push(sp);
      } else {
        expanded.push(sp);
      }
    }

    return { expandedSpaces: expanded, collapsedSpaces: collapsed };
  }, [sortedSpaces, spaceCollapseMap, spacesMounted]);

  const totalTabsCount = data.tabs.length;
  const totalFoldersCount = data.folders.length;

  if (!isLoaded) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>
        Loading workspace...
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Global Favourite Tabs Shelf */}
      <FavouriteTabsShelf
        tabs={favouriteTabs}
        onOpenTab={onOpenTab}
        onEditTab={(tab) => {
          setEditingTab(tab);
          setTargetSpaceIdForModal(tab.parentSpaceId);
          setIsTabModalOpen(true);
        }}
        onDeleteTab={deleteTab}
        onToggleFavouriteTab={toggleFavouriteTab}
        onAddFavouriteTab={() => handleOpenNewTabModal(undefined, undefined, false, true)}
        onReorderFavouriteTabs={reorderFavouriteTabs}
      />

      {/* Main Dashboard Control Bar */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          padding: '12px 14px',
          backgroundColor: '#ffffff',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          {/* Left: Title, Stats & View Mode Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#475569',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Spaces ({sortedSpaces.length})
            </span>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>
              · {totalTabsCount} tabs · {totalFoldersCount} folders
            </span>

            {/* View Mode Toggle (Grid vs Focused) on WebApp */}
            {!compact && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: '#f1f5f9',
                  padding: '2px',
                  borderRadius: '8px',
                  marginLeft: '4px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  title="Grid View (All spaces rendered as Browser Cards)"
                  style={{
                    border: 'none',
                    backgroundColor: viewMode === 'grid' ? '#ffffff' : 'transparent',
                    color: viewMode === 'grid' ? '#0f172a' : '#64748b',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    boxShadow: viewMode === 'grid' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <GridViewIcon size={14} />
                  <span>Cards Grid</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('focused')}
                  title="Focused Space View (Single space with switcher)"
                  style={{
                    border: 'none',
                    backgroundColor: viewMode === 'focused' ? '#ffffff' : 'transparent',
                    color: viewMode === 'focused' ? '#0f172a' : '#64748b',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    boxShadow: viewMode === 'focused' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <ListViewIcon size={14} />
                  <span>Focused View</span>
                </button>
              </div>
            )}
          </div>

          {/* Right: Actions, Add Space, Sync & JSON Inspector */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            {onCaptureCurrentTab && (
              <Button
                size="sm"
                variant="primary"
                onClick={handleCaptureTab}
                isLoading={isCapturing}
                style={{
                  backgroundColor: '#376757',
                  borderColor: '#376757',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span>⚡ Add Current Tab</span>
              </Button>
            )}

            {(onSyncRaindrop || raindropToken) && (
              <button
                type="button"
                onClick={handleTriggerSync}
                disabled={isCurrentlySyncing}
                title="Sync spaces, folders and tabs with Raindrop.io"
                style={{
                  border: '1px solid #bae6fd',
                  background: isCurrentlySyncing ? '#f0f9ff' : '#e0f2fe',
                  color: '#0284c7',
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '4px 10px',
                  borderRadius: '8px',
                  cursor: isCurrentlySyncing ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  transition: 'all 0.15s ease',
                }}
              >
                <DropletIcon size={13} color="#0284c7" />
                <span>{isCurrentlySyncing ? 'Syncing...' : 'Raindrop Sync'}</span>
              </button>
            )}

            <button
              type="button"
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
                padding: '5px 10px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
              }}
            >
              <PlusIcon size={13} />
              <span>Space</span>
            </button>

            {showJsonInspector && (
              <button
                type="button"
                onClick={() => setIsJsonModalOpen(true)}
                title="Inspect raw workspace JSON in localStorage"
                style={{
                  border: 'none',
                  background: '#f8fafc',
                  color: '#64748b',
                  fontSize: '12px',
                  padding: '5px 8px',
                  borderRadius: '8px',
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
              padding: '6px 12px',
              borderRadius: '8px',
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

        {/* Horizontal Space Pills (Used in Focused Mode or compact extension) */}
        {(viewMode === 'focused' || compact) && (
          <div
            style={{
              display: 'flex',
              gap: '8px',
              overflowX: 'auto',
              paddingBottom: '2px',
              scrollbarWidth: 'thin',
            }}
          >
            {sortedSpaces.map((space, index) => {
              const isActive = space.id === activeSpace?.id;
              const spaceColor = space.colors || '#376757';
              const isDragTarget = dragOverSpaceId === space.id;
              const hasPrev = index > 0;
              const hasNext = index < sortedSpaces.length - 1;

              return (
                <div
                  key={space.id}
                  draggable
                  onDragStart={(e) => handleSpaceDragStart(e, space.id)}
                  onDragOver={(e) => handleSpaceDragOver(e, space.id)}
                  onDragLeave={() => {
                    if (dragOverSpaceId === space.id) {
                      setDragOverSpaceId(null);
                      setSpaceDropPos(null);
                    }
                  }}
                  onDrop={(e) => handleSpaceDrop(e, space.id)}
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
                    borderLeft: isDragTarget && spaceDropPos === 'before' ? '3px solid #0284c7' : undefined,
                    borderRight: isDragTarget && spaceDropPos === 'after' ? '3px solid #0284c7' : undefined,
                    cursor: 'grab',
                    fontSize: '13px',
                    fontWeight: isActive ? 600 : 500,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    transition: 'all 0.15s ease',
                    boxShadow: isActive ? `0 2px 8px ${spaceColor}40` : 'none',
                    userSelect: 'none',
                  }}
                  title={`${space.name} (Click to select, drag to reorder)`}
                >
                  <span>{space.emojiIcon || '📁'}</span>
                  <span>{space.name}</span>

                  {/* Move Left/Right */}
                  {sortedSpaces.length > 1 && (
                    <div
                      style={{ display: 'flex', gap: '2px', marginLeft: '2px' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {hasPrev && (
                        <button
                          type="button"
                          onClick={() => moveSpace(space.id, 'left')}
                          title="Move left"
                          style={{
                            border: 'none',
                            background: isActive ? 'rgba(255,255,255,0.25)' : '#e2e8f0',
                            color: isActive ? '#ffffff' : '#475569',
                            fontSize: '9px',
                            padding: '1px 3px',
                            borderRadius: '3px',
                            cursor: 'pointer',
                          }}
                        >
                          ◀
                        </button>
                      )}
                      {hasNext && (
                        <button
                          type="button"
                          onClick={() => moveSpace(space.id, 'right')}
                          title="Move right"
                          style={{
                            border: 'none',
                            background: isActive ? 'rgba(255,255,255,0.25)' : '#e2e8f0',
                            color: isActive ? '#ffffff' : '#475569',
                            fontSize: '9px',
                            padding: '1px 3px',
                            borderRadius: '3px',
                            cursor: 'pointer',
                          }}
                        >
                          ▶
                        </button>
                      )}
                    </div>
                  )}

                  {isActive && (
                    <div
                      style={{ display: 'flex', gap: '2px', marginLeft: '4px' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
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
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Global Search Toolbar (Grid Mode) */}
      {viewMode === 'grid' && !compact && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '360px' }}>
            <div
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                display: 'flex',
                alignItems: 'center',
                pointerEvents: 'none',
                color: '#94a3b8',
              }}
            >
              <SearchIcon size={16} />
            </div>
            <input
              type="text"
              placeholder="Search across all spaces..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 32px 8px 36px',
                borderRadius: '20px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: '#0f172a',
                fontSize: '13px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {globalSearch && (
              <button
                type="button"
                onClick={() => setGlobalSearch('')}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  border: 'none',
                  background: 'transparent',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                }}
              >
                <CloseIcon size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Content Area: Grid Mode vs Focused Mode */}
      {viewMode === 'grid' && !compact ? (
        /* Synctable Multi-Card Responsive Grid */
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '20px',
            alignItems: 'start',
          }}
        >
          {/* Expanded Space Cards */}
          {expandedSpaces.map((space, idx) => (
            <SpaceCard
              key={space.id}
              space={space}
              allSpaces={sortedSpaces}
              allFolders={data.folders}
              allTabs={data.tabs}
              cardIndex={idx}
              searchQuery={globalSearch}
              isCollapsed={false}
              onToggleCollapse={() => toggleSpaceCollapse(space.id)}
              onOpenTab={onOpenTab}
              onEditSpace={(sp) => {
                setEditingSpace(sp);
                setIsSpaceModalOpen(true);
              }}
              onDeleteSpace={deleteSpace}
              onAddTab={(folderId, pinned) => handleOpenNewTabModal(space.id, folderId, pinned)}
              onAddFolder={(pFolderId) => handleOpenNewFolderModal(space.id, pFolderId)}
              onEditFolder={(f) => {
                setEditingFolder(f);
                setTargetSpaceIdForModal(space.id);
                setIsFolderModalOpen(true);
              }}
              onDeleteFolder={(fId) => deleteFolder(fId, true)}
              onToggleFolderExpand={toggleFolderExpand}
              onEditTab={(t) => {
                setEditingTab(t);
                setTargetSpaceIdForModal(space.id);
                setIsTabModalOpen(true);
              }}
              onDeleteTab={deleteTab}
              onTogglePinTab={togglePinTab}
              onToggleFavouriteTab={toggleFavouriteTab}
              onMoveSiblingItem={moveSiblingItem}
              onReorderSiblingItem={reorderSiblingItem}
              onReorderPinnedTabs={reorderPinnedTabs}
              onMoveSpace={moveSpace}
            />
          ))}

          {/* Stacked Collapsed Space Cards Column (matching Synctable) */}
          {collapsedSpaces.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0, width: '100%' }}>
              {collapsedSpaces.map((space, idx) => (
                <SpaceCard
                  key={space.id}
                  space={space}
                  allSpaces={sortedSpaces}
                  allFolders={data.folders}
                  allTabs={data.tabs}
                  cardIndex={idx}
                  searchQuery={globalSearch}
                  isCollapsed={true}
                  onToggleCollapse={() => toggleSpaceCollapse(space.id)}
                  onOpenTab={onOpenTab}
                  onEditSpace={(sp) => {
                    setEditingSpace(sp);
                    setIsSpaceModalOpen(true);
                  }}
                  onDeleteSpace={deleteSpace}
                  onAddTab={(folderId, pinned) => handleOpenNewTabModal(space.id, folderId, pinned)}
                  onAddFolder={(pFolderId) => handleOpenNewFolderModal(space.id, pFolderId)}
                  onEditFolder={(f) => {
                    setEditingFolder(f);
                    setTargetSpaceIdForModal(space.id);
                    setIsFolderModalOpen(true);
                  }}
                  onDeleteFolder={(fId) => deleteFolder(fId, true)}
                  onToggleFolderExpand={toggleFolderExpand}
                  onEditTab={(t) => {
                    setEditingTab(t);
                    setTargetSpaceIdForModal(space.id);
                    setIsTabModalOpen(true);
                  }}
                  onDeleteTab={deleteTab}
                  onTogglePinTab={togglePinTab}
                  onToggleFavouriteTab={toggleFavouriteTab}
                  onMoveSiblingItem={moveSiblingItem}
                  onReorderSiblingItem={reorderSiblingItem}
                  onReorderPinnedTabs={reorderPinnedTabs}
                  onMoveSpace={moveSpace}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Focused Space View / Sidepanel View */
        activeSpace && (
          <div style={{ width: '100%' }}>
            <SpaceCard
              space={activeSpace}
              allSpaces={sortedSpaces}
              allFolders={data.folders}
              allTabs={data.tabs}
              isSingleColumn={compact}
              alwaysShowActions={compact}
              isCollapsed={false}
              onOpenTab={onOpenTab}
              onEditSpace={(sp) => {
                setEditingSpace(sp);
                setIsSpaceModalOpen(true);
              }}
              onDeleteSpace={deleteSpace}
              onAddTab={(folderId, pinned) => handleOpenNewTabModal(activeSpace.id, folderId, pinned)}
              onAddFolder={(pFolderId) => handleOpenNewFolderModal(activeSpace.id, pFolderId)}
              onEditFolder={(f) => {
                setEditingFolder(f);
                setTargetSpaceIdForModal(activeSpace.id);
                setIsFolderModalOpen(true);
              }}
              onDeleteFolder={(fId) => deleteFolder(fId, true)}
              onToggleFolderExpand={toggleFolderExpand}
              onEditTab={(t) => {
                setEditingTab(t);
                setTargetSpaceIdForModal(activeSpace.id);
                setIsTabModalOpen(true);
              }}
              onDeleteTab={deleteTab}
              onTogglePinTab={togglePinTab}
              onToggleFavouriteTab={toggleFavouriteTab}
              onMoveSiblingItem={moveSiblingItem}
              onReorderSiblingItem={reorderSiblingItem}
              onReorderPinnedTabs={reorderPinnedTabs}
              onMoveSpace={moveSpace}
            />
          </div>
        )
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
        defaultSpaceId={targetSpaceIdForModal || activeSpace?.id}
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
        defaultSpaceId={targetSpaceIdForModal || activeSpace?.id}
        defaultFolderId={defaultTabFolderId}
        initialUrl={initialTabUrl}
        initialTitle={initialTabTitle}
        initialPinned={defaultTabPinned}
        initialFavourite={defaultTabFavourite}
        onDelete={deleteTab}
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
              borderRadius: '14px',
              padding: '24px',
              width: '100%',
              maxWidth: '640px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              border: '1px solid #e2e8f0',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                  Single LocalStorage JSON (<code style={{ fontSize: '13px', color: '#0284c7' }}>arcable_workspace_data</code>)
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                  All Spaces, Folders, and Tabs are stored locally as this unified JSON structure.
                </p>
              </div>
              <button
                type="button"
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
                padding: '14px',
                borderRadius: '10px',
                fontSize: '12px',
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              {JSON.stringify(data, null, 2)}
            </pre>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '14px',
              }}
            >
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
}
