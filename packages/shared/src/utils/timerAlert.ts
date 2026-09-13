/**
 * Plays a pleasant synthesizer chime when a timer completes using Web Audio API.
 * Does not depend on external sound assets.
 */
export function playChimeSound() {
  if (typeof window === 'undefined') return;

  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    // Play a gentle two-tone or three-tone chord (E5, G#5, B5)
    const notes = [659.25, 830.61, 987.77];
    const now = ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);

      gain.gain.setValueAtTime(0, now + idx * 0.12);
      gain.gain.linearRampToValueAtTime(0.18, now + idx * 0.12 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.8);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 0.85);
    });
  } catch (err) {
    console.warn('Audio chime playback failed:', err);
  }
}

/**
 * Triggers a browser desktop notification if permission is granted.
 */
export function sendTimerNotification(title: string, body: string) {
  if (typeof window === 'undefined') return;

  playChimeSound();

  if ('Notification' in window) {
    if (Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: '/docs/icon.png',
        });
      } catch {
        // Ignored if service worker requirement or context restriction
      }
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((perm) => {
        if (perm === 'granted') {
          try {
            new Notification(title, {
              body,
              icon: '/docs/icon.png',
            });
          } catch {
            // Ignored
          }
        }
      });
    }
  }
}
