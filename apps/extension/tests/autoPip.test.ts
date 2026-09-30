import assert from 'node:assert';

// Mock DOM environment
class MockVideoElement {
  public paused = false;
  public ended = false;
  public readyState = 4;
  public duration = 120;
  public muted = false;
  public clientWidth = 640;
  public clientHeight = 360;
  public videoWidth = 640;
  public videoHeight = 360;
  private listeners: Record<string, ((e: any) => void)[]> = {};

  public getBoundingClientRect() {
    return {
      width: this.clientWidth,
      height: this.clientHeight,
      top: 0,
      left: 0,
      right: this.clientWidth,
      bottom: this.clientHeight,
    };
  }

  public addEventListener(type: string, listener: (e: any) => void, _options?: any) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }

  public removeEventListener(type: string, listener: (e: any) => void) {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter((l) => l !== listener);
  }

  public dispatchEvent(event: { type: string }) {
    const list = this.listeners[event.type] || [];
    for (const l of list) {
      l(event);
    }
  }

  public pauseCallCount = 0;
  public pause() {
    this.paused = true;
    this.pauseCallCount++;
  }

  public requestPipCallCount = 0;
  public requestPictureInPicture() {
    this.requestPipCallCount++;
    (globalThis as any).document.pictureInPictureElement = this;
    return Promise.resolve(this);
  }
}

// Setup global mock document & window
const mockDocument: any = {
  pictureInPictureEnabled: true,
  pictureInPictureElement: null,
  hidden: false,
  querySelectorAll: () => [],
  addEventListener: () => {},
  removeEventListener: () => {},
  exitPictureInPicture: async () => {
    const el = mockDocument.pictureInPictureElement;
    mockDocument.pictureInPictureElement = null;
    if (el && typeof el.dispatchEvent === 'function') {
      el.dispatchEvent({ type: 'leavepictureinpicture', target: el });
    }
  },
};

(globalThis as any).HTMLVideoElement = MockVideoElement;
(globalThis as any).document = mockDocument;
(globalThis as any).window = { location: { href: 'https://example.com' } };

// Mock webextension-polyfill / chrome
const mockStorage: Record<string, any> = {};
const messageLog: { tabId: number; message: any }[] = [];

(globalThis as any).chrome = {
  runtime: { id: 'test-ext' },
  storage: {
    local: {
      get: (key: string | string[], callback?: (res: any) => void) => {
        let res: Record<string, any> = {};
        if (typeof key === 'string') {
          res = { [key]: mockStorage[key] };
        } else if (Array.isArray(key)) {
          for (const k of key) {
            res[k] = mockStorage[k];
          }
        } else {
          res = mockStorage;
        }
        if (typeof callback === 'function') callback(res);
        return Promise.resolve(res);
      },
      set: (items: Record<string, any>, callback?: () => void) => {
        Object.assign(mockStorage, items);
        if (typeof callback === 'function') callback();
        return Promise.resolve();
      },
    },
  },
  tabs: {
    query: (_queryInfo: any, callback?: (res: any) => void) => {
      const tabs = [{ id: 1, windowId: 100, active: true }];
      if (typeof callback === 'function') callback(tabs);
      return Promise.resolve(tabs);
    },
    sendMessage: (tabId: number, message: any, callback?: (res: any) => void) => {
      messageLog.push({ tabId, message });
      const res = { success: true };
      if (typeof callback === 'function') callback(res);
      return Promise.resolve(res);
    },
  },
};

const {
  isEligibleVideo,
  findActivePlayingVideo,
  requestAutoPiP,
  exitAutoPiP,
  STORAGE_KEY_AUTO_PIP,
} = await import('../src/content/autoPip');

const { initAutoPipBackground } = await import('../src/background/autoPip');

console.log('Testing Auto Picture-in-Picture logic...');

// 1. Test video eligibility criteria
{
  const validVideo = new MockVideoElement() as any;
  assert.strictEqual(isEligibleVideo(validVideo), true, 'Standard playing 2-minute video should be eligible');

  const pausedVideo = new MockVideoElement() as any;
  pausedVideo.paused = true;
  assert.strictEqual(isEligibleVideo(pausedVideo), false, 'Paused video should not be eligible');

  const endedVideo = new MockVideoElement() as any;
  endedVideo.ended = true;
  assert.strictEqual(isEligibleVideo(endedVideo), false, 'Ended video should not be eligible');

  const loadingVideo = new MockVideoElement() as any;
  loadingVideo.readyState = 1;
  assert.strictEqual(isEligibleVideo(loadingVideo), false, 'Video not ready (readyState < 2) should not be eligible');

  const tinyVideo = new MockVideoElement() as any;
  tinyVideo.clientWidth = 50;
  tinyVideo.clientHeight = 50;
  tinyVideo.videoWidth = 50;
  tinyVideo.videoHeight = 50;
  assert.strictEqual(isEligibleVideo(tinyVideo), false, 'Tiny decorative video (<100px) should not be eligible');

  const shortVideo = new MockVideoElement() as any;
  shortVideo.duration = 4;
  assert.strictEqual(isEligibleVideo(shortVideo), false, 'Short clip (<=5s) should not be eligible');

  const mutedLoopVideo = new MockVideoElement() as any;
  mutedLoopVideo.muted = true;
  mutedLoopVideo.duration = 8;
  assert.strictEqual(isEligibleVideo(mutedLoopVideo), false, 'Short muted background loop (<=10s) should not be eligible');

  const liveStreamVideo = new MockVideoElement() as any;
  liveStreamVideo.duration = Infinity;
  assert.strictEqual(isEligibleVideo(liveStreamVideo), true, 'Live stream video (duration=Infinity) should be eligible');
}

// 2. Test finding active playing video prioritizing largest area
{
  const smallVideo = new MockVideoElement() as any;
  smallVideo.clientWidth = 200;
  smallVideo.clientHeight = 150;

  const largeVideo = new MockVideoElement() as any;
  largeVideo.clientWidth = 1280;
  largeVideo.clientHeight = 720;

  mockDocument.querySelectorAll = () => [smallVideo, largeVideo];

  const found = findActivePlayingVideo();
  assert.strictEqual(found, largeVideo, 'Should select the largest video on the page');
}

// 3. Test requestAutoPiP and exitAutoPiP
{
  const player = new MockVideoElement() as any;
  mockDocument.querySelectorAll = () => [player];
  mockDocument.pictureInPictureElement = null;

  const entered = await requestAutoPiP();
  assert.strictEqual(entered, true, 'requestAutoPiP should succeed');
  assert.strictEqual(player.requestPipCallCount, 1, 'Should call requestPictureInPicture on player');
  assert.strictEqual(mockDocument.pictureInPictureElement, player, 'document.pictureInPictureElement should match player');

  // Test automatic exit when returning to tab
  const exited = await exitAutoPiP();
  assert.strictEqual(exited, true, 'exitAutoPiP should succeed');
  assert.strictEqual(mockDocument.pictureInPictureElement, null, 'PiP element should be null after exit');
}

// 4. Test manual PiP close when viewing another tab pauses playback
{
  const player = new MockVideoElement() as any;
  mockDocument.querySelectorAll = () => [player];
  mockDocument.pictureInPictureElement = null;

  await requestAutoPiP();

  // Simulate user switching away (document becomes hidden)
  mockDocument.hidden = true;

  // Simulate user clicking "X" on floating PiP window
  player.dispatchEvent({ type: 'leavepictureinpicture', target: player });

  assert.strictEqual(player.pauseCallCount, 1, 'Video should be paused when PiP closed while tab is hidden');
  assert.strictEqual(player.paused, true, 'Player should be paused');

  mockDocument.hidden = false;
}

// 5. Test background tab coordinator logic
{
  let onActivatedListener: ((activeInfo: any) => Promise<void>) | null = null;
  (globalThis as any).chrome.tabs.onActivated = {
    addListener: (cb: any) => {
      onActivatedListener = cb;
    },
  };
  (globalThis as any).chrome.tabs.onRemoved = { addListener: () => {} };
  (globalThis as any).chrome.windows = { onRemoved: { addListener: () => {} } };

  initAutoPipBackground();

  // Allow initial query to settle
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.notStrictEqual(onActivatedListener, null, 'onActivatedListener must be registered');

  messageLog.length = 0;
  mockStorage[STORAGE_KEY_AUTO_PIP] = true;

  // Switch from tab 1 to tab 2 in window 100
  await onActivatedListener!({ tabId: 2, windowId: 100 });

  assert.strictEqual(messageLog.length, 2, 'Should send two messages on tab activation');
  assert.deepStrictEqual(messageLog[0], { tabId: 1, message: { type: 'AUTO_PIP_ENTER' } });
  assert.deepStrictEqual(messageLog[1], { tabId: 2, message: { type: 'AUTO_PIP_EXIT' } });

  // Test disabling setting in storage
  messageLog.length = 0;
  mockStorage[STORAGE_KEY_AUTO_PIP] = false;

  // Switch from tab 2 to tab 3 in window 100
  await onActivatedListener!({ tabId: 3, windowId: 100 });
  assert.strictEqual(messageLog.length, 0, 'Should not trigger auto-PiP when disabled in settings');
}

console.log('✅ All Auto Picture-in-Picture tests passed successfully!');
