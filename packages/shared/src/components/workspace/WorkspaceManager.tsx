'use client';

import React, { useState, useEffect, useMemo, useCallback, useImperativeHandle, useRef } from 'react';
import { Space, Folder, Tab, TmpTab, ArcableWorkspaceData } from '../../types/workspace';
import { SyncResult, WorkspaceOperation } from '../../types/sync';
import { TabAssociationMap, AudibleTab, MediaControlAction } from '../../types/tabTracker';
import { useWorkspace } from '../../hooks/useWorkspace';
import { useSystemTheme } from '../../hooks/useSystemTheme';
import {
  getOrCreateDeviceId,
  getStoredPendingOperations,
  clearStoredPendingOperations,
  removeStoredPendingOperations,
} from '../../utils/syncEngine';
import { syncWorkspaceWithRaindrop } from '../../utils/raindropSync';
import { startDrag, endDrag, isDragAcceptable, getActiveDrag } from '../../utils/dragState';
import { Button } from '../Button';
import { SpaceCard } from './SpaceCard';
import { FavouriteTabsShelf } from './FavouriteTabsShelf';
import { RaindropSearchInput } from './RaindropSearchInput';
import { RaindropSearchResult } from '../../types/raindrop';
import { TmpTabsList } from './TmpTabsList';
import { AudibleTabsWidget } from './AudibleTabsWidget';
import { SpaceModal } from './SpaceModal';
import { ConvertSpaceModal } from './ConvertSpaceModal';
import { FolderModal } from './FolderModal';
import { TabModal } from './TabModal';
import { ActionDropdown, ActionDropdownItem } from './ActionDropdown';
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

export interface WorkspaceManagerHandle {
  openNewSpace: () => void;
  openJsonModal: () => void;
  triggerSync: () => Promise<void>;
  captureCurrentTab: () => Promise<void>;
  revealAndHighlightTab: (tabId: string) => void;
  isSyncing: boolean;
}

export interface WorkspaceManagerProps {
  onOpenTab?: (url: string, tabId?: string) => void;
  onCaptureCurrentTab?: () => Promise<{ url: string; title?: string; favIconUrl?: string } | null>;

  compact?: boolean;
  alwaysShowActions?: boolean;
  headerTitle?: string;
  showJsonInspector?: boolean;
  hideControlBar?: boolean;
  hideControlBarActions?: boolean;
  hideSearchBar?: boolean;
  searchQuery?: string;
  tabAssociations?: TabAssociationMap;
  tmpTabs?: TmpTab[];
  onCloseTmpTab?: (tab: TmpTab) => void;
  onPromoteTmpTab?: (tab: TmpTab) => void;
  onRenameTmpTab?: (tab: TmpTab, newTitle: string) => void;
  highlightedTabId?: string | null;
  onCloseAssociatedTab?: (tabId: string) => void;
  onResetDivertedUrl?: (tabId: string) => void;
  onTabsChange?: (tabs: Tab[]) => void;
  onSearchChange?: (query: string) => void;
  onSyncStateChange?: (isSyncing: boolean) => void;
  bottomBarMenuItems?: ActionDropdownItem[];
  audibleTabs?: AudibleTab[];
  onActivateAudibleTab?: (tabId: number, windowId?: number) => void;
  onToggleTabMute?: (tabId: number, muted?: boolean) => void;
  onMediaControl?: (browserTabId: number, action: MediaControlAction) => void;
  raindropToken?: string;
  onSearchRaindrop?: (query: string) => Promise<RaindropSearchResult>;
  onSaveToRaindrop?: () => Promise<void>;
  autoSync?: boolean;
  defaultViewMode?: 'grid' | 'focused';
  onSyncRaindrop?: (params: {
    localState: ArcableWorkspaceData;
    deviceId: string;
    pendingOps: WorkspaceOperation[];
  }) => Promise<SyncResult | void | any>;
}


export const WorkspaceManager = React.forwardRef<WorkspaceManagerHandle, WorkspaceManagerProps>(
  function WorkspaceManager(
    {
      onOpenTab,
      onCaptureCurrentTab,
      compact = false,
      alwaysShowActions = false,
      headerTitle = 'Arcable Workspace',
      showJsonInspector = true,
      hideControlBar = false,
      hideControlBarActions = false,
      hideSearchBar = false,
      searchQuery: externalSearchQuery,
      tabAssociations,
      tmpTabs,
      onCloseTmpTab,
      onPromoteTmpTab,
      onRenameTmpTab,
      highlightedTabId,
      onCloseAssociatedTab,
      onResetDivertedUrl,
      onTabsChange,
      onSearchChange,
      onSyncStateChange,
      bottomBarMenuItems,
      audibleTabs,
      onActivateAudibleTab,
      onToggleTabMute,
      onMediaControl,
      raindropToken,
      onSearchRaindrop,
      onSaveToRaindrop,
      autoSync = true,
      defaultViewMode = 'grid',
      onSyncRaindrop,
    }: WorkspaceManagerProps,
    ref: React.Ref<WorkspaceManagerHandle>
  ) {



  const { isDark } = useSystemTheme();
  const {
    data,
    isLoaded,
    activeSpace,
    sortedSpaces,
    setActiveSpace,
    createSpace,
    updateSpace,
    deleteSpace,
    convertSpaceToFolder,
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

  // Notify parent of tab changes (e.g. to associate newly created items with open browser tabs)
  useEffect(() => {
    if (isLoaded && data.tabs) {
      onTabsChange?.(data.tabs);
    }
  }, [data.tabs, isLoaded, onTabsChange]);


  // View mode: 'grid' (Synctable multi-card dashboard) or 'focused' (Single active space)
  const [viewMode, setViewMode] = useState<'grid' | 'focused'>(compact ? 'focused' : defaultViewMode);

  // Global search query (internal fallback when external search is not provided)
  const [globalSearch, setGlobalSearch] = useState('');
  const isExternalSearch = externalSearchQuery !== undefined;
  const activeSearchQuery = isExternalSearch ? externalSearchQuery : globalSearch;

  const handleUpdateSearch = (value: string) => {
    if (!isExternalSearch) {
      setGlobalSearch(value);
    }
    onSearchChange?.(value);
  };

  // Filter tmp tabs when search query is active
  const filteredTmpTabs = useMemo(() => {
    if (!tmpTabs || tmpTabs.length === 0) return [];
    const search = activeSearchQuery.trim().toLowerCase();
    if (!search) return tmpTabs;
    return tmpTabs.filter((t) => {
      const matchTitle = t.title && t.title.toLowerCase().includes(search);
      const matchUrl = t.url && t.url.toLowerCase().includes(search);
      return matchTitle || matchUrl;
    });
  }, [tmpTabs, activeSearchQuery]);

  // Space collapse map
  const [spaceCollapseMap, setSpaceCollapseMap] = useState<Record<string, boolean>>({});
  const [spacesMounted, setSpacesMounted] = useState(false);

  // Space DnD State
  const [dragOverSpaceId, setDragOverSpaceId] = useState<string | null>(null);
  const [spaceDropPos, setSpaceDropPos] = useState<'before' | 'after' | null>(null);
  const [draggingSpaceId, setDraggingSpaceId] = useState<string | null>(null);

  // Modals state
  const [isSpaceModalOpen, setIsSpaceModalOpen] = useState(false);
  const [editingSpace, setEditingSpace] = useState<Space | null>(null);

  const [isConvertSpaceModalOpen, setIsConvertSpaceModalOpen] = useState(false);
  const [convertingSpace, setConvertingSpace] = useState<Space | null>(null);

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
    setSpaceCollapseMap((prev) => {
      let changed = false;
      const nextMap: Record<string, boolean> = { ...prev };
      for (const sp of sortedSpaces) {
        if (nextMap[sp.id] === undefined) {
          const key = `arcable_collapse_space_${sp.id}`;
          try {
            const stored = localStorage.getItem(key);
            if (stored !== null) {
              nextMap[sp.id] = stored === 'true';
              changed = true;
            }
          } catch {}
        }
      }
      return changed ? nextMap : prev;
    });
  }, [sortedSpaces]);

  const prevHighlightedTabIdRef = useRef<string | null | undefined>(undefined);

  // Auto-reveal and expand folder hierarchy when highlightedTabId genuinely changes
  useEffect(() => {
    if (!highlightedTabId) {
      prevHighlightedTabIdRef.current = highlightedTabId;
      return;
    }
    if (prevHighlightedTabIdRef.current === highlightedTabId) {
      return;
    }
    prevHighlightedTabIdRef.current = highlightedTabId;

    const targetTab = data.tabs.find((t) => t.id === highlightedTabId);
    if (!targetTab) return;

    if (targetTab.parentSpaceId) {
      setActiveSpace(targetTab.parentSpaceId);
    }

    if (targetTab.parentFolderId) {
      let currentFolderId: string | undefined = targetTab.parentFolderId;
      while (currentFolderId) {
        const folder = data.folders.find((f) => f.id === currentFolderId);
        if (folder) {
          if (!folder.isExpanded) {
            toggleFolderExpand(folder.id);
          }
          currentFolderId = folder.parentFolderId;
        } else {
          break;
        }
      }
    }
  }, [highlightedTabId, data.tabs, data.folders, setActiveSpace, toggleFolderExpand]);

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

  const activePillRef = useRef<HTMLElement | null>(null);
  const [activeSpaceHeight, setActiveSpaceHeight] = useState<number | undefined>(undefined);
  const spaceCardWrapperRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Dynamically observe and match the height of the active space card in focused/compact mode
  useEffect(() => {
    const activeId = activeSpace?.id;
    if (!activeId) return;
    const el = spaceCardWrapperRefs.current[activeId];
    if (!el) return;

    if (el.offsetHeight > 0) {
      setActiveSpaceHeight(el.offsetHeight);
    }

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.target === el) {
            const h = (entry.target as HTMLElement).offsetHeight || Math.round(entry.contentRect.height);
            if (h > 0) {
              setActiveSpaceHeight(h);
            }
          }
        }
      });
      ro.observe(el);
      return () => {
        ro.disconnect();
      };
    }
  }, [activeSpace?.id, data.tabs, data.folders, sortedSpaces]);

  // Auto-scroll active space pill into view when active space changes
  useEffect(() => {
    if (activePillRef.current) {
      activePillRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [activeSpace?.id]);

  const displaySpaces = useMemo(() => {
    if (sortedSpaces.length <= 1) {
      return sortedSpaces.map((s) => ({ space: s, isClone: false, cloneKey: s.id }));
    }
    const lastSpace = sortedSpaces[sortedSpaces.length - 1];
    const firstSpace = sortedSpaces[0];
    return [
      { space: lastSpace, isClone: true, cloneKey: `${lastSpace.id}-clone-start` },
      ...sortedSpaces.map((s) => ({ space: s, isClone: false, cloneKey: s.id })),
      { space: firstSpace, isClone: true, cloneKey: `${firstSpace.id}-clone-end` },
    ];
  }, [sortedSpaces]);

  const [displayIndex, setDisplayIndex] = useState<number>(() => {
    if (sortedSpaces.length <= 1) return 0;
    const idx = sortedSpaces.findIndex((s) => s.id === activeSpace?.id);
    return idx === -1 ? 1 : idx + 1;
  });
  const [isTransitioning, setIsTransitioning] = useState(true);

  // Sync displayIndex when activeSpace changes from external interactions (like pill clicks)
  useEffect(() => {
    const activeIdx = sortedSpaces.findIndex((s) => s.id === activeSpace?.id);
    if (activeIdx === -1) return;
    if (sortedSpaces.length <= 1) {
      setDisplayIndex(0);
      return;
    }
    // If currently animating at clone boundaries for this space, do not interrupt
    if (displayIndex === 0 && activeIdx === sortedSpaces.length - 1) {
      return;
    }
    if (displayIndex === sortedSpaces.length + 1 && activeIdx === 0) {
      return;
    }
    if (displayIndex !== activeIdx + 1) {
      setDisplayIndex(activeIdx + 1);
      setIsTransitioning(true);
    }
  }, [activeSpace?.id, sortedSpaces]);

  // Re-enable transition after silent snap
  useEffect(() => {
    if (!isTransitioning) {
      const rafId1 = requestAnimationFrame(() => {
        const rafId2 = requestAnimationFrame(() => {
          setIsTransitioning(true);
        });
        return () => cancelAnimationFrame(rafId2);
      });
      return () => cancelAnimationFrame(rafId1);
    }
  }, [isTransitioning]);

  // Fallback safety timer for boundary clone snaps
  useEffect(() => {
    if (sortedSpaces.length >= 2) {
      if (displayIndex === 0 || displayIndex === sortedSpaces.length + 1) {
        const timer = setTimeout(() => {
          setIsTransitioning(false);
          setDisplayIndex(displayIndex === 0 ? sortedSpaces.length : 1);
        }, 400);
        return () => clearTimeout(timer);
      }
    }
  }, [displayIndex, sortedSpaces.length]);

  const handleTrackTransitionEnd = useCallback(
    (e: React.TransitionEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget || e.propertyName !== 'transform') {
        return;
      }
      if (sortedSpaces.length >= 2) {
        if (displayIndex === sortedSpaces.length + 1) {
          setIsTransitioning(false);
          setDisplayIndex(1);
        } else if (displayIndex === 0) {
          setIsTransitioning(false);
          setDisplayIndex(sortedSpaces.length);
        }
      }
    },
    [sortedSpaces.length, displayIndex]
  );

  const activeSpaceIdRef = useRef(activeSpace?.id);
  useEffect(() => {
    activeSpaceIdRef.current = activeSpace?.id;
  }, [activeSpace?.id]);

  const displayIndexRef = useRef(displayIndex);
  useEffect(() => {
    displayIndexRef.current = displayIndex;
  }, [displayIndex]);

  const handleNavigateSpace = useCallback(
    (direction: 'next' | 'prev') => {
      if (sortedSpaces.length <= 1) return;

      const currentSpaceId = activeSpaceIdRef.current;
      const currentActiveIdx = sortedSpaces.findIndex((s) => s.id === currentSpaceId);
      const currentIdx = currentActiveIdx === -1 ? 0 : currentActiveIdx;

      if (direction === 'next') {
        const nextIdx = (currentIdx + 1) % sortedSpaces.length;
        const nextSpace = sortedSpaces[nextIdx];
        activeSpaceIdRef.current = nextSpace.id;

        if (currentIdx === sortedSpaces.length - 1) {
          // Wrap forward: slide to cloned first space at index N + 1
          setIsTransitioning(true);
          setDisplayIndex(sortedSpaces.length + 1);
          setActiveSpace(nextSpace.id);
        } else {
          // If we were at boundary clone, snap silently to 1 before moving
          if (displayIndexRef.current === sortedSpaces.length + 1) {
            setIsTransitioning(false);
            setDisplayIndex(1);
            requestAnimationFrame(() => {
              setIsTransitioning(true);
              setDisplayIndex(nextIdx + 1);
            });
          } else {
            setIsTransitioning(true);
            setDisplayIndex(nextIdx + 1);
          }
          setActiveSpace(nextSpace.id);
        }
      } else {
        const prevIdx = (currentIdx - 1 + sortedSpaces.length) % sortedSpaces.length;
        const prevSpace = sortedSpaces[prevIdx];
        activeSpaceIdRef.current = prevSpace.id;

        if (currentIdx === 0) {
          // Wrap backward: slide to cloned last space at index 0
          setIsTransitioning(true);
          setDisplayIndex(0);
          setActiveSpace(prevSpace.id);
        } else {
          // If we were at boundary clone 0, snap silently to N before moving
          if (displayIndexRef.current === 0) {
            setIsTransitioning(false);
            setDisplayIndex(sortedSpaces.length);
            requestAnimationFrame(() => {
              setIsTransitioning(true);
              setDisplayIndex(prevIdx + 1);
            });
          } else {
            setIsTransitioning(true);
            setDisplayIndex(prevIdx + 1);
          }
          setActiveSpace(prevSpace.id);
        }
      }
    },
    [sortedSpaces, setActiveSpace]
  );

  // Horizontal wheel / two-finger swipe gesture to switch spaces with circular wrap-around
  const wheelAccumulatorRef = useRef(0);
  const wheelIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLockedRef = useRef(false);
  const lastTriggerTimeRef = useRef(0);
  const prevDeltaXRef = useRef(0);
  const recentDeltasRef = useRef<number[]>([]);
  const lastTouchTimeRef = useRef(0);

  useEffect(() => {
    // Only enable gesture in focused space mode or compact/sidepanel view
    if (viewMode !== 'focused' && !compact) {
      return;
    }

    const resetGesture = () => {
      isLockedRef.current = false;
      wheelAccumulatorRef.current = 0;
      recentDeltasRef.current = [];
    };

    const handleWheel = (e: WheelEvent) => {
      // Do nothing if we only have 0 or 1 space or if a modal is open
      if (
        sortedSpaces.length <= 1 ||
        isSpaceModalOpen ||
        isFolderModalOpen ||
        isTabModalOpen ||
        isJsonModalOpen
      ) {
        return;
      }

      // Check if horizontal delta is strictly dominant over vertical delta
      const absX = Math.abs(e.deltaX);
      const absY = Math.abs(e.deltaY);

      // Require horizontal dominance
      const isHorizontalIntent = absX >= 6 && absX > absY * 1.25;

      if (!isHorizontalIntent) {
        return;
      }

      // Don't intercept if user is typing in an input/textarea
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      // Prevent native horizontal page scroll / bounce / back-forward navigation
      e.preventDefault();

      const now = Date.now();
      const timeSinceTrigger = now - lastTriggerTimeRef.current;

      // Track recent deltas to detect acceleration/new swipe intents
      recentDeltasRef.current.push(absX);
      if (recentDeltasRef.current.length > 5) {
        recentDeltasRef.current.shift();
      }

      // Short idle timer: 70ms of silence on horizontal wheel means fingers lifted/paused
      if (wheelIdleTimerRef.current) {
        clearTimeout(wheelIdleTimerRef.current);
      }
      wheelIdleTimerRef.current = setTimeout(resetGesture, 70);

      // If currently locked after a trigger:
      if (isLockedRef.current) {
        // Fast lockout window of 110ms to prevent duplicate triggers from the initial burst
        if (timeSinceTrigger < 110) {
          prevDeltaXRef.current = e.deltaX;
          return;
        }

        // Check if user made a deliberate reversal in swipe direction
        const isReversal =
          (prevDeltaXRef.current > 0 && e.deltaX < -18) ||
          (prevDeltaXRef.current < 0 && e.deltaX > 18);

        // Check if a new consecutive swipe began (acceleration / surge after decay)
        const prevDelta = recentDeltasRef.current[recentDeltasRef.current.length - 2] || 0;
        const isNewBurst = absX >= 26 && absX > prevDelta * 1.25 + 4;

        if (isReversal || isNewBurst) {
          // Unlock immediately for the new swipe gesture!
          isLockedRef.current = false;
          wheelAccumulatorRef.current = 0;
        } else {
          prevDeltaXRef.current = e.deltaX;
          return;
        }
      }

      // Reset accumulation if user changed swipe direction
      if (
        (wheelAccumulatorRef.current > 0 && e.deltaX < 0) ||
        (wheelAccumulatorRef.current < 0 && e.deltaX > 0)
      ) {
        wheelAccumulatorRef.current = 0;
      }

      wheelAccumulatorRef.current += e.deltaX;

      const THRESHOLD = 36;

      if (wheelAccumulatorRef.current >= THRESHOLD) {
        // Swiped left (scrolled right) -> Switch to Next Space
        isLockedRef.current = true;
        lastTriggerTimeRef.current = now;
        prevDeltaXRef.current = e.deltaX;
        wheelAccumulatorRef.current = 0;
        recentDeltasRef.current = [absX];
        handleNavigateSpace('next');
      } else if (wheelAccumulatorRef.current <= -THRESHOLD) {
        // Swiped right (scrolled left) -> Switch to Prev Space
        isLockedRef.current = true;
        lastTriggerTimeRef.current = now;
        prevDeltaXRef.current = e.deltaX;
        wheelAccumulatorRef.current = 0;
        recentDeltasRef.current = [absX];
        handleNavigateSpace('prev');
      }
    };

    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const deltaX = Math.abs(e.touches[0].clientX - touchStartX);
        const deltaY = Math.abs(e.touches[0].clientY - touchStartY);
        if (deltaX > 10 && deltaX > deltaY * 1.25) {
          const target = e.target as HTMLElement | null;
          if (!target || (!['INPUT', 'TEXTAREA'].includes(target.tagName) && !target.isContentEditable)) {
            e.preventDefault();
          }
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (
        sortedSpaces.length <= 1 ||
        isSpaceModalOpen ||
        isFolderModalOpen ||
        isTabModalOpen ||
        isJsonModalOpen
      ) {
        return;
      }
      if (e.changedTouches.length === 1) {
        const deltaX = e.changedTouches[0].clientX - touchStartX;
        const deltaY = e.changedTouches[0].clientY - touchStartY;
        const elapsed = Date.now() - touchStartTime;

        // Snappy touch cooldown: 120ms
        const now = Date.now();
        if (now - lastTouchTimeRef.current < 120) {
          return;
        }

        if (elapsed < 600 && Math.abs(deltaX) > 35 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) {
          const target = e.target as HTMLElement | null;
          if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
            return;
          }

          lastTouchTimeRef.current = now;
          if (deltaX < 0) {
            // Swiped left -> Next space (circle back to 1st)
            handleNavigateSpace('next');
          } else {
            // Swiped right -> Prev space (circle back to last)
            handleNavigateSpace('prev');
          }
        }
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      if (wheelIdleTimerRef.current) {
        clearTimeout(wheelIdleTimerRef.current);
      }
    };
  }, [
    viewMode,
    compact,
    sortedSpaces,
    activeSpace?.id,
    handleNavigateSpace,
    isSpaceModalOpen,
    isFolderModalOpen,
    isTabModalOpen,
    isJsonModalOpen,
  ]);
  const syncLoadingRef = useRef(false);
  const activeSyncPromiseRef = useRef<Promise<SyncResult | void> | null>(null);
  const isCurrentSyncSilentRef = useRef<boolean>(true);
  const queuedManualSyncRef = useRef<boolean>(false);
  const syncSeqRef = useRef<number>(0);

  const executeSyncCycle = async (silent: boolean): Promise<SyncResult | void> => {
    isCurrentSyncSilentRef.current = silent;
    setSyncLoading(true);
    syncLoadingRef.current = true;
    if (!silent) {
      setSyncFeedback(null);
    }
    onSyncStateChange?.(true);

    const currentSeq = ++syncSeqRef.current;

    const syncPromise = (async () => {
      let result: SyncResult | null = null;

      try {
        const deviceId = getOrCreateDeviceId();
        const pendingOps = getStoredPendingOperations();
        const syncedOpIds = pendingOps.map((op) => op.id);

        if (onSyncRaindrop) {
          const res = await onSyncRaindrop({
            localState: data,
            deviceId,
            pendingOps,
          });

          if (currentSeq === syncSeqRef.current) {
            if (res && typeof res === 'object') {
              result = res as SyncResult;
              if (res.success) {
                removeStoredPendingOperations(syncedOpIds);
                if (res.latestSnapshot) {
                  applyLatestSnapshot(res.latestSnapshot);
                }
              }
            }
          }
        } else if (raindropToken) {
          const res = await syncWorkspaceWithRaindrop(raindropToken, {
            localState: data,
            deviceId,
            pendingOps,
          });

          if (currentSeq === syncSeqRef.current) {
            result = res;
            if (res.success) {
              removeStoredPendingOperations(syncedOpIds);
              if (res.latestSnapshot) {
                applyLatestSnapshot(res.latestSnapshot);
              }
            }
          }
        } else {
          if (!isCurrentSyncSilentRef.current) {
            setSyncFeedback({
              message: 'Please connect a Raindrop account or API token first.',
              isError: true,
            });
          }
          return;
        }

        if (currentSeq === syncSeqRef.current && !isCurrentSyncSilentRef.current) {
          if (result) {
            if (result.success) {
              setSyncFeedback({
                message: `✓ Synced with Raindrop! (${result.opsAppliedCount || 0} operations)`,
              });
            } else {
              setSyncFeedback({
                message: result.error || 'Failed to sync with Raindrop.',
                isError: true,
              });
            }
          } else if (!result && onSyncRaindrop) {
            setSyncFeedback({ message: '✓ Synced with Raindrop successfully!' });
          }
        }
        return result ?? undefined;
      } catch (err: any) {
        if (currentSeq === syncSeqRef.current && !isCurrentSyncSilentRef.current) {
          setSyncFeedback({ message: err?.message || 'Sync error occurred.', isError: true });
        }
      } finally {
        if (currentSeq === syncSeqRef.current) {
          if (!isCurrentSyncSilentRef.current) {
            setSyncLoading(false);
            syncLoadingRef.current = false;
            onSyncStateChange?.(false);
            setTimeout(() => {
              setSyncFeedback((prev) => (prev?.isError ? prev : null));
            }, 4000);
          } else {
            setSyncLoading(false);
            syncLoadingRef.current = false;
            onSyncStateChange?.(false);
          }
        }
      }
    })();

    activeSyncPromiseRef.current = syncPromise;

    try {
      return await syncPromise;
    } finally {
      activeSyncPromiseRef.current = null;
      if (queuedManualSyncRef.current) {
        queuedManualSyncRef.current = false;
        return executeSyncCycle(false);
      }
    }
  };

  const performSync = async (silent: boolean = false): Promise<SyncResult | void> => {
    // If user clicked manually, show loading immediately
    if (!silent) {
      setSyncFeedback(null);
      setSyncLoading(true);
      syncLoadingRef.current = true;
      onSyncStateChange?.(true);
    }

    // If an in-flight sync is active
    if (activeSyncPromiseRef.current) {
      if (!silent) {
        // Upgrade running sync to non-silent to display completion feedback
        isCurrentSyncSilentRef.current = false;
        queuedManualSyncRef.current = true;
      }
      try {
        await activeSyncPromiseRef.current;
      } catch {}

      if (queuedManualSyncRef.current) {
        queuedManualSyncRef.current = false;
        return executeSyncCycle(false);
      }
      return;
    }

    return executeSyncCycle(silent);
  };

  const handleTriggerSync = () => {
    void performSync(false);
  };

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
    }, 5000);

    return () => clearTimeout(timer);
  }, [data, autoSync, Boolean(onSyncRaindrop), Boolean(raindropToken)]);

  // Notify parent of syncing state changes
  useEffect(() => {
    onSyncStateChange?.(isCurrentlySyncing);
  }, [isCurrentlySyncing, onSyncStateChange]);

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

  // Expose imperative handle for external control (e.g. Header buttons)
  useImperativeHandle(
    ref,
    () => ({
      openNewSpace: () => {
        setEditingSpace(null);
        setIsSpaceModalOpen(true);
      },
      openJsonModal: () => {
        setIsJsonModalOpen(true);
      },
      triggerSync: async () => {
        await performSync(false);
      },
      captureCurrentTab: async () => {
        await handleCaptureTab();
      },
      revealAndHighlightTab: (tabId: string) => {
        const targetTab = data.tabs.find((t) => t.id === tabId);
        if (!targetTab) return;
        if (targetTab.parentSpaceId) {
          setActiveSpace(targetTab.parentSpaceId);
        }
        if (targetTab.parentFolderId) {
          let currentFolderId: string | undefined = targetTab.parentFolderId;
          while (currentFolderId) {
            const folder = data.folders.find((f) => f.id === currentFolderId);
            if (folder) {
              if (!folder.isExpanded) {
                toggleFolderExpand(folder.id);
              }
              currentFolderId = folder.parentFolderId;
            } else {
              break;
            }
          }
        }
      },
      isSyncing: isCurrentlySyncing,
    }),
    [isCurrentlySyncing, performSync, handleCaptureTab, data.tabs, data.folders, setActiveSpace, toggleFolderExpand]
  );


  // Space DnD Handlers
  const handleSpaceDragStart = (e: React.DragEvent, spaceId: string) => {
    startDrag(e, { id: spaceId, type: 'space' });
    setDraggingSpaceId(spaceId);
  };

  const handleSpaceDragOver = (e: React.DragEvent, spaceId: string) => {
    if (!isDragAcceptable(e, ['space'])) {
      return;
    }
    const activeDrag = getActiveDrag();
    if (activeDrag && activeDrag.id === spaceId) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    const pos = e.clientX < midX ? 'before' : 'after';
    setDragOverSpaceId(spaceId);
    setSpaceDropPos(pos);
  };

  const handleSpaceDragLeave = (e: React.DragEvent, spaceId: string) => {
    if (dragOverSpaceId === spaceId) {
      setDragOverSpaceId(null);
      setSpaceDropPos(null);
    }
  };

  const handleSpaceDrop = (e: React.DragEvent, targetSpaceId: string) => {
    if (!isDragAcceptable(e, ['space'])) {
      endDrag();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const pos = spaceDropPos || 'after';
    setDragOverSpaceId(null);
    setSpaceDropPos(null);
    setDraggingSpaceId(null);

    try {
      const raw = e.dataTransfer.getData('application/json');
      const activeDrag = getActiveDrag();
      const sourceId = activeDrag?.id || (raw ? (JSON.parse(raw) as { id: string }).id : null);
      if (!sourceId || sourceId === targetSpaceId) return;

      reorderSpaces(sourceId, targetSpaceId, pos);
    } catch {} finally {
      endDrag();
    }
  };

  const handleSpaceDragEnd = () => {
    endDrag();
    setDraggingSpaceId(null);
    setDragOverSpaceId(null);
    setSpaceDropPos(null);
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

  const handlePromoteTmpTab = (tmpTab: TmpTab) => {
    if (onPromoteTmpTab) {
      onPromoteTmpTab(tmpTab);
      return;
    }
    setEditingTab(null);
    setTargetSpaceIdForModal(activeSpace?.id);
    setDefaultTabFolderId(undefined);
    setDefaultTabPinned(false);
    setDefaultTabFavourite(false);
    setInitialTabUrl(tmpTab.url);
    setInitialTabTitle(tmpTab.customTitle || tmpTab.title || '');
    setIsTabModalOpen(true);
  };

  const handleOpenNewFolderModal = (spaceId?: string, parentFolderId?: string) => {

    setEditingFolder(null);
    setTargetSpaceIdForModal(spaceId || activeSpace?.id);
    setDefaultFolderParentId(parentFolderId);
    setIsFolderModalOpen(true);
  };

  const handleOpenConvertSpaceModal = (spaceToConvert: Space) => {
    setConvertingSpace(spaceToConvert);
    setIsConvertSpaceModalOpen(true);
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
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 16px',
          gap: '12px',
          color: isDark ? '#94a3b8' : '#64748b',
          fontSize: '13px',
          fontWeight: 500,
        }}
      >
        <style>{`@keyframes arcable-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        <div
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            border: `2px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
            borderTopColor: '#38bdf8',
            animation: 'arcable-spin 0.8s linear infinite',
          }}
        />
        <span>Loading workspace...</span>
      </div>
    );
  }


  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? '8px' : '16px',
        width: '100%',
        flex: compact ? '1 0 auto' : undefined,
        minHeight: compact ? '100%' : undefined,
        paddingBottom: compact ? '80px' : undefined,
        boxSizing: 'border-box',
      }}
    >


      {/* Global Favourite Tabs Shelf */}
      <FavouriteTabsShelf
        tabs={favouriteTabs}
        tabAssociations={tabAssociations}
        highlightedTabId={highlightedTabId}
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

      {/* Raindrop Search Input & Filter with Inline Results */}
      {!hideSearchBar && (
        <RaindropSearchInput
          raindropToken={raindropToken}
          onSearchRaindrop={onSearchRaindrop}
          onSaveToRaindrop={onSaveToRaindrop}
          onOpenTab={onOpenTab}
          compact={compact}
          searchQuery={activeSearchQuery}
          onSearchChange={handleUpdateSearch}
        />
      )}

      {/* Main Dashboard Control Bar (Hidden in compact / sidepanel mode) */}
      {!hideControlBar && !compact && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            padding: '12px 14px',
            backgroundColor: isDark ? '#151e2e' : '#ffffff',
            borderRadius: '14px',
            border: `1px solid ${isDark ? '#243247' : '#e2e8f0'}`,
            boxShadow: isDark ? '0 1px 3px rgba(0, 0, 0, 0.3)' : '0 1px 3px rgba(0, 0, 0, 0.04)',
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
                color: isDark ? '#cbd5e1' : '#475569',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Spaces ({sortedSpaces.length})
            </span>
            <span style={{ fontSize: '12px', color: isDark ? '#64748b' : '#94a3b8' }}>
              · {totalTabsCount} tabs · {totalFoldersCount} folders
            </span>

            {/* View Mode Toggle (Grid vs Focused) on WebApp */}
            {!compact && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: isDark ? '#0f172a' : '#f1f5f9',
                  padding: '2px',
                  borderRadius: '8px',
                  marginLeft: '4px',
                  border: isDark ? '1px solid #1e293b' : 'none',
                }}
              >
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  title="Grid View (All spaces rendered as Browser Cards)"
                  style={{
                    border: 'none',
                    backgroundColor: viewMode === 'grid' ? (isDark ? '#1e293b' : '#ffffff') : 'transparent',
                    color: viewMode === 'grid' ? (isDark ? '#f8fafc' : '#0f172a') : (isDark ? '#94a3b8' : '#64748b'),
                    padding: '4px 8px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    boxShadow: viewMode === 'grid' ? (isDark ? '0 1px 2px rgba(0,0,0,0.4)' : '0 1px 2px rgba(0,0,0,0.06)') : 'none',
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
                    backgroundColor: viewMode === 'focused' ? (isDark ? '#1e293b' : '#ffffff') : 'transparent',
                    color: viewMode === 'focused' ? (isDark ? '#f8fafc' : '#0f172a') : (isDark ? '#94a3b8' : '#64748b'),
                    padding: '4px 8px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    boxShadow: viewMode === 'focused' ? (isDark ? '0 1px 2px rgba(0,0,0,0.4)' : '0 1px 2px rgba(0,0,0,0.06)') : 'none',
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
          {!hideControlBarActions && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              {onCaptureCurrentTab && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={handleCaptureTab}
                  isLoading={isCapturing}
                  style={{
                    backgroundColor: '#5c7c6f',
                    borderColor: '#5c7c6f',
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
                    border: isDark ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid #bae6fd',
                    background: isDark
                      ? (isCurrentlySyncing ? 'rgba(56, 189, 248, 0.12)' : 'rgba(56, 189, 248, 0.18)')
                      : (isCurrentlySyncing ? '#f0f9ff' : '#e0f2fe'),
                    color: isDark ? '#38bdf8' : '#0284c7',
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
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      animation: isCurrentlySyncing ? 'spin 1s linear infinite' : 'none',
                    }}
                  >
                    <DropletIcon size={13} color={isDark ? '#38bdf8' : '#0284c7'} />
                  </span>
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
                  border: isDark ? '1px solid rgba(56, 189, 248, 0.3)' : 'none',
                  background: isDark ? 'rgba(56, 189, 248, 0.18)' : '#f1f5f9',
                  color: isDark ? '#38bdf8' : '#0284c7',
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
                    border: isDark ? '1px solid #334155' : 'none',
                    background: isDark ? '#151e2e' : '#f8fafc',
                    color: isDark ? '#94a3b8' : '#64748b',
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
          )}
        </div>

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
            {sortedSpaces.map((space) => {
              const isActive = space.id === activeSpace?.id;
              const spaceColor = space.colors || '#919bb5';
              const isDragTarget = dragOverSpaceId === space.id;

              return (
                <div
                  key={space.id}
                  ref={isActive ? (el) => { activePillRef.current = el; } : null}
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
                  onDragEnd={handleSpaceDragEnd}
                  onClick={() => setActiveSpace(space.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '7px 14px',
                    borderRadius: '24px',
                    backgroundColor: isActive ? spaceColor : (isDark ? '#1e293b' : '#f8fafc'),
                    color: isActive ? '#ffffff' : (isDark ? '#e2e8f0' : '#334155'),
                    border: `1px solid ${isActive ? spaceColor : (isDark ? '#334155' : '#e2e8f0')}`,
                    borderLeft: isDragTarget && spaceDropPos === 'before' ? '3px solid #0284c7' : undefined,
                    borderRight: isDragTarget && spaceDropPos === 'after' ? '3px solid #0284c7' : undefined,
                    opacity: draggingSpaceId === space.id ? 0.45 : 1,
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
      )}


      {/* Content Area: Grid Mode vs Focused Mode */}
      {viewMode === 'grid' && !compact ? (
        /* Synctable Multi-Card Responsive Grid */
        <>
          <div
            className="space-cards-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))',
              gap: '22px',
              alignItems: 'start',
            }}
          >
            {/* Expanded Space Cards */}
            {expandedSpaces.map((space, idx) => (
              <div
                key={space.id}
                draggable
                onDragStart={(e) => handleSpaceDragStart(e, space.id)}
                onDragOver={(e) => handleSpaceDragOver(e, space.id)}
                onDragLeave={(e) => handleSpaceDragLeave(e, space.id)}
                onDrop={(e) => handleSpaceDrop(e, space.id)}
                onDragEnd={handleSpaceDragEnd}
                style={{
                  position: 'relative',
                  transition: 'transform 0.15s ease, opacity 0.15s ease',
                  opacity: draggingSpaceId === space.id ? 0.45 : 1,
                  cursor: 'grab',
                }}
              >
                {/* Drop Position Indicator */}
                {dragOverSpaceId === space.id && draggingSpaceId !== space.id && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      width: '4px',
                      backgroundColor: '#0284c7',
                      borderRadius: '4px',
                      zIndex: 20,
                      pointerEvents: 'none',
                      left: spaceDropPos === 'before' ? '-12px' : undefined,
                      right: spaceDropPos === 'after' ? '-12px' : undefined,
                      boxShadow: '0 0 10px rgba(2, 132, 199, 0.7)',
                    }}
                  />
                )}
                <SpaceCard
                  space={space}
                  allSpaces={sortedSpaces}
                  allFolders={data.folders}
                  allTabs={data.tabs}
                  cardIndex={idx}
                  searchQuery={activeSearchQuery}
                  isCollapsed={false}
                  tabAssociations={tabAssociations}
                  audibleTabs={audibleTabs}
                  highlightedTabId={highlightedTabId}
                  onToggleCollapse={() => toggleSpaceCollapse(space.id)}
                  onOpenTab={onOpenTab}
                  onCloseAssociatedTab={onCloseAssociatedTab}
                  onResetDivertedUrl={onResetDivertedUrl}
                  onMediaControl={onMediaControl}
                  onEditSpace={(sp) => {
                    setEditingSpace(sp);
                    setIsSpaceModalOpen(true);
                  }}

                  onDeleteSpace={deleteSpace}
                  onConvertSpace={handleOpenConvertSpaceModal}
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
              </div>
            ))}

            {/* Stacked Collapsed Space Cards Column (matching Synctable) */}
            {collapsedSpaces.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0, width: '100%' }}>
                {collapsedSpaces.map((space, idx) => (
                  <div
                    key={space.id}
                    draggable
                    onDragStart={(e) => handleSpaceDragStart(e, space.id)}
                    onDragOver={(e) => handleSpaceDragOver(e, space.id)}
                    onDragLeave={(e) => handleSpaceDragLeave(e, space.id)}
                    onDrop={(e) => handleSpaceDrop(e, space.id)}
                    onDragEnd={handleSpaceDragEnd}
                    style={{
                      position: 'relative',
                      transition: 'transform 0.15s ease, opacity 0.15s ease',
                      opacity: draggingSpaceId === space.id ? 0.45 : 1,
                      cursor: 'grab',
                    }}
                  >
                    {dragOverSpaceId === space.id && draggingSpaceId !== space.id && (
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          height: '4px',
                          backgroundColor: '#0284c7',
                          borderRadius: '4px',
                          zIndex: 20,
                          pointerEvents: 'none',
                          top: spaceDropPos === 'before' ? '-6px' : undefined,
                          bottom: spaceDropPos === 'after' ? '-6px' : undefined,
                          boxShadow: '0 0 10px rgba(2, 132, 199, 0.7)',
                        }}
                      />
                    )}
                    <SpaceCard
                      space={space}
                      allSpaces={sortedSpaces}
                      allFolders={data.folders}
                      allTabs={data.tabs}
                      cardIndex={idx}
                      searchQuery={activeSearchQuery}
                      alwaysShowActions={alwaysShowActions}
                      isCollapsed={true}
                      tabAssociations={tabAssociations}
                      audibleTabs={audibleTabs}
                      highlightedTabId={highlightedTabId}
                      onToggleCollapse={() => toggleSpaceCollapse(space.id)}
                      onOpenTab={onOpenTab}
                      onCloseAssociatedTab={onCloseAssociatedTab}
                      onResetDivertedUrl={onResetDivertedUrl}
                      onMediaControl={onMediaControl}
                      onEditSpace={(sp) => {
                        setEditingSpace(sp);
                        setIsSpaceModalOpen(true);
                      }}
                      onDeleteSpace={deleteSpace}
                      onConvertSpace={handleOpenConvertSpaceModal}
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
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tmp Tabs List in Grid View */}
          {filteredTmpTabs.length > 0 && (
            <TmpTabsList
              tabs={filteredTmpTabs}
              compact={compact}
              alwaysShowActions={alwaysShowActions}
              highlightedTabId={highlightedTabId}
              audibleTabs={audibleTabs}
              onOpen={onOpenTab}
              onPromote={handlePromoteTmpTab}
              onClose={(t) => onCloseTmpTab?.(t)}
              onRename={onRenameTmpTab}
              onMediaControl={onMediaControl}
            />
          )}

        </>
      ) : (
        /* Focused Space View / Sidepanel View with Horizontal Sliding Carousel */
        sortedSpaces.length > 0 && (
          <div
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              flexShrink: 0,
              height: activeSpaceHeight !== undefined ? `${activeSpaceHeight}px` : 'auto',
              transition: 'height 0.35s cubic-bezier(0.25, 1, 0.5, 1)',
            }}
          >
            <div
              onTransitionEnd={handleTrackTransitionEnd}
              style={{
                display: 'flex',
                flexDirection: 'row',
                width: '100%',
                gap: '20px',
                transform: `translateX(calc(-${displayIndex * 100}% - ${displayIndex * 20}px))`,
                transition: isTransitioning ? 'transform 0.35s cubic-bezier(0.25, 1, 0.5, 1)' : 'none',
                willChange: 'transform',
                alignItems: 'flex-start',
              }}
            >
              {displaySpaces.map(({ space, isClone, cloneKey }) => (
                <div
                  key={cloneKey}
                  ref={
                    !isClone
                      ? (el) => {
                          spaceCardWrapperRefs.current[space.id] = el;
                        }
                      : undefined
                  }
                  style={{
                    width: '100%',
                    minWidth: '100%',
                    maxWidth: '100%',
                    flexShrink: 0,
                    boxSizing: 'border-box',
                    pointerEvents: isClone ? 'none' : 'auto',
                  }}
                >
                  <SpaceCard
                    space={space}
                    allSpaces={sortedSpaces}
                    allFolders={data.folders}
                    allTabs={data.tabs}
                    searchQuery={activeSearchQuery}
                    isSingleColumn={compact}
                    alwaysShowActions={alwaysShowActions}
                    isCollapsed={false}
                    tabAssociations={tabAssociations}
                    audibleTabs={audibleTabs}
                    highlightedTabId={highlightedTabId}
                    onOpenTab={onOpenTab}
                    onCloseAssociatedTab={onCloseAssociatedTab}
                    onResetDivertedUrl={onResetDivertedUrl}
                    onMediaControl={onMediaControl}
                    onEditSpace={(sp) => {
                      setEditingSpace(sp);
                      setIsSpaceModalOpen(true);
                    }}
                    onDeleteSpace={deleteSpace}
                    onConvertSpace={handleOpenConvertSpaceModal}
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
                </div>
              ))}
            </div>
          </div>
        )
      )}

      {/* Tmp Tabs List (Single instance in focused/sidepanel view, flows directly below the active card) */}
      {(viewMode === 'focused' || compact) && filteredTmpTabs.length > 0 && (
        <TmpTabsList
          tabs={filteredTmpTabs}
          compact={compact}
          alwaysShowActions={alwaysShowActions}
          highlightedTabId={highlightedTabId}
          audibleTabs={audibleTabs}
          onOpen={onOpenTab}
          onPromote={handlePromoteTmpTab}
          onClose={(t) => onCloseTmpTab?.(t)}
          onRename={onRenameTmpTab}
          onMediaControl={onMediaControl}
        />
      )}


      {/* Fixed Audible Tabs Floating Stack (Compact / Sidepanel mode) */}
      {compact && audibleTabs && audibleTabs.length > 0 && (
        <AudibleTabsWidget
          tabs={audibleTabs}
          isDarkTheme={isDark}
          onActivateTab={onActivateAudibleTab}
          onToggleMute={onToggleTabMute}
        />
      )}

      {/* Fixed Bottom Spaces Selector (Sidepanel / Compact mode: semi-transparent, 100% rounded corner, margins) */}

      {compact && sortedSpaces.length > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: '12px',
            left: '16px',
            right: '16px',
            zIndex: 30,
            backgroundColor: isDark ? 'rgba(21, 30, 46, 0.88)' : 'rgba(255, 255, 255, 0.78)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: isDark ? '1px solid rgba(51, 65, 85, 0.85)' : '1px solid rgba(226, 232, 240, 0.85)',
            borderRadius: '9999px',
            padding: '5px 10px',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-around',
            boxShadow: isDark
              ? '0 4px 16px -2px rgba(0, 0, 0, 0.45), 0 2px 6px -1px rgba(0, 0, 0, 0.3)'
              : '0 4px 16px -2px rgba(0, 0, 0, 0.08), 0 2px 6px -1px rgba(0, 0, 0, 0.04)',
            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >

          {sortedSpaces.map((space) => {
            const isActive = space.id === activeSpace?.id;
            const spaceColor = space.colors || '#3b82f6';
            const isDragTarget = dragOverSpaceId === space.id;

            let boxShadow = 'none';
            if (isDragTarget) {
              if (spaceDropPos === 'before') {
                boxShadow = '-2px 0 0 0 #0284c7';
              } else if (spaceDropPos === 'after') {
                boxShadow = '2px 0 0 0 #0284c7';
              }
            } else if (isActive) {
              boxShadow = `0 0 0 1.5px ${spaceColor}, 0 2px 6px ${spaceColor}35`;
            }

            return (
              <button
                key={space.id}
                ref={isActive ? (el) => { activePillRef.current = el; } : null}
                type="button"
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
                onDragEnd={handleSpaceDragEnd}
                onClick={() => setActiveSpace(space.id)}
                title={`${space.name} (Click to select, drag to reorder)`}
                aria-label={space.name}
                style={{
                  WebkitAppearance: 'none',
                  appearance: 'none',
                  border: 'none',
                  outline: 'none',
                  background: isActive ? `${spaceColor}18` : 'transparent',
                  borderRadius: '9999px',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '16px',
                  lineHeight: 1,
                  position: 'relative',
                  opacity: draggingSpaceId === space.id ? 0.4 : 1,
                  boxShadow,
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                  transform: isActive ? 'scale(1.08)' : 'scale(1)',
                  userSelect: 'none',
                  padding: 0,
                  boxSizing: 'border-box',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', lineHeight: 1 }}>
                  {space.emojiIcon || '📁'}
                </span>
                {isActive && (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: '2px',
                      width: '6px',
                      height: '2px',
                      borderRadius: '2px',
                      backgroundColor: spaceColor,
                      transition: 'all 0.25s ease',
                    }}
                  />
                )}
              </button>
            );
          })}

          {bottomBarMenuItems && bottomBarMenuItems.length > 0 && (
            <ActionDropdown
              items={bottomBarMenuItems}
              isDarkTheme={isDark}
              align="right"
              buttonTitle={isCurrentlySyncing ? 'Syncing with Raindrop...' : 'More options'}
              triggerIcon={
                isCurrentlySyncing ? (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '15px',
                      lineHeight: 1,
                      animation: 'arcable-spin 1s linear infinite',
                    }}
                  >
                    💧
                  </span>
                ) : undefined
              }
              buttonStyle={{
                width: '32px',
                height: '32px',
                borderRadius: '9999px',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isDark ? '#cbd5e1' : '#475569',
              }}
            />
          )}
        </div>
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

      <ConvertSpaceModal
        isOpen={isConvertSpaceModalOpen}
        onClose={() => {
          setIsConvertSpaceModalOpen(false);
          setConvertingSpace(null);
        }}
        space={convertingSpace}
        allSpaces={data.spaces}
        allFolders={data.folders}
        onConvert={(sourceSpaceId, targetSpaceId, targetParentFolderId) => {
          convertSpaceToFolder(sourceSpaceId, targetSpaceId, targetParentFolderId);
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
        onDelete={(fId) => deleteFolder(fId, true)}
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
              backgroundColor: isDark ? '#151e2e' : '#ffffff',
              borderRadius: '14px',
              padding: '24px',
              width: '100%',
              maxWidth: '640px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: isDark ? '0 20px 25px -5px rgba(0, 0, 0, 0.5)' : '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              border: `1px solid ${isDark ? '#243247' : '#e2e8f0'}`,
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
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: isDark ? '#f8fafc' : '#0f172a' }}>
                  Single LocalStorage JSON (<code style={{ fontSize: '13px', color: '#38bdf8' }}>arcable_workspace_data</code>)
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: isDark ? '#94a3b8' : '#64748b' }}>
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

      {/* Bottom Fixed Black Toast Alert */}
      {syncFeedback && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 99999,
            backgroundColor: '#0f172a',
            color: '#ffffff',
            padding: '10px 16px',
            borderRadius: '12px',
            boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4)',
            border: '1px solid rgba(255, 255, 255, 0.14)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            fontSize: '13px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            maxWidth: 'calc(100vw - 32px)',
            boxSizing: 'border-box',
            pointerEvents: 'auto',
            userSelect: 'none',
            transition: 'all 0.2s ease',
          }}
        >
          {syncFeedback.isError ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                backgroundColor: '#ef4444',
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              !
            </span>
          ) : (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                backgroundColor: '#10b981',
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              ✓
            </span>
          )}
          <span
            style={{
              color: '#f8fafc',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              letterSpacing: '-0.01em',
            }}
          >
            {syncFeedback.message.replace(/^[✓✕!]\s*/, '')}
          </span>
          <button
            type="button"
            onClick={() => setSyncFeedback(null)}
            aria-label="Dismiss notification"
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: '13px',
              color: 'rgba(255, 255, 255, 0.6)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2px 4px',
              borderRadius: '4px',
              marginLeft: '4px',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#ffffff';
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
});
