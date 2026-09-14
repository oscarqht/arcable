'use client';

import { useEffect, useRef, useCallback } from 'react';
import { WorkspaceWidget, WeatherConfig } from '../types/workspace';
import { fetchCurrentWeather, WEATHER_REFRESH_INTERVAL_MS } from '../utils/weatherService';

export interface UseWeatherAutoFetchOptions {
  widgets?: WorkspaceWidget[];
  onUpdateWidget?: (id: string, updates: Partial<WorkspaceWidget>) => void;
  /**
   * Interval in milliseconds for polling checks while visible.
   * Default: 30,000ms (30 seconds).
   */
  checkIntervalMs?: number;
}

// Backoff delay before retrying a widget whose weather fetch failed (e.g., offline)
const RETRY_BACKOFF_ON_ERROR_MS = 5 * 60 * 1000; // 5 minutes

export function useWeatherAutoFetch({
  widgets = [],
  onUpdateWidget,
  checkIntervalMs = 30 * 1000,
}: UseWeatherAutoFetchOptions) {
  const inFlightRef = useRef<Set<string>>(new Set());
  const lastErrorTimeRef = useRef<Map<string, number>>(new Map());
  const widgetsRef = useRef(widgets);
  const onUpdateWidgetRef = useRef(onUpdateWidget);

  useEffect(() => {
    widgetsRef.current = widgets;
  }, [widgets]);

  useEffect(() => {
    onUpdateWidgetRef.current = onUpdateWidget;
  }, [onUpdateWidget]);

  const checkAndFetchWeather = useCallback(async () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    // Only fetch if page is currently visible
    if (document.visibilityState !== 'visible') return;

    const currentWidgets = widgetsRef.current;
    const updateFn = onUpdateWidgetRef.current;
    if (!updateFn || !currentWidgets || currentWidgets.length === 0) return;

    const weatherWidgets = currentWidgets.filter((w) => w.style === 'weather');
    if (weatherWidgets.length === 0) return;

    const now = Date.now();

    for (const widget of weatherWidgets) {
      const config = (widget.config as WeatherConfig) || {};
      const lastFetched = config.lastFetched;
      const lastError = lastErrorTimeRef.current.get(widget.id);

      // If previous attempt failed, wait at least RETRY_BACKOFF_ON_ERROR_MS before retrying
      if (lastError && now - lastError < RETRY_BACKOFF_ON_ERROR_MS) {
        continue;
      }

      // Check if never fetched or last fetch was one hour ago (>= 1 hour)
      const isStale = !lastFetched || now - lastFetched >= WEATHER_REFRESH_INTERVAL_MS;

      if (isStale && !inFlightRef.current.has(widget.id)) {
        inFlightRef.current.add(widget.id);

        const targetLat = config.latitude ?? 51.5074;
        const targetLon = config.longitude ?? -0.1278;
        const targetCity = config.city ?? 'London';
        const targetUnit = config.tempUnit || 'c';

        try {
          const data = await fetchCurrentWeather(targetLat, targetLon, targetUnit, targetCity);
          lastErrorTimeRef.current.delete(widget.id);
          updateFn(widget.id, {
            config: {
              ...config,
              latitude: targetLat,
              longitude: targetLon,
              city: targetCity,
              tempUnit: targetUnit,
              cachedTemp: data.temperature,
              cachedCode: data.weatherCode,
              lastFetched: Date.now(),
            },
          });
        } catch (err) {
          console.error(`[useWeatherAutoFetch] Failed auto-fetching weather for widget ${widget.id}:`, err);
          lastErrorTimeRef.current.set(widget.id, Date.now());
        } finally {
          inFlightRef.current.delete(widget.id);
        }
      }
    }
  }, []);

  // 1. Initial check on mount, visibility change listener, and recurring periodic interval while visible
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    // Check immediately on mount if page is visible
    checkAndFetchWeather();

    // Auto fetch when page becomes visible and last fetch was one hour ago
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkAndFetchWeather();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Auto fetch update every hour when page is visible (checked every checkIntervalMs)
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        checkAndFetchWeather();
      }
    }, checkIntervalMs);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(timer);
    };
  }, [checkAndFetchWeather, checkIntervalMs]);

  // 2. Check whenever widgets array changes (e.g. newly added weather widget)
  useEffect(() => {
    checkAndFetchWeather();
  }, [widgets, checkAndFetchWeather]);
}
