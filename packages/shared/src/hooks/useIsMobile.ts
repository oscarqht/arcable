'use client';

import { useState, useEffect } from 'react';

/**
 * Custom hook to detect if the current device/browser environment is a mobile browser
 * (touch screen, mobile user agent, coarse pointer, or lack of hover support).
 * In desktop browsers: returns false (so menu buttons are visible only on hover).
 * In mobile browsers: returns true (so menu buttons are always visible).
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;

    try {
      const hasTouch = 'ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
      const isMobileUA = typeof navigator !== 'undefined' && Boolean(
        navigator.userAgent &&
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent)
      );
      const isCoarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
      const isHoverNone = window.matchMedia?.('(hover: none)').matches ?? false;
      const isSmallTouch = hasTouch && window.innerWidth <= 1024;

      return Boolean(isMobileUA || isHoverNone || isCoarse || isSmallTouch);
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const checkIsMobile = (): boolean => {
      if (typeof window === 'undefined') return false;

      try {
        const hasTouch = 'ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
        const isMobileUA = typeof navigator !== 'undefined' && Boolean(
          navigator.userAgent &&
          /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent)
        );
        const isCoarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
        const isHoverNone = window.matchMedia?.('(hover: none)').matches ?? false;
        const isSmallScreen = window.innerWidth <= 768;

        return Boolean(isMobileUA || (hasTouch && (isCoarse || isHoverNone || isSmallScreen)));
      } catch {
        return false;
      }
    };

    // Update state on mount
    setIsMobile(checkIsMobile());

    const mqlCoarse = window.matchMedia?.('(pointer: coarse)');
    const mqlHover = window.matchMedia?.('(hover: none)');
    const mqlWidth = window.matchMedia?.('(max-width: 768px)');

    const handleUpdate = () => {
      setIsMobile(checkIsMobile());
    };

    window.addEventListener('resize', handleUpdate);
    window.addEventListener('orientationchange', handleUpdate);
    mqlCoarse?.addEventListener?.('change', handleUpdate);
    mqlHover?.addEventListener?.('change', handleUpdate);
    mqlWidth?.addEventListener?.('change', handleUpdate);

    return () => {
      window.removeEventListener('resize', handleUpdate);
      window.removeEventListener('orientationchange', handleUpdate);
      mqlCoarse?.removeEventListener?.('change', handleUpdate);
      mqlHover?.removeEventListener?.('change', handleUpdate);
      mqlWidth?.removeEventListener?.('change', handleUpdate);
    };
  }, []);

  return isMobile;
}
