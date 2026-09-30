import browser from 'webextension-polyfill';

export const STORAGE_KEY_AUTO_PIP = 'arcable_auto_pip';

let isAutoPipActive = false;
let isExitingAutomatically = false;
let activePiPVideo: HTMLVideoElement | null = null;

/**
 * Check if the user has enabled Auto Picture-in-Picture in Arcable settings.
 * Defaults to true.
 */
export async function isAutoPipEnabled(): Promise<boolean> {
  try {
    const stored = await browser.storage.local.get(STORAGE_KEY_AUTO_PIP);
    return stored[STORAGE_KEY_AUTO_PIP] !== false;
  } catch {
    return true;
  }
}

/**
 * Validates whether a video element is eligible for auto Picture-in-Picture.
 * Rejects paused, ended, tiny decorative, or short background loop videos.
 */
export function isEligibleVideo(video: HTMLVideoElement): boolean {
  if (!video) return false;

  // Must be currently playing
  if (video.paused || video.ended || video.readyState < 2) {
    return false;
  }

  // Check dimensions: ignore tiny tracking or decorative video badges
  const rect = video.getBoundingClientRect();
  const width = rect.width || video.videoWidth || video.clientWidth || 0;
  const height = rect.height || video.videoHeight || video.clientHeight || 0;
  if (width < 100 || height < 100) {
    return false;
  }

  // Check duration: content videos should be longer than 5 seconds or live stream (Infinity/NaN)
  const duration = video.duration;
  if (Number.isFinite(duration) && duration > 0 && duration <= 5) {
    return false;
  }

  // If muted, avoid short loop animations
  if (video.muted && Number.isFinite(duration) && duration <= 10) {
    return false;
  }

  return true;
}

/**
 * Locates the primary actively playing video element on the current page.
 */
export function findActivePlayingVideo(): HTMLVideoElement | null {
  if (document.pictureInPictureElement instanceof HTMLVideoElement) {
    return document.pictureInPictureElement;
  }

  const videos = Array.from(document.querySelectorAll<HTMLVideoElement>('video'));
  const eligible = videos.filter(isEligibleVideo);
  if (eligible.length === 0) {
    return null;
  }

  // Sort by largest rendered screen area to prioritize the main video player
  eligible.sort((a, b) => {
    const areaA = (a.clientWidth || a.videoWidth || 0) * (a.clientHeight || a.videoHeight || 0);
    const areaB = (b.clientWidth || b.videoWidth || 0) * (b.clientHeight || b.videoHeight || 0);
    return areaB - areaA;
  });

  return eligible[0];
}

/**
 * Listener for when a video leaves Picture-in-Picture mode.
 */
function handleVideoLeavePiP(e: Event): void {
  const video = (e.target as HTMLVideoElement) || activePiPVideo;

  // If we are exiting automatically because the user switched back to this tab,
  // do not pause playback.
  if (isExitingAutomatically) {
    isExitingAutomatically = false;
    isAutoPipActive = false;
    activePiPVideo = null;
    return;
  }

  // If the user manually closed the PiP window while viewing another tab (tab is hidden),
  // pause playback per user requirements.
  if (document.hidden && video) {
    try {
      video.pause();
    } catch (err) {
      console.warn('[Arcable AutoPiP] Failed to pause video on manual PiP close:', err);
    }
  }

  isAutoPipActive = false;
  activePiPVideo = null;
}

function bindPiPListeners(video: HTMLVideoElement): void {
  activePiPVideo = video;
  video.removeEventListener('leavepictureinpicture', handleVideoLeavePiP);
  video.addEventListener('leavepictureinpicture', handleVideoLeavePiP, { once: true });
}

/**
 * Requests Picture-in-Picture for the active video when switching away from this tab.
 */
export async function requestAutoPiP(): Promise<boolean> {
  if (!document.pictureInPictureEnabled) {
    return false;
  }

  const enabled = await isAutoPipEnabled();
  if (!enabled) {
    return false;
  }

  const video = findActivePlayingVideo();
  if (!video) {
    return false;
  }

  if (document.pictureInPictureElement === video) {
    isAutoPipActive = true;
    bindPiPListeners(video);
    return true;
  }

  try {
    bindPiPListeners(video);
    await video.requestPictureInPicture();
    isAutoPipActive = true;
    return true;
  } catch (err) {
    // If browser security blocks requestPictureInPicture without direct gesture,
    // catch cleanly without breaking
    if (activePiPVideo === video) {
      activePiPVideo = null;
    }
    return false;
  }
}

/**
 * Exits Picture-in-Picture mode and restores video inline when user returns to this tab.
 */
export async function exitAutoPiP(): Promise<boolean> {
  if (document.pictureInPictureElement) {
    // Only exit if PiP was triggered automatically by Arcable
    if (!isAutoPipActive) {
      return false;
    }

    try {
      isExitingAutomatically = true;
      await document.exitPictureInPicture();
      isAutoPipActive = false;
      activePiPVideo = null;
      return true;
    } catch (err) {
      console.warn('[Arcable AutoPiP] Error exiting Picture-in-Picture:', err);
      return false;
    } finally {
      // Safety reset: ensure flag is cleared after exit completes
      setTimeout(() => {
        isExitingAutomatically = false;
      }, 50);
    }
  }
  return false;
}

/**
 * Initializes listeners for native Chromium auto-PiP mediaSession integration
 * and global enterpictureinpicture tracking.
 */
export function initAutoPip(): void {
  // Listen for any video entering PiP on the page (native or extension triggered)
  document.addEventListener(
    'enterpictureinpicture',
    (e) => {
      const video = e.target as HTMLVideoElement;
      if (video instanceof HTMLVideoElement) {
        bindPiPListeners(video);
      }
    },
    true
  );

  // Register modern MediaSession enterpictureinpicture action handler
  // Allows Chromium's native auto-PiP engine to trigger on eligible video playback
  try {
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator && typeof navigator.mediaSession.setActionHandler === 'function') {
      navigator.mediaSession.setActionHandler('enterpictureinpicture' as any, async () => {
        const enabled = await isAutoPipEnabled();
        if (!enabled) return;

        const video = findActivePlayingVideo();
        if (video && document.pictureInPictureElement !== video) {
          try {
            bindPiPListeners(video);
            await video.requestPictureInPicture();
            isAutoPipActive = true;
          } catch (err) {
            console.warn('[Arcable AutoPiP] Native mediaSession enterpictureinpicture failed:', err);
          }
        }
      });
    }
  } catch (err) {
    // Media session action may not be supported in some browser engines
  }
}
