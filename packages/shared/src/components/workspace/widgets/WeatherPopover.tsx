'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { WorkspaceWidget, WeatherConfig } from '../../../types/workspace';
import { SpaceThemeTokens } from '../../../utils/spaceTheme';
import {
  fetchCurrentWeather,
  searchCities,
  WeatherData,
  GeocodingResult,
  getWeatherInterpretation,
} from '../../../utils/weatherService';
import { CloudSunIcon, SearchIcon, RotateCcwIcon } from '../../Icons';

export interface WeatherPopoverProps {
  widget: WorkspaceWidget;
  anchorRect: DOMRect | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateConfig: (config: WeatherConfig) => void;
  theme: SpaceThemeTokens;
}

export const WeatherPopover: React.FC<WeatherPopoverProps> = ({
  widget,
  anchorRect,
  isOpen,
  onClose,
  onUpdateConfig,
  theme,
}) => {
  const config = (widget.config as WeatherConfig) || {};
  const tempUnit = config.tempUnit || 'c';

  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodingResult[]>([]);
  const [searchingCities, setSearchingCities] = useState(false);

  // Load weather when opened or coords/unit changed
  const loadWeather = async (lat?: number, lon?: number, city?: string, unit: 'c' | 'f' = tempUnit) => {
    setLoading(true);
    setError(null);
    try {
      // Default to London (51.5074, -0.1278) if no coordinates saved
      const targetLat = lat ?? config.latitude ?? 51.5074;
      const targetLon = lon ?? config.longitude ?? -0.1278;
      const targetCity = city ?? config.city ?? 'London';

      const data = await fetchCurrentWeather(targetLat, targetLon, unit, targetCity);
      setWeatherData(data);

      onUpdateConfig({
        ...config,
        latitude: targetLat,
        longitude: targetLon,
        city: targetCity,
        tempUnit: unit,
        cachedTemp: data.temperature,
        cachedCode: data.weatherCode,
        lastFetched: Date.now(),
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to load weather');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      // If we don't have weather data or cached data is older than 30 mins, fetch fresh
      if (!weatherData || (config.lastFetched && Date.now() - config.lastFetched > 30 * 60 * 1000)) {
        loadWeather();
      } else if (!weatherData && config.cachedTemp !== undefined) {
        const { text, emoji } = getWeatherInterpretation(config.cachedCode || 0);
        setWeatherData({
          temperature: config.cachedTemp,
          tempUnit,
          weatherCode: config.cachedCode || 0,
          weatherText: text,
          weatherEmoji: emoji,
          isDay: true,
          city: config.city || 'London',
          fetchedAt: config.lastFetched || Date.now(),
        });
      }
    }
  }, [isOpen]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      const popoverEl = document.getElementById(`weather-popover-${widget.id}`);
      if (popoverEl && !popoverEl.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, widget.id]);

  if (!isOpen || !anchorRect || typeof document === 'undefined') return null;

  const width = 250;
  const height = isSearching ? 260 : 210;
  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const fitsBelow = spaceBelow >= height + 10;
  const top = fitsBelow ? anchorRect.bottom + 6 : Math.max(10, anchorRect.top - height - 6);
  const left = Math.min(Math.max(10, anchorRect.left), Math.max(10, window.innerWidth - width - 10));

  const handleCitySearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchingCities(true);
    try {
      const results = await searchCities(searchQuery);
      setSearchResults(results);
    } finally {
      setSearchingCities(false);
    }
  };

  const handleSelectCity = (item: GeocodingResult) => {
    setIsSearching(false);
    setSearchQuery('');
    setSearchResults([]);
    loadWeather(item.latitude, item.longitude, item.name);
  };

  const handleUseGeolocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsSearching(false);
        loadWeather(pos.coords.latitude, pos.coords.longitude, 'My Location');
      },
      (err) => {
        setError(err.message || 'Location permission denied');
      }
    );
  };

  const handleToggleUnit = () => {
    const nextUnit = tempUnit === 'c' ? 'f' : 'c';
    loadWeather(config.latitude, config.longitude, config.city, nextUnit);
  };

  return createPortal(
    <div
      id={`weather-popover-${widget.id}`}
      style={{
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        width: `${width}px`,
        backgroundColor: theme.isDark ? '#1e293b' : '#ffffff',
        border: `1px solid ${theme.borderColor}`,
        borderRadius: '16px',
        boxShadow: theme.isDark
          ? '0 12px 36px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.3)'
          : '0 12px 36px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.06)',
        padding: '14px',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        color: theme.textColor,
        boxSizing: 'border-box',
        backdropFilter: 'blur(16px)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 700 }}>
          <CloudSunIcon size={14} color={theme.primaryColor} />
          <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {weatherData?.city || config.city || 'Weather'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            type="button"
            onClick={handleToggleUnit}
            title="Toggle °C / °F"
            style={{
              fontSize: '11px',
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: '6px',
              border: `1px solid ${theme.borderColor}`,
              background: 'transparent',
              color: theme.textColor,
              cursor: 'pointer',
            }}
          >
            °{tempUnit.toUpperCase()}
          </button>
          <button
            type="button"
            onClick={() => setIsSearching(!isSearching)}
            title="Search city"
            style={{
              padding: '4px',
              border: 'none',
              background: 'none',
              color: isSearching ? theme.primaryColor : theme.subtextColor,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <SearchIcon size={13} />
          </button>
          <button
            type="button"
            onClick={() => loadWeather()}
            title="Refresh weather"
            style={{
              padding: '4px',
              border: 'none',
              background: 'none',
              color: theme.subtextColor,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <RotateCcwIcon size={12} />
          </button>
        </div>
      </div>

      {isSearching ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <form onSubmit={handleCitySearch} style={{ display: 'flex', gap: '4px' }}>
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Enter city name..."
              style={{
                flex: 1,
                padding: '6px 8px',
                borderRadius: '8px',
                border: `1px solid ${theme.borderColor}`,
                background: theme.isDark ? 'rgba(0,0,0,0.3)' : '#f8fafc',
                color: theme.textColor,
                fontSize: '12px',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={searchingCities}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                border: 'none',
                background: theme.primaryColor,
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Go
            </button>
          </form>

          <button
            type="button"
            onClick={handleUseGeolocation}
            style={{
              padding: '5px',
              fontSize: '11px',
              borderRadius: '6px',
              border: `1px solid ${theme.borderColor}`,
              background: 'transparent',
              color: theme.textColor,
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            📍 Use My Current Location
          </button>

          {/* Results list */}
          <div style={{ maxHeight: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {searchResults.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectCity(item)}
                style={{
                  padding: '5px 8px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'transparent',
                  color: theme.textColor,
                  fontSize: '11.5px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <span>{item.name}</span>
                <span style={{ fontSize: '10px', color: theme.subtextColor }}>{item.country}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* Weather overview */
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '6px 0' }}>
          {loading ? (
            <div style={{ fontSize: '12px', color: theme.subtextColor, padding: '16px 0' }}>Updating weather...</div>
          ) : error ? (
            <div style={{ fontSize: '11.5px', color: '#ef4444', textAlign: 'center', padding: '8px 0' }}>{error}</div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '36px', lineHeight: 1 }}>{weatherData?.weatherEmoji || '☀️'}</span>
                <div style={{ fontSize: '34px', fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1 }}>
                  {weatherData?.temperature ?? '--'}°
                </div>
              </div>

              <div style={{ fontSize: '12.5px', fontWeight: 600, color: theme.textColor }}>
                {weatherData?.weatherText || 'Clear'}
              </div>

              {weatherData?.windSpeed !== undefined && (
                <div style={{ fontSize: '10.5px', color: theme.subtextColor }}>
                  Wind: {weatherData.windSpeed} km/h
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>,
    document.body
  );
};
