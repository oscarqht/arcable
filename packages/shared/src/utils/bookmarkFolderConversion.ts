import type { ArcableWorkspaceData, Folder, Tab, TabUrlVariant } from '../types/workspace';
import type { OperationType } from '../types/sync';
import { generateId } from './format';
import { numericRaindropId } from './raindropSync';
import { getTabEffectiveTitle } from './treeUtils';

interface Conversion {
  data: ArcableWorkspaceData;
  operations: Array<{ type: OperationType; entityId: string; payload: Record<string, unknown> }>;
}

function variantsOf(tab: Tab): TabUrlVariant[] {
  if (tab.urlVariants?.length) return tab.urlVariants;
  if (tab.isGroup) return [];
  return [{ id: tab.id, name: getTabEffectiveTitle(tab), url: tab.url, favIconUrl: tab.favIconUrl, customEmojiIcon: tab.customEmojiIcon }];
}

export function canConvertBookmarkToFolder(data: ArcableWorkspaceData, tab: Tab): boolean {
  return Boolean(tab.urlVariants?.length) &&
    !data.widgets?.some((widget) => widget.parentGroupId === tab.id) &&
    variantsOf(tab).every((variant) => Boolean(variant.url));
}

export function canConvertFolderToBookmark(data: Pick<ArcableWorkspaceData, 'tabs' | 'folders' | 'widgets'>, folderId: string): boolean {
  const tabs = data.tabs.filter((tab) => tab.parentFolderId === folderId);
  return tabs.length > 0 && !data.folders.some((folder) => folder.parentFolderId === folderId) &&
    tabs.every((tab) => variantsOf(tab).length > 0 && variantsOf(tab).every((variant) => Boolean(variant.url)) &&
      !data.widgets?.some((widget) => widget.parentGroupId === tab.id));
}

export function convertBookmarkToFolder(data: ArcableWorkspaceData, tabId: string): Conversion | undefined {
  const tab = data.tabs.find((item) => item.id === tabId);
  if (!tab || !canConvertBookmarkToFolder(data, tab)) return;
  const parentSpaceId = tab.favourite ? data.activeSpaceId : tab.parentSpaceId;
  if (!data.spaces.some((space) => space.id === parentSpaceId)) return;
  const now = Date.now();
  const rootSiblings = [
    ...data.folders.filter((folder) => folder.parentSpaceId === parentSpaceId && !folder.parentFolderId),
    ...data.tabs.filter((item) => !item.favourite && !item.pinned && item.parentSpaceId === parentSpaceId && !item.parentFolderId),
  ];
  const defaultVariant = tab.urlVariants?.find((variant) => variant.id === tab.defaultVariantId) || tab.urlVariants?.[0];
  const folder: Folder = {
    id: generateId('folder'), name: getTabEffectiveTitle(tab),
    parentSpaceId: parentSpaceId!, parentFolderId: tab.favourite ? undefined : tab.parentFolderId,
    order: tab.favourite
      ? rootSiblings.reduce((max, item) => Math.max(max, item.order ?? item.createdAt ?? 0), 0) + 1000
      : tab.order ?? tab.createdAt,
    coverUrl: tab.favIconUrl || defaultVariant?.favIconUrl,
    customEmojiIcon: tab.customEmojiIcon, isExpanded: true, createdAt: now, updatedAt: now,
  };
  const tabs: Tab[] = variantsOf(tab).map((variant, index) => ({
    id: generateId('tab'), url: variant.url, customTitle: variant.name || getTabEffectiveTitle(tab),
    favIconUrl: variant.favIconUrl, customEmojiIcon: variant.customEmojiIcon,
    note: index === 0 ? tab.note : undefined, pinned: false,
    parentSpaceId, parentFolderId: folder.id, order: (index + 1) * 1000,
    createdAt: now, updatedAt: now,
  }));
  const parent = tab.parentFolderId ? data.folders.find((f) => f.id === tab.parentFolderId) : data.spaces.find((s) => s.id === tab.parentSpaceId);
  return {
    data: { ...data, folders: [...data.folders, folder], tabs: [...data.tabs.filter((t) => t.id !== tabId), ...tabs] },
    operations: [
      { type: 'FOLDER_CREATE', entityId: folder.id, payload: { ...folder } },
      ...tabs.map((item) => ({ type: 'TAB_CREATE' as const, entityId: item.id, payload: { ...item } })),
      { type: 'TAB_DELETE', entityId: tab.id, payload: {
        raindropId: tab.raindropId || numericRaindropId(tab.id),
        variantRaindropIds: variantsOf(tab).map((v) => numericRaindropId(v.id)).filter(Boolean),
        collectionId: tab.favourite ? data.raindropRootCollectionId : parent?.raindropId || numericRaindropId(parent?.id),
      } },
    ],
  };
}

export function convertFolderToBookmark(data: ArcableWorkspaceData, folderId: string): Conversion | undefined {
  const folder = data.folders.find((item) => item.id === folderId);
  if (!folder || !canConvertFolderToBookmark(data, folderId)) return;
  const children = data.tabs.filter((tab) => tab.parentFolderId === folderId).sort((a, b) =>
    (a.order ?? a.createdAt ?? 0) - (b.order ?? b.createdAt ?? 0) || a.id.localeCompare(b.id));
  const first = children[0];
  const variants = children.flatMap((child) => variantsOf(child).map((variant) => ({ ...variant, id: generateId('var') })));
  const defaultIndex = first.urlVariants?.findIndex((variant) => variant.id === first.defaultVariantId) ?? -1;
  const defaultVariant = variants[defaultIndex >= 0 ? defaultIndex : 0];
  const now = Date.now();
  const tab: Tab = {
    id: generateId('tab'), customTitle: getTabEffectiveTitle(first), url: defaultVariant.url,
    urlVariants: variants, defaultVariantId: defaultVariant.id,
    favIconUrl: first.favIconUrl, customEmojiIcon: first.customEmojiIcon, note: first.note,
    parentFolderId: folder.parentFolderId, parentSpaceId: folder.parentSpaceId,
    pinned: false, order: folder.order ?? folder.createdAt, createdAt: now, updatedAt: now,
  };
  return {
    data: { ...data, folders: data.folders.filter((f) => f.id !== folderId), tabs: [...data.tabs.filter((t) => t.parentFolderId !== folderId), tab] },
    operations: [
      { type: 'TAB_CREATE', entityId: tab.id, payload: { ...tab } },
      ...children.map((child) => ({ type: 'TAB_DELETE' as const, entityId: child.id, payload: {
        raindropId: child.raindropId || numericRaindropId(child.id),
        variantRaindropIds: variantsOf(child).map((variant) => numericRaindropId(variant.id)).filter(Boolean),
        collectionId: folder.raindropId || numericRaindropId(folder.id),
      } })),
      { type: 'FOLDER_DELETE', entityId: folderId, payload: { raindropId: folder.raindropId || numericRaindropId(folderId), recursive: true } },
    ],
  };
}
