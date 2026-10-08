import { setRaindropTokenResolver, RaindropReauthenticationError } from '@arcable/shared/utils';
import browser from 'webextension-polyfill';

// Direct API calls in UI surfaces renew through the worker, which owns the
// session and coalesces requests from all extension pages.
setRaindropTokenResolver(async (token, forceRefresh) => {
  const result = await browser.runtime.sendMessage({ type: 'RAINDROP_RESOLVE_TOKEN', payload: { token, forceRefresh } }) as { success?: boolean; data?: string; error?: string; reauthenticationRequired?: boolean };
  if (result?.reauthenticationRequired) throw new RaindropReauthenticationError();
  if (!result?.success || !result?.data) throw new Error(result?.error || 'Could not renew Raindrop session.');
  return result.data;
});
