import type { UploadedCover } from '../types/raindrop';
import {
  ARCABLE_COVERS_COLLECTION_NAME, fetchRaindropCollections, fetchAllRaindropItems,
  createRaindropCollection, uploadRaindropFile, dataUrlToBlob,
} from './raindropClient';
import { ARCABLE_COLLECTION_NAME, getOrCreateArcableCollection } from './raindropSync';

export const MAX_COVER_BYTES = 2 * 1024 * 1024;

export function validateCoverImage(image: Blob): void {
  if (!['image/png', 'image/jpeg', 'image/gif'].includes(image.type)) {
    throw new Error('Choose a PNG, JPEG, or GIF image.');
  }
  if (!image.size || image.size > MAX_COVER_BYTES) {
    throw new Error('Choose an image smaller than 2 MB.');
  }
}

export async function listUploadedCovers(token: string): Promise<UploadedCover[]> {
  const collections = await fetchRaindropCollections(token, { cacheBust: String(Date.now()) });
  const root = collections.filter((c) => !c.parent?.$id && c.title.trim().toLowerCase() === ARCABLE_COLLECTION_NAME.toLowerCase())
    .sort((a, b) => (b.count || 0) - (a.count || 0) || a._id - b._id)[0];
  if (!root) return [];
  const libraries = collections.filter((c) => c.parent?.$id === root._id && c.title.trim().toLowerCase() === ARCABLE_COVERS_COLLECTION_NAME);
  const items = [];
  for (const library of libraries) {
    items.push(...await fetchAllRaindropItems(token, library._id, { cacheBust: String(Date.now()) }));
  }
  return items.filter((item) => item.link?.startsWith('https://') && item.file && (item.type === 'image' || /^image\/(png|jpeg|gif)$/.test(item.file.type || '')))
    .map((item) => ({ id: item._id, url: item.link, name: item.file?.name || item.title, createdAt: item.created || '' }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
}

export async function uploadCoverToLibrary(token: string, name: string, dataUrl: string): Promise<UploadedCover> {
  if (!/^data:image\/(png|jpeg|gif);base64,/.test(dataUrl) || dataUrl.length > MAX_COVER_BYTES * 1.4 + 100) {
    throw new Error('Choose a PNG, JPEG, or GIF image smaller than 2 MB.');
  }
  const image = dataUrlToBlob(dataUrl);
  validateCoverImage(image);
  const root = await getOrCreateArcableCollection(token);
  const collections = await fetchRaindropCollections(token);
  const library = collections.filter((c) => c.parent?.$id === root._id && c.title.trim().toLowerCase() === ARCABLE_COVERS_COLLECTION_NAME)
    .sort((a, b) => a._id - b._id)[0] || await createRaindropCollection(token, ARCABLE_COVERS_COLLECTION_NAME, root._id);
  const extension = image.type === 'image/png' ? 'png' : image.type === 'image/gif' ? 'gif' : 'jpg';
  const fileName = `${(name || 'cover').replace(/\.[^.]*$/, '').replace(/[\/\\]/g, '_')}.${extension}`;
  const result = await uploadRaindropFile(token, library._id, fileName, image);
  if (result.result !== true || !result.item?.link?.startsWith('https://')) {
    throw new Error('Raindrop did not return an uploaded image. Please retry.');
  }
  return { id: result.item._id, url: result.item.link, name: fileName, createdAt: result.item.created || new Date().toISOString() };
}
