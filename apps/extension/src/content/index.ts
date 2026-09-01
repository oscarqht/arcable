import browser from 'webextension-polyfill';

console.log('[Arcable Extension] Content script loaded on:', window.location.href);

function executeMediaAction(action: 'prev' | 'next' | 'playPause' | 'play' | 'pause'): boolean {
  const host = window.location.hostname.toLowerCase();

  // 1. YouTube & YouTube Music
  if (host.includes('youtube.com')) {
    if (host.includes('music.youtube.com')) {
      const btn = document.querySelector<HTMLElement>('#play-pause-button, .play-pause-button');
      if (action === 'playPause') {
        if (btn) {
          btn.click();
          return true;
        }
      } else if (action === 'play') {
        const isPaused = btn?.getAttribute('aria-label')?.toLowerCase().includes('play') ||
                         btn?.getAttribute('title')?.toLowerCase().includes('play');
        if (isPaused || !document.querySelector('video') || document.querySelector('video')?.paused) {
          btn?.click() || document.querySelector('video')?.play().catch(() => {});
          return true;
        }
      } else if (action === 'pause') {
        const isPlaying = btn?.getAttribute('aria-label')?.toLowerCase().includes('pause') ||
                          btn?.getAttribute('title')?.toLowerCase().includes('pause');
        if (isPlaying || document.querySelector('video')?.paused === false) {
          btn?.click() || document.querySelector('video')?.pause();
          return true;
        }
      } else if (action === 'prev') {
        const prevBtn = document.querySelector<HTMLElement>('#previous-button, .previous-button');
        if (prevBtn) {
          prevBtn.click();
          return true;
        }
      } else if (action === 'next') {
        const nextBtn = document.querySelector<HTMLElement>('#next-button, .next-button');
        if (nextBtn) {
          nextBtn.click();
          return true;
        }
      }
    } else {
      // Standard YouTube
      const video = document.querySelector<HTMLVideoElement>('video');
      const btn = document.querySelector<HTMLElement>('.ytp-play-button');
      if (action === 'playPause') {
        if (btn) {
          btn.click();
          return true;
        } else if (video) {
          if (video.paused) video.play().catch(() => {});
          else video.pause();
          return true;
        }
      } else if (action === 'play') {
        if (video && video.paused) {
          btn ? btn.click() : video.play().catch(() => {});
          return true;
        }
      } else if (action === 'pause') {
        if (video && !video.paused) {
          btn ? btn.click() : video.pause();
          return true;
        }
      } else if (action === 'prev') {
        const prevBtn = document.querySelector<HTMLElement>('.ytp-prev-button');
        if (prevBtn) {
          prevBtn.click();
          return true;
        } else if (video) {
          video.currentTime = Math.max(0, video.currentTime - 10);
          return true;
        }
      } else if (action === 'next') {
        const nextBtn = document.querySelector<HTMLElement>('.ytp-next-button');
        if (nextBtn) {
          nextBtn.click();
          return true;
        } else if (video) {
          video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10);
          return true;
        }
      }
    }
  }

  // 2. Spotify Web Player
  if (host.includes('spotify.com')) {
    if (action === 'playPause') {
      const btn = document.querySelector<HTMLElement>(
        '[data-testid="control-button-playpause"], button[aria-label="Play"], button[aria-label="Pause"]'
      );
      if (btn) {
        btn.click();
        return true;
      }
    } else if (action === 'play') {
      const playBtn = document.querySelector<HTMLElement>(
        'button[aria-label="Play"], [data-testid="control-button-play"]'
      );
      if (playBtn) {
        playBtn.click();
        return true;
      }
      const genericBtn = document.querySelector<HTMLElement>('[data-testid="control-button-playpause"]');
      if (genericBtn) {
        genericBtn.click();
        return true;
      }
    } else if (action === 'pause') {
      const pauseBtn = document.querySelector<HTMLElement>(
        'button[aria-label="Pause"], [data-testid="control-button-pause"]'
      );
      if (pauseBtn) {
        pauseBtn.click();
        return true;
      }
      const genericBtn = document.querySelector<HTMLElement>('[data-testid="control-button-playpause"]');
      if (genericBtn) {
        genericBtn.click();
        return true;
      }
    } else if (action === 'prev') {
      const btn = document.querySelector<HTMLElement>(
        '[data-testid="control-button-skip-back"], button[aria-label*="Previous"], button[aria-label*="back"]'
      );
      if (btn) {
        btn.click();
        return true;
      }
    } else if (action === 'next') {
      const btn = document.querySelector<HTMLElement>(
        '[data-testid="control-button-skip-forward"], button[aria-label*="Next"], button[aria-label*="forward"]'
      );
      if (btn) {
        btn.click();
        return true;
      }
    }
  }

  // 3. Apple Music
  if (host.includes('music.apple.com')) {
    if (action === 'playPause') {
      const btn = document.querySelector<HTMLElement>(
        '.playback-control__play-pause, button[aria-label*="Play"], button[aria-label*="Pause"]'
      );
      if (btn) {
        btn.click();
        return true;
      }
    } else if (action === 'play') {
      const btn = document.querySelector<HTMLElement>('button[aria-label*="Play"]') ||
                  document.querySelector<HTMLElement>('.playback-control__play-pause');
      if (btn) {
        btn.click();
        return true;
      }
    } else if (action === 'pause') {
      const btn = document.querySelector<HTMLElement>('button[aria-label*="Pause"]') ||
                  document.querySelector<HTMLElement>('.playback-control__play-pause');
      if (btn) {
        btn.click();
        return true;
      }
    } else if (action === 'prev') {
      const btn = document.querySelector<HTMLElement>(
        '.playback-control__previous, button[aria-label*="Previous"]'
      );
      if (btn) {
        btn.click();
        return true;
      }
    } else if (action === 'next') {
      const btn = document.querySelector<HTMLElement>(
        '.playback-control__next, button[aria-label*="Next"]'
      );
      if (btn) {
        btn.click();
        return true;
      }
    }
  }


  // 4. SoundCloud
  if (host.includes('soundcloud.com')) {
    if (action === 'playPause' || action === 'play' || action === 'pause') {
      const btn = document.querySelector<HTMLElement>('.playControls__play');
      if (btn) {
        btn.click();
        return true;
      }
    } else if (action === 'prev') {
      const btn = document.querySelector<HTMLElement>('.playControls__prev');
      if (btn) {
        btn.click();
        return true;
      }
    } else if (action === 'next') {
      const btn = document.querySelector<HTMLElement>('.playControls__next');
      if (btn) {
        btn.click();
        return true;
      }
    }
  }

  // 5. Bilibili
  if (host.includes('bilibili.com')) {
    if (action === 'playPause' || action === 'play' || action === 'pause') {
      const btn = document.querySelector<HTMLElement>('.bpx-player-ctrl-play, .squirtle-video-play');
      if (btn) {
        btn.click();
        return true;
      }
    } else if (action === 'prev') {
      const btn = document.querySelector<HTMLElement>('.bpx-player-ctrl-prev, .squirtle-video-prev');
      if (btn) {
        btn.click();
        return true;
      }
    } else if (action === 'next') {
      const btn = document.querySelector<HTMLElement>('.bpx-player-ctrl-next, .squirtle-video-next');
      if (btn) {
        btn.click();
        return true;
      }
    }
  }

  // 6. Generic HTML5 media tags handling
  const mediaElements = Array.from(document.querySelectorAll<HTMLMediaElement>('video, audio'));
  if (mediaElements.length > 0) {
    if (action === 'playPause') {
      const playing = mediaElements.find((m) => !m.paused);
      if (playing) {
        playing.pause();
        return true;
      } else {
        const target = mediaElements[0];
        target.play().catch(() => {});
        return true;
      }
    } else if (action === 'play') {
      const target = mediaElements[0];
      target.play().catch(() => {});
      return true;
    } else if (action === 'pause') {
      mediaElements.forEach((m) => m.pause());
      return true;
    } else if (action === 'prev') {
      const active = mediaElements.find((m) => !m.paused) || mediaElements[0];
      if (active) {
        if (active.currentTime > 3) {
          active.currentTime = 0;
        } else {
          active.currentTime = Math.max(0, active.currentTime - 10);
        }
        return true;
      }
    } else if (action === 'next') {
      const active = mediaElements.find((m) => !m.paused) || mediaElements[0];
      if (active) {
        active.currentTime = Math.min(active.duration || Infinity, active.currentTime + 10);
        return true;
      }
    }
  }

  // 7. Media Key & Key event fallback
  try {
    const keyMap = {
      playPause: 'MediaPlayPause',
      play: 'MediaPlay',
      pause: 'MediaPause',
      prev: 'MediaTrackPrevious',
      next: 'MediaTrackNext',
    };
    const keyName = keyMap[action];
    if (keyName) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: keyName, code: keyName, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: keyName, code: keyName, bubbles: true }));
    }
  } catch {}

  return false;
}

// Listen for messages from popup, sidepanel, or background
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

  if (message.type === 'MEDIA_CONTROL') {
    const action = message.action as 'prev' | 'next' | 'playPause' | 'play' | 'pause';
    const handled = executeMediaAction(action);
    return Promise.resolve({ success: true, handled });
  }

  return undefined;
});

