'use client';

import React, { useState, useMemo } from 'react';
import { Space, Folder, Tab } from '../../types/workspace';
import { TabAssociationMap } from '../../types/tabTracker';
import {
  isDarkColor,
  getSpaceColorStyle,
  getAllSpaceTabUrls,
  getDomain,
  getFaviconUrl,
  isValidHttpUrl,
} from '../../utils/treeUtils';
import { getSortedSiblings } from '../../hooks/useWorkspace';
import { useSystemTheme } from '../../hooks/useSystemTheme';
import { useIsMobile } from '../../hooks/useIsMobile';
import { TabRow } from './TabRow';
import { FolderItem } from './FolderItem';
import { ActionDropdown, ActionDropdownItem } from './ActionDropdown';
import {
  CopyIcon,
  CheckIcon,
  ExternalLinkIcon,
  PlusIcon,
  SearchIcon,
  CloseIcon,
  EditIcon,
  TrashIcon,
  FolderIcon,
  FolderPlusIcon,
  FolderInputIcon,
} from '../Icons';

export interface SpaceCardProps {
  space: Space;
  allSpaces?: Space[];
  allFolders: Folder[];
  allTabs: Tab[];
  searchQuery?: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  cardIndex?: number;
  isSingleColumn?: boolean;
  alwaysShowActions?: boolean;
  tabAssociations?: TabAssociationMap;
  highlightedTabId?: string | null;
  onOpenTab?: (url: string, tabId?: string) => void;
  onCloseAssociatedTab?: (tabId: string) => void;

  onResetDivertedUrl?: (tabId: string) => void;
  onEditSpace?: (space: Space) => void;
  onDeleteSpace?: (spaceId: string) => void;
  onConvertSpace?: (space: Space) => void;
  onAddTab?: (folderId?: string, pinned?: boolean) => void;
  onAddFolder?: (parentFolderId?: string) => void;
  onEditFolder?: (folder: Folder) => void;
  onDeleteFolder?: (folderId: string) => void;
  onToggleFolderExpand?: (folderId: string) => void;
  onEditTab?: (tab: Tab) => void;
  onDeleteTab?: (tabId: string) => void;
  onTogglePinTab?: (tabId: string) => void;
  onToggleFavouriteTab?: (tabId: string) => void;
  onMoveSiblingItem?: (itemId: string, itemType: 'folder' | 'tab', direction: 'up' | 'down') => void;
  onReorderSiblingItem?: (params: {
    sourceId: string;
    sourceType: 'folder' | 'tab';
    targetId: string;
    targetType: 'folder' | 'tab';
    position: 'before' | 'after' | 'inside';
  }) => void;
  onReorderPinnedTabs?: (sourceTabId: string, targetTabId: string, position: 'before' | 'after') => void;
  onMoveSpace?: (spaceId: string, direction: 'left' | 'right') => void;
}

export const SpaceCard: React.FC<SpaceCardProps> = ({
  space,
  allSpaces = [],
  allFolders,
  allTabs,
  searchQuery: externalSearch = '',
  isCollapsed: controlledIsCollapsed,
  onToggleCollapse,
  cardIndex = 0,
  isSingleColumn = false,
  alwaysShowActions = false,
  tabAssociations,
  highlightedTabId,
  onOpenTab,
  onCloseAssociatedTab,
  onResetDivertedUrl,
  onEditSpace,
  onDeleteSpace,
  onConvertSpace,
  onAddTab,
  onAddFolder,
  onEditFolder,
  onDeleteFolder,
  onToggleFolderExpand,
  onEditTab,
  onDeleteTab,
  onTogglePinTab,
  onToggleFavouriteTab,
  onMoveSiblingItem,
  onReorderSiblingItem,
  onReorderPinnedTabs,
  onMoveSpace,
}) => {

  const { isDark: isSystemDark } = useSystemTheme();
  const isMobile = useIsMobile();
  const [internalSearch, setInternalSearch] = useState('');
  const [copied, setCopied] = useState(false);
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const [isCardHovered, setIsCardHovered] = useState(false);

  const isControlled = controlledIsCollapsed !== undefined;
  const isCollapsed = isControlled ? controlledIsCollapsed : internalCollapsed;

  const toggleCollapse = () => {
    if (onToggleCollapse) {
      onToggleCollapse();
    } else {
      setInternalCollapsed((prev) => !prev);
    }
  };

  const activeSearch = (externalSearch || internalSearch).trim().toLowerCase();

  // Space contents
  const spaceTabs = useMemo(() => {
    return allTabs.filter((t) => !t.favourite && (t.parentSpaceId === space.id || !t.parentSpaceId));
  }, [allTabs, space.id]);

  const rootSiblings = useMemo(() => {
    return getSortedSiblings(allFolders, allTabs, space.id, undefined);
  }, [allFolders, allTabs, space.id]);


  // Color Archetype and custom theme determination
  const hasExplicitColor = Boolean(space.colors && space.colors.trim());
  const isDark = hasExplicitColor ? isDarkColor(space.colors) : false;

  // Archetype rotation when no custom color is specified
  const archetype = useMemo<'neutral' | 'primary' | 'secondary' | 'tertiary'>(() => {
    if (hasExplicitColor) return 'neutral';
    const archetypes: Array<'neutral' | 'primary' | 'secondary' | 'tertiary'> = [
      'neutral',
      'primary',
      'secondary',
      'tertiary',
    ];
    const positiveIndex = ((cardIndex % archetypes.length) + archetypes.length) % archetypes.length;
    return archetypes[positiveIndex];
  }, [cardIndex, hasExplicitColor]);

  // Theme styling configuration
  const themeStyles = useMemo(() => {
    const rawColor = space.colors?.trim().toLowerCase();
    
    // Check known palette presets
    const paletteMap: Record<string, any> = {
      // New Theme Colors
      '#f29bbb': {
        textColor: '#471b2b',
        subtextColor: 'rgba(71, 27, 43, 0.75)',
        badgeBg: 'rgba(255, 255, 255, 0.45)',
        badgeText: '#471b2b',
        inputBg: 'rgba(255, 255, 255, 0.38)',
        inputPlaceholder: 'rgba(71, 27, 43, 0.58)',
        actionHoverBg: 'rgba(255, 255, 255, 0.4)',
        borderColor: 'rgba(71, 27, 43, 0.12)',
        shelfBg: 'rgba(255, 255, 255, 0.3)',
        isDark: false,
      },
      '#a6729e': {
        textColor: '#ffffff',
        subtextColor: 'rgba(255, 255, 255, 0.85)',
        badgeBg: 'rgba(255, 255, 255, 0.25)',
        badgeText: '#ffffff',
        inputBg: 'rgba(255, 255, 255, 0.2)',
        inputPlaceholder: 'rgba(255, 255, 255, 0.7)',
        actionHoverBg: 'rgba(255, 255, 255, 0.22)',
        borderColor: 'rgba(255, 255, 255, 0.18)',
        shelfBg: 'rgba(255, 255, 255, 0.16)',
        isDark: true,
      },
      '#f25e6c': {
        textColor: '#ffffff',
        subtextColor: 'rgba(255, 255, 255, 0.85)',
        badgeBg: 'rgba(255, 255, 255, 0.25)',
        badgeText: '#ffffff',
        inputBg: 'rgba(255, 255, 255, 0.2)',
        inputPlaceholder: 'rgba(255, 255, 255, 0.7)',
        actionHoverBg: 'rgba(255, 255, 255, 0.22)',
        borderColor: 'rgba(255, 255, 255, 0.18)',
        shelfBg: 'rgba(255, 255, 255, 0.16)',
        isDark: true,
      },
      '#ff8657': {
        textColor: '#42160d',
        subtextColor: 'rgba(66, 22, 13, 0.75)',
        badgeBg: 'rgba(255, 255, 255, 0.42)',
        badgeText: '#42160d',
        inputBg: 'rgba(255, 255, 255, 0.35)',
        inputPlaceholder: 'rgba(66, 22, 13, 0.58)',
        actionHoverBg: 'rgba(255, 255, 255, 0.35)',
        borderColor: 'rgba(66, 22, 13, 0.12)',
        shelfBg: 'rgba(255, 255, 255, 0.28)',
        isDark: false,
      },
      '#f8d558': {
        textColor: '#38310c',
        subtextColor: 'rgba(56, 49, 12, 0.75)',
        badgeBg: 'rgba(255, 255, 255, 0.45)',
        badgeText: '#38310c',
        inputBg: 'rgba(255, 255, 255, 0.38)',
        inputPlaceholder: 'rgba(56, 49, 12, 0.58)',
        actionHoverBg: 'rgba(255, 255, 255, 0.4)',
        borderColor: 'rgba(56, 49, 12, 0.12)',
        shelfBg: 'rgba(255, 255, 255, 0.3)',
        isDark: false,
      },
      '#33e895': {
        textColor: '#0c3e2c',
        subtextColor: 'rgba(12, 62, 44, 0.75)',
        badgeBg: 'rgba(255, 255, 255, 0.45)',
        badgeText: '#0c3e2c',
        inputBg: 'rgba(255, 255, 255, 0.38)',
        inputPlaceholder: 'rgba(12, 62, 44, 0.58)',
        actionHoverBg: 'rgba(255, 255, 255, 0.4)',
        borderColor: 'rgba(12, 62, 44, 0.12)',
        shelfBg: 'rgba(255, 255, 255, 0.3)',
        isDark: false,
      },
      '#6dbad9': {
        textColor: '#103444',
        subtextColor: 'rgba(16, 52, 68, 0.75)',
        badgeBg: 'rgba(255, 255, 255, 0.45)',
        badgeText: '#103444',
        inputBg: 'rgba(255, 255, 255, 0.38)',
        inputPlaceholder: 'rgba(16, 52, 68, 0.58)',
        actionHoverBg: 'rgba(255, 255, 255, 0.4)',
        borderColor: 'rgba(16, 52, 68, 0.12)',
        shelfBg: 'rgba(255, 255, 255, 0.3)',
        isDark: false,
      },
      '#666789': {
        textColor: '#ffffff',
        subtextColor: 'rgba(255, 255, 255, 0.85)',
        badgeBg: 'rgba(255, 255, 255, 0.25)',
        badgeText: '#ffffff',
        inputBg: 'rgba(255, 255, 255, 0.2)',
        inputPlaceholder: 'rgba(255, 255, 255, 0.7)',
        actionHoverBg: 'rgba(255, 255, 255, 0.22)',
        borderColor: 'rgba(255, 255, 255, 0.18)',
        shelfBg: 'rgba(255, 255, 255, 0.16)',
        isDark: true,
      },
      // Backward compatibility presets
      '#f4efdf': {
        textColor: '#2c2923',
        subtextColor: 'rgba(44, 41, 35, 0.72)',
        badgeBg: 'rgba(0, 0, 0, 0.06)',
        badgeText: '#2c2923',
        inputBg: 'rgba(0, 0, 0, 0.04)',
        inputPlaceholder: 'rgba(44, 41, 35, 0.55)',
        actionHoverBg: 'rgba(0, 0, 0, 0.07)',
        borderColor: 'rgba(44, 41, 35, 0.1)',
        shelfBg: 'rgba(0, 0, 0, 0.04)',
        isDark: false,
      },
      '#f0b8cd': {
        textColor: '#471b2b',
        subtextColor: 'rgba(71, 27, 43, 0.72)',
        badgeBg: 'rgba(255, 255, 255, 0.45)',
        badgeText: '#471b2b',
        inputBg: 'rgba(255, 255, 255, 0.38)',
        inputPlaceholder: 'rgba(71, 27, 43, 0.58)',
        actionHoverBg: 'rgba(255, 255, 255, 0.4)',
        borderColor: 'rgba(71, 27, 43, 0.12)',
        shelfBg: 'rgba(255, 255, 255, 0.3)',
        isDark: false,
      },
      '#e9c3e3': {
        textColor: '#3f1e3c',
        subtextColor: 'rgba(63, 30, 60, 0.72)',
        badgeBg: 'rgba(255, 255, 255, 0.45)',
        badgeText: '#3f1e3c',
        inputBg: 'rgba(255, 255, 255, 0.38)',
        inputPlaceholder: 'rgba(63, 30, 60, 0.58)',
        actionHoverBg: 'rgba(255, 255, 255, 0.4)',
        borderColor: 'rgba(63, 30, 60, 0.12)',
        shelfBg: 'rgba(255, 255, 255, 0.3)',
        isDark: false,
      },
      '#da7682': {
        textColor: '#ffffff',
        subtextColor: 'rgba(255, 255, 255, 0.85)',
        badgeBg: 'rgba(255, 255, 255, 0.25)',
        badgeText: '#ffffff',
        inputBg: 'rgba(255, 255, 255, 0.2)',
        inputPlaceholder: 'rgba(255, 255, 255, 0.7)',
        actionHoverBg: 'rgba(255, 255, 255, 0.22)',
        borderColor: 'rgba(255, 255, 255, 0.18)',
        shelfBg: 'rgba(255, 255, 255, 0.16)',
        isDark: true,
      },
      '#eb8570': {
        textColor: '#42160d',
        subtextColor: 'rgba(66, 22, 13, 0.72)',
        badgeBg: 'rgba(255, 255, 255, 0.42)',
        badgeText: '#42160d',
        inputBg: 'rgba(255, 255, 255, 0.35)',
        inputPlaceholder: 'rgba(66, 22, 13, 0.58)',
        actionHoverBg: 'rgba(255, 255, 255, 0.35)',
        borderColor: 'rgba(66, 22, 13, 0.12)',
        shelfBg: 'rgba(255, 255, 255, 0.28)',
        isDark: false,
      },
      '#dcce7f': {
        textColor: '#38310c',
        subtextColor: 'rgba(56, 49, 12, 0.72)',
        badgeBg: 'rgba(255, 255, 255, 0.45)',
        badgeText: '#38310c',
        inputBg: 'rgba(255, 255, 255, 0.38)',
        inputPlaceholder: 'rgba(56, 49, 12, 0.58)',
        actionHoverBg: 'rgba(255, 255, 255, 0.4)',
        borderColor: 'rgba(56, 49, 12, 0.12)',
        shelfBg: 'rgba(255, 255, 255, 0.3)',
        isDark: false,
      },
      '#5becad': {
        textColor: '#0c3e2c',
        subtextColor: 'rgba(12, 62, 44, 0.72)',
        badgeBg: 'rgba(255, 255, 255, 0.45)',
        badgeText: '#0c3e2c',
        inputBg: 'rgba(255, 255, 255, 0.38)',
        inputPlaceholder: 'rgba(12, 62, 44, 0.58)',
        actionHoverBg: 'rgba(255, 255, 255, 0.4)',
        borderColor: 'rgba(12, 62, 44, 0.12)',
        shelfBg: 'rgba(255, 255, 255, 0.3)',
        isDark: false,
      },
      '#919bb5': {
        textColor: '#152033',
        subtextColor: 'rgba(21, 32, 51, 0.72)',
        badgeBg: 'rgba(255, 255, 255, 0.4)',
        badgeText: '#152033',
        inputBg: 'rgba(255, 255, 255, 0.35)',
        inputPlaceholder: 'rgba(21, 32, 51, 0.58)',
        actionHoverBg: 'rgba(255, 255, 255, 0.35)',
        borderColor: 'rgba(21, 32, 51, 0.12)',
        shelfBg: 'rgba(255, 255, 255, 0.28)',
        isDark: false,
      },
    };

    if (rawColor && paletteMap[rawColor]) {
      return {
        containerBg: space.colors,
        ...paletteMap[rawColor],
      };
    }

    if (hasExplicitColor) {
      return {
        containerBg: space.colors,
        isDark,
        textColor: isDark ? '#ffffff' : '#191c1b',
        subtextColor: isDark ? 'rgba(255, 255, 255, 0.75)' : 'rgba(25, 28, 27, 0.75)',
        badgeBg: isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.08)',
        badgeText: isDark ? '#ffffff' : '#191c1b',
        inputBg: isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.05)',
        inputPlaceholder: isDark ? 'rgba(255, 255, 255, 0.65)' : 'rgba(0, 0, 0, 0.55)',
        actionHoverBg: isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.08)',
        borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
        shelfBg: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.04)',
      };
    }

    if (archetype === 'primary') {
      return {
        containerBg: '#33e895',
        isDark: false,
        textColor: '#0c3e2c',
        subtextColor: 'rgba(12, 62, 44, 0.75)',
        badgeBg: 'rgba(255, 255, 255, 0.45)',
        badgeText: '#0c3e2c',
        inputBg: 'rgba(255, 255, 255, 0.38)',
        inputPlaceholder: 'rgba(12, 62, 44, 0.58)',
        actionHoverBg: 'rgba(255, 255, 255, 0.4)',
        borderColor: 'rgba(12, 62, 44, 0.12)',
        shelfBg: 'rgba(255, 255, 255, 0.3)',
      };
    }

    if (archetype === 'secondary') {
      return {
        containerBg: '#ff8657',
        isDark: false,
        textColor: '#42160d',
        subtextColor: 'rgba(66, 22, 13, 0.75)',
        badgeBg: 'rgba(255, 255, 255, 0.42)',
        badgeText: '#42160d',
        inputBg: 'rgba(255, 255, 255, 0.35)',
        inputPlaceholder: 'rgba(66, 22, 13, 0.58)',
        actionHoverBg: 'rgba(255, 255, 255, 0.35)',
        borderColor: 'rgba(66, 22, 13, 0.12)',
        shelfBg: 'rgba(255, 255, 255, 0.28)',
      };
    }

    if (archetype === 'tertiary') {
      return {
        containerBg: '#666789',
        isDark: true,
        textColor: '#ffffff',
        subtextColor: 'rgba(255, 255, 255, 0.85)',
        badgeBg: 'rgba(255, 255, 255, 0.25)',
        badgeText: '#ffffff',
        inputBg: 'rgba(255, 255, 255, 0.2)',
        inputPlaceholder: 'rgba(255, 255, 255, 0.7)',
        actionHoverBg: 'rgba(255, 255, 255, 0.22)',
        borderColor: 'rgba(255, 255, 255, 0.18)',
        shelfBg: 'rgba(255, 255, 255, 0.16)',
      };
    }

    // Default neutral slate surface
    if (isSystemDark) {
      return {
        containerBg: '#151e2e',
        isDark: true,
        textColor: '#f8fafc',
        subtextColor: '#94a3b8',
        badgeBg: 'rgba(255, 255, 255, 0.1)',
        badgeText: '#e2e8f0',
        inputBg: '#0b0f19',
        inputPlaceholder: '#64748b',
        actionHoverBg: 'rgba(255, 255, 255, 0.08)',
        borderColor: '#243247',
        shelfBg: '#0b0f19',
      };
    }

    return {
      containerBg: '#ffffff',
      isDark: false,
      textColor: '#0f172a',
      subtextColor: '#64748b',
      badgeBg: '#f1f5f9',
      badgeText: '#475569',
      inputBg: '#f8fafc',
      inputPlaceholder: '#94a3b8',
      actionHoverBg: '#f1f5f9',
      borderColor: '#e2e8f0',
      shelfBg: '#f8fafc',
    };
  }, [hasExplicitColor, space.colors, isDark, archetype, isSystemDark]);

  // Copy all tab URLs in this space
  const handleCopyAllUrls = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const urls = getAllSpaceTabUrls(space.id, allFolders, allTabs);
    if (urls.length > 0) {
      navigator.clipboard.writeText(urls.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };

  // Open all tabs in browser
  const handleOpenAllTabs = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const urls = getAllSpaceTabUrls(space.id, allFolders, allTabs);
    if (urls.length > 0) {
      if (onOpenTab) {
        urls.forEach((u) => onOpenTab(u));
      } else {
        urls.forEach((u) => window.open(u, '_blank', 'noopener,noreferrer'));
      }
    }
  };

  // Filter items matching active search
  const filteredTabs = useMemo(() => {
    if (!activeSearch) return null;
    return spaceTabs.filter((t) => {
      const matchTitle = t.customTitle && t.customTitle.toLowerCase().includes(activeSearch);
      const matchUrl = t.url && t.url.toLowerCase().includes(activeSearch);
      return matchTitle || matchUrl;
    });
  }, [spaceTabs, activeSearch]);

  const totalTabsCount = spaceTabs.length;

  const spaceMenuItems: ActionDropdownItem[] = useMemo(() => {
    const items: ActionDropdownItem[] = [
      {
        id: 'copy-urls',
        label: copied ? 'Copied all URLs!' : 'Copy all URLs',
        icon: copied ? <CheckIcon size={16} color="#10b981" /> : <CopyIcon size={16} />,
        onClick: handleCopyAllUrls,
      },
      {
        id: 'open-tabs',
        label: 'Open all tabs',
        icon: <ExternalLinkIcon size={16} />,
        onClick: handleOpenAllTabs,
        dividerAfter: Boolean(onAddTab || onAddFolder),
      },
    ];

    if (onAddTab) {
      items.push({
        id: 'add-tab',
        label: 'Add tab',
        icon: <PlusIcon size={16} />,
        onClick: () => onAddTab(),
      });
    }

    if (onAddFolder) {
      items.push({
        id: 'add-folder',
        label: 'Add folder',
        icon: <FolderPlusIcon size={16} />,
        onClick: () => onAddFolder(),
        dividerAfter: Boolean(onConvertSpace || onEditSpace || onDeleteSpace),
      });
    }

    if (onConvertSpace && allSpaces.length > 1) {
      items.push({
        id: 'convert-space',
        label: 'Convert to folder...',
        icon: <FolderInputIcon size={16} />,
        onClick: () => onConvertSpace(space),
      });
    }

    if (onEditSpace) {
      items.push({
        id: 'edit-space',
        label: 'Edit space',
        icon: <EditIcon size={16} />,
        onClick: () => onEditSpace(space),
      });
    }

    if (onDeleteSpace && allSpaces.length > 1) {
      items.push({
        id: 'delete-space',
        label: 'Delete space',
        icon: <TrashIcon size={16} />,
        danger: true,
        onClick: () => {
          if (confirm(`Delete space "${space.name}" and all its folders & tabs?`)) {
            onDeleteSpace(space.id);
          }
        },
      });
    }

    return items;
  }, [
    copied,
    handleCopyAllUrls,
    handleOpenAllTabs,
    onAddTab,
    onAddFolder,
    onConvertSpace,
    allSpaces.length,
    space,
    onEditSpace,
    onDeleteSpace,
  ]);

  return (
    <div
      onMouseEnter={() => setIsCardHovered(true)}
      onMouseLeave={() => setIsCardHovered(false)}
      style={{
        backgroundColor: themeStyles.containerBg,
        color: themeStyles.textColor,
        borderRadius: '24px',
        border: `1px solid ${themeStyles.borderColor}`,
        padding: isCollapsed ? '14px 18px' : '22px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: isCollapsed ? '0' : '16px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04), 0 8px 20px rgba(0, 0, 0, 0.03)',
        transition: 'all 0.2s ease',
        boxSizing: 'border-box',
        width: '100%',
      }}
    >
      {/* Top Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={toggleCollapse}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>

          {/* Emoji / Icon Container */}
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '12px',
              backgroundColor: themeStyles.badgeBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '19px',
              flexShrink: 0,
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}
          >
            {space.emojiIcon || '📁'}
          </div>

          {/* Space Title */}
          <h3
            style={{
              margin: 0,
              fontSize: '16px',
              fontWeight: 700,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              letterSpacing: '-0.01em',
              color: 'inherit',
              flex: 1,
              minWidth: 0,
            }}
            title={space.name}
          >
            {space.name}
          </h3>
        </div>

        {/* Header Action Dropdown (rendered on hover / alwaysShowActions / mobile) */}
        <ActionDropdown
          items={spaceMenuItems}
          isDarkTheme={themeStyles.isDark}
          visible={isMobile || isCardHovered || alwaysShowActions}
          hoverBg={themeStyles.actionHoverBg}
          buttonTitle="Space options"
          size="md"
        />
      </div>

      {/* Expanded Card Body */}
      {!isCollapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Card Search Bar */}
          {!externalSearch && (
            <div style={{ position: 'relative', width: '100%' }}>
              <div
                style={{
                  position: 'absolute',
                  left: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  display: 'flex',
                  alignItems: 'center',
                  pointerEvents: 'none',
                  opacity: 0.65,
                  color: 'inherit',
                }}
              >
                <SearchIcon size={16} />
              </div>
              <input
                type="text"
                placeholder={`Search tabs in ${space.name}...`}
                value={internalSearch}
                onChange={(e) => setInternalSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 34px 9px 38px',
                  borderRadius: '14px',
                  border: 'none',
                  backgroundColor: themeStyles.inputBg,
                  color: themeStyles.textColor,
                  fontSize: '13.5px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'background-color 0.15s ease',
                }}
              />
              {internalSearch && (
                <button
                  type="button"
                  onClick={() => setInternalSearch('')}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    border: 'none',
                    background: 'transparent',
                    color: 'inherit',
                    opacity: 0.65,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '2px',
                  }}
                >
                  <CloseIcon size={14} />
                </button>
              )}
            </div>
          )}

          {/* Search Results Filter Mode */}
          {filteredTabs !== null ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, opacity: 0.8 }}>
                Found {filteredTabs.length} matching tab(s):
              </div>
              {filteredTabs.length === 0 ? (
                <div style={{ padding: '18px', textAlign: 'center', fontSize: '13px', opacity: 0.65 }}>
                  No tabs match &ldquo;{activeSearch}&rdquo;
                </div>
              ) : (
                filteredTabs.map((t) => (
                  <TabRow
                    key={t.id}
                    tab={t}
                    isDarkTheme={themeStyles.isDark}
                    compact={isSingleColumn}
                    alwaysShowActions={alwaysShowActions}
                    isAssociated={Boolean(tabAssociations && tabAssociations[t.id])}
                    isDiverted={Boolean(tabAssociations && tabAssociations[t.id]?.isDiverted)}
                    isHighlighted={highlightedTabId === t.id}
                    onOpen={onOpenTab}
                    onCloseAssociatedTab={() => onCloseAssociatedTab?.(t.id)}
                    onResetDivertedUrl={() => onResetDivertedUrl?.(t.id)}
                    onEdit={onEditTab || (() => {})}
                    onDelete={onDeleteTab || (() => {})}
                    onTogglePin={onTogglePinTab}
                    onToggleFavourite={onToggleFavouriteTab}
                  />
                ))
              )}
            </div>
          ) : (
            <>
              {/* Folders & Tabs Hierarchy (Interleaved Siblings) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {rootSiblings.map((item, index) => {
                  const hasPrev = index > 0;
                  const hasNext = index < rootSiblings.length - 1;

                  if (item.type === 'folder') {
                    return (
                      <FolderItem
                        key={item.id}
                        folder={item.data}
                        allFolders={allFolders}
                        allTabs={allTabs}
                        isDarkTheme={themeStyles.isDark}
                        compact={isSingleColumn}
                        alwaysShowActions={alwaysShowActions}
                        tabAssociations={tabAssociations}
                        highlightedTabId={highlightedTabId}
                        onToggleExpand={onToggleFolderExpand || (() => {})}
                        onEditFolder={onEditFolder || (() => {})}
                        onDeleteFolder={onDeleteFolder || (() => {})}
                        onAddSubFolder={onAddFolder || (() => {})}
                        onAddTabInFolder={(pId) => onAddTab?.(pId, false)}
                        onOpenTab={onOpenTab}
                        onCloseAssociatedTab={onCloseAssociatedTab}
                        onResetDivertedUrl={onResetDivertedUrl}
                        onEditTab={onEditTab || (() => {})}
                        onDeleteTab={onDeleteTab || (() => {})}
                        onTogglePinTab={onTogglePinTab || (() => {})}
                        onToggleFavouriteTab={onToggleFavouriteTab}
                        onMoveUp={
                          hasPrev && onMoveSiblingItem
                            ? () => onMoveSiblingItem(item.id, 'folder', 'up')
                            : undefined
                        }
                        onMoveDown={
                          hasNext && onMoveSiblingItem
                            ? () => onMoveSiblingItem(item.id, 'folder', 'down')
                            : undefined
                        }
                        onMoveSiblingItem={onMoveSiblingItem}
                        onReorderSiblingItem={onReorderSiblingItem}
                      />
                    );
                  }

                  return (
                    <TabRow
                      key={item.id}
                      tab={item.data}
                      isDarkTheme={themeStyles.isDark}
                      compact={isSingleColumn}
                      alwaysShowActions={alwaysShowActions}
                      isAssociated={Boolean(tabAssociations && tabAssociations[item.id])}
                      isDiverted={Boolean(tabAssociations && tabAssociations[item.id]?.isDiverted)}
                      isHighlighted={highlightedTabId === item.id}
                      onOpen={onOpenTab}
                      onCloseAssociatedTab={() => onCloseAssociatedTab?.(item.id)}
                      onResetDivertedUrl={() => onResetDivertedUrl?.(item.id)}
                      onEdit={onEditTab || (() => {})}
                      onDelete={onDeleteTab || (() => {})}
                      onTogglePin={onTogglePinTab}
                      onToggleFavourite={onToggleFavouriteTab}
                      onMoveUp={
                        hasPrev && onMoveSiblingItem
                          ? () => onMoveSiblingItem(item.id, 'tab', 'up')
                          : undefined
                      }
                      onMoveDown={
                        hasNext && onMoveSiblingItem
                          ? () => onMoveSiblingItem(item.id, 'tab', 'down')
                          : undefined
                      }
                      onDropItem={(e, targetTab) => {
                        try {
                          const raw = e.dataTransfer.getData('application/json');
                          if (!raw) return;
                          const parsed = JSON.parse(raw) as { id: string; type: 'folder' | 'tab' };
                          if (!parsed || !parsed.id || parsed.id === targetTab.id) return;
                          const rect = e.currentTarget.getBoundingClientRect();
                          const midY = rect.top + rect.height / 2;
                          const pos = e.clientY < midY ? 'before' : 'after';

                          onReorderSiblingItem?.({
                            sourceId: parsed.id,
                            sourceType: parsed.type,
                            targetId: targetTab.id,
                            targetType: 'tab',
                            position: pos,
                          });
                        } catch {}
                      }}
                    />
                  );
                })}

                {/* Empty State */}
                {rootSiblings.length === 0 && (

                  <div
                    style={{
                      textAlign: 'center',
                      padding: '28px 16px',
                      color: themeStyles.subtextColor,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '10px',
                    }}
                  >
                    <div
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '14px',
                        backgroundColor: themeStyles.badgeBg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '20px',
                      }}
                    >
                      📁
                    </div>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'inherit' }}>
                      Space is empty
                    </span>
                    <span style={{ fontSize: '12px', opacity: 0.8 }}>
                      Add tabs or folders to organize your browsing.
                    </span>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                      {onAddTab && (
                        <button
                          onClick={() => onAddTab()}
                          style={{
                            border: 'none',
                            backgroundColor: themeStyles.badgeBg,
                            color: themeStyles.textColor,
                            fontSize: '13px',
                            fontWeight: 600,
                            padding: '6px 14px',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          + Tab
                        </button>
                      )}
                      {onAddFolder && (
                        <button
                          onClick={() => onAddFolder()}
                          style={{
                            border: 'none',
                            backgroundColor: themeStyles.badgeBg,
                            color: themeStyles.textColor,
                            fontSize: '13px',
                            fontWeight: 600,
                            padding: '6px 14px',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          + Folder
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
