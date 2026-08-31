import {
  fetchRaindropUser,
  fetchRaindropCollections,
  createRaindropCollection,
  createRaindropBookmark,
  deleteRaindropBookmark,
  uploadRaindropFile,
  fetchRaindropFileContent,
  fetchRaindropItems,
  fetchRaindropItem,
  getRaindropOAuthUrl,
  exchangeRaindropOAuthCode,
  syncWorkspaceWithRaindrop,
  fetchRaindropDevices,
  renameRaindropDevice,
  deleteRaindropDevice,
  deleteAllOtherRaindropDevices,
  getDefaultDeviceName,
} from '@arcable/shared/utils';

import type {
  RaindropUserProfile,
  RaindropTokenResponse,
  RaindropCollectionItem,
  RaindropBookmarkItem,
  RaindropFileItem,
  RaindropCreateItemInput,
} from '@arcable/shared/types';

export const ACCESS_TOKEN_COOKIE = 'raindrop_access_token';
export const REFRESH_TOKEN_COOKIE = 'raindrop_refresh_token';
export const STATE_COOKIE = 'raindrop_oauth_state';

export function getAuthCookieOptions(maxAge: number = 60 * 60 * 24 * 30) {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
    path: '/',
    maxAge,
  };
}

export function getRaindropTokenFromEnv(): string {
  return (
    process.env.RAINDROP_TOKEN?.trim() ||
    process.env.NEXT_PUBLIC_RAINDROP_TOKEN?.trim() ||
    ''
  );
}

export function getRaindropConfig() {
  const clientId =
    process.env.RAINDROP_CLIENT_ID ||
    process.env.NEXT_PUBLIC_RAINDROP_CLIENT_ID ||
    '';
  const clientSecret = process.env.RAINDROP_CLIENT_SECRET || '';
  const redirectUri =
    process.env.RAINDROP_REDIRECT_URI ||
    process.env.RAINDROP_CALLBACK_URL ||
    process.env.NEXT_PUBLIC_RAINDROP_CALLBACK_URL ||
    'http://localhost:3000/api/auth/callback/raindrop';
  const token = getRaindropTokenFromEnv();

  return {
    clientId,
    clientSecret,
    redirectUri,
    token,
  };
}

export {
  fetchRaindropUser,
  fetchRaindropCollections,
  createRaindropCollection,
  createRaindropBookmark,
  deleteRaindropBookmark,
  uploadRaindropFile,
  fetchRaindropFileContent,
  fetchRaindropItems,
  fetchRaindropItem,
  getRaindropOAuthUrl,
  exchangeRaindropOAuthCode,
  syncWorkspaceWithRaindrop,
  fetchRaindropDevices,
  renameRaindropDevice,
  deleteRaindropDevice,
  deleteAllOtherRaindropDevices,
  getDefaultDeviceName,
};

export type {
  RaindropUserProfile,
  RaindropTokenResponse,
  RaindropCollectionItem,
  RaindropBookmarkItem,
  RaindropFileItem,
  RaindropCreateItemInput,
};
