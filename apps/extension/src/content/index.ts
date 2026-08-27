import browser from 'webextension-polyfill';

console.log('[Arcable Extension] Content script loaded on:', window.location.href);

// Listen for messages from popup or background
browser.runtime.onMessage.addListener((message: any, _sender: browser.Runtime.MessageSender) => {
  if (message.type === 'GET_PAGE_METADATA') {
    const metaDescription = document.querySelector('meta[name="description"]')?.getAttribute('content');
    return Promise.resolve({
      success: true,
      data: {
        title: document.title,
        url: window.location.href,
        description: metaDescription || '',
      },
    });
  }
  return undefined;
});
