import type { ArcableWorkspaceData, Tab } from '../types/workspace';
import type { WorkspaceOperation } from '../types/sync';
import { generateId } from './format';
import { createWorkspaceOperation } from './syncEngine';
import { ARCABLE_VARIANT_DELIMITER, numericRaindropId } from './raindropSync';

/** Replace a favourite group with its members, preserving the visible shelf order. */
export function ungroupFavourite(
  data: ArcableWorkspaceData,
  group: Tab,
  saveOperation: (operation: WorkspaceOperation) => void
): ArcableWorkspaceData {
  const variants = group.urlVariants || [];
  const children = (data.widgets || []).filter((widget) => widget.parentGroupId === group.id);
  const now = Date.now();
  const unpackedTabs: Tab[] = variants.map((variant, index) => ({
    ...(index === 0 ? group : {}),
    id: index === 0 ? group.id : generateId('tab'),
    url: variant.url,
    customTitle: (variant.name || variant.url).split(ARCABLE_VARIANT_DELIMITER).pop()?.trim() || variant.url,
    favIconUrl: variant.favIconUrl ||
      data.tabs.find((tab) => tab.url === variant.url && tab.favIconUrl)?.favIconUrl ||
      data.tmpTabs?.find((tab) => tab.url === variant.url && tab.favIconUrl)?.favIconUrl,
    customEmojiIcon: variant.customEmojiIcon,
    favourite: true,
    pinned: false,
    parentSpaceId: undefined,
    parentFolderId: undefined,
    isGroup: false,
    urlVariants: undefined,
    defaultVariantId: undefined,
    groupItemOrder: undefined,
    createdAt: index === 0 ? group.createdAt : now + index,
    updatedAt: now,
  }));

  type Item = { id: string; type: 'tab' | 'widget'; order?: number; createdAt?: number };
  const members: Item[] = [
    ...variants.map((variant, index) => ({ id: variant.id, type: 'tab' as const, targetId: unpackedTabs[index].id })),
    ...children.map((widget) => ({ id: widget.id, type: 'widget' as const, targetId: widget.id })),
  ].sort((a, b) => {
    const rank = (item: Item) => {
      const index = group.groupItemOrder?.findIndex((entry) => entry.type === item.type && entry.id === item.id) ?? -1;
      return index === -1 ? (group.groupItemOrder?.length || 0) : index;
    };
    return rank(a) - rank(b);
  }).map((item) => ({ id: item.targetId, type: item.type }));

  const shelf: Item[] = [
    ...data.tabs.filter((tab) => tab.favourite).map((tab) => ({ ...tab, type: 'tab' as const })),
    ...(data.widgets || []).filter((widget) => !widget.parentGroupId).map((widget) => ({ ...widget, type: 'widget' as const })),
  ].sort((a, b) => {
    if (a.order !== undefined && b.order !== undefined && a.order !== b.order) return a.order - b.order;
    if (a.order !== undefined && b.order === undefined) return -1;
    if (a.order === undefined && b.order !== undefined) return 1;
    return (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id);
  });
  shelf.splice(shelf.findIndex((item) => item.type === 'tab' && item.id === group.id), 1, ...members);
  const orders = new Map(shelf.map((item, index) => [item.id, (index + 1) * 1000]));
  const tabs = data.tabs.flatMap((tab) => tab.id === group.id ? unpackedTabs : [tab]).map((tab) => {
    const order = orders.get(tab.id);
    return order === undefined ? tab : { ...tab, order };
  });
  const widgets = (data.widgets || []).map((widget) => {
    const order = orders.get(widget.id);
    if (widget.parentGroupId === group.id) {
      return { ...widget, parentGroupId: undefined, order, updatedAt: now };
    }
    return order === undefined ? widget : { ...widget, order };
  });

  const remoteId = group.raindropId || numericRaindropId(group.id);
  if (unpackedTabs.length === 0) {
    saveOperation(createWorkspaceOperation('TAB_DELETE', group.id, {
      raindropId: remoteId,
      collectionId: data.raindropRootCollectionId,
    }));
  }
  for (const tab of tabs) {
    if (tab.id === group.id) {
      saveOperation(createWorkspaceOperation('TAB_UPDATE', tab.id, {
        title: tab.customTitle,
        customTitle: tab.customTitle,
        url: tab.url,
        favIconUrl: tab.favIconUrl,
        customEmojiIcon: tab.customEmojiIcon || null,
        isGroup: false,
        urlVariants: null,
        defaultVariantId: null,
        groupItemOrder: null,
        order: tab.order,
        // The group's remote identity can differ from the first member after reordering.
        deletedVariantIds: variants.map((variant) => numericRaindropId(variant.id))
          .filter((id) => id && id !== remoteId),
      }));
    } else if (unpackedTabs.some((member) => member.id === tab.id)) {
      saveOperation(createWorkspaceOperation('TAB_CREATE', tab.id, tab));
    } else if (data.tabs.find((original) => original.id === tab.id)?.order !== tab.order) {
      saveOperation(createWorkspaceOperation('TAB_UPDATE', tab.id, { order: tab.order }));
    }
  }
  for (const widget of widgets) {
    const original = (data.widgets || []).find((candidate) => candidate.id === widget.id);
    if (original?.parentGroupId === group.id) {
      saveOperation(createWorkspaceOperation('WIDGET_UPDATE', widget.id, { parentGroupId: null, order: widget.order }));
    } else if (original?.order !== widget.order) {
      saveOperation(createWorkspaceOperation('WIDGET_UPDATE', widget.id, { order: widget.order }));
    }
  }
  return { ...data, tabs, widgets };
}
