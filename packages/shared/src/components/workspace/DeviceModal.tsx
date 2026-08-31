'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { DeviceSyncRecord } from '../../types/sync';
import {
  getOrCreateDeviceId,
  getStoredDeviceName,
  setStoredDeviceName,
  isDeviceOnline,
  sortDevicesByLastSync,
  detectDeviceType,
  detectBrowserName,
  detectOsName,
} from '../../utils/syncEngine';
import {
  fetchRaindropDevices,
  renameRaindropDevice,
  deleteRaindropDevice,
  deleteAllOtherRaindropDevices,
} from '../../utils/raindropSync';
import { Button } from '../Button';
import { Badge } from '../Badge';
import { useSystemTheme } from '../../hooks/useSystemTheme';
import {
  DevicesIcon,
  LaptopIcon,
  EditIcon,
  TrashIcon,
  CheckIcon,
  CloseIcon,
  RefreshIcon,
} from '../Icons';

// --- Icon data URIs (base64-encoded, no binary imports needed) ---
import {
  iconTypeExt as typeExtSrc,
  iconTypeWeb as typeWebSrc,
  iconBrowserChrome as browserChromeSrc,
  iconBrowserFirefox as browserFirefoxSrc,
  iconBrowserZen as browserZenSrc,
  iconBrowserBrave as browserBraveSrc,
  iconBrowserArc as browserArcSrc,
  iconBrowserVivalid as browserVivaldiSrc,
  iconBrowserComet as browserCometSrc,
  iconBrowserDia as browserDiaSrc,
  iconOsMac as osMacSrc,
  iconOsWindows as osWindowsSrc,
} from '../../assets/icons';

// ---------------------------------------------------------------------------
// Rename option definitions
// ---------------------------------------------------------------------------

interface RenameOption {
  value: string;
  label: string;
  icon?: string; // image src
}

const TYPE_OPTIONS: RenameOption[] = [
  { value: 'Ext', label: 'Ext', icon: typeExtSrc },
  { value: 'Web App', label: 'Web App', icon: typeWebSrc },
];

const BROWSER_OPTIONS: RenameOption[] = [
  { value: 'Chrome', label: 'Chrome', icon: browserChromeSrc },
  { value: 'Firefox', label: 'Firefox', icon: browserFirefoxSrc },
  { value: 'Zen', label: 'Zen', icon: browserZenSrc },
  { value: 'Brave', label: 'Brave', icon: browserBraveSrc },
  { value: 'Arc', label: 'Arc', icon: browserArcSrc },
  { value: 'Vivaldi', label: 'Vivaldi', icon: browserVivaldiSrc },
  { value: 'Comet', label: 'Comet', icon: browserCometSrc },
  { value: 'Dia', label: 'Dia', icon: browserDiaSrc },
];

const OS_OPTIONS: RenameOption[] = [
  { value: 'macOS', label: 'macOS', icon: osMacSrc },
  { value: 'Windows', label: 'Windows', icon: osWindowsSrc },
];

const LOCATION_OPTIONS: RenameOption[] = [
  { value: 'home', label: '🏠 Home' },
  { value: 'office', label: '🏢 Office' },
];

// ---------------------------------------------------------------------------

export interface DeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  raindropToken?: string;
  currentDeviceId?: string;
  onFetchDevices?: () => Promise<DeviceSyncRecord[]>;
  onRenameDevice?: (deviceId: string, newName: string) => Promise<DeviceSyncRecord[] | void>;
  onDeleteDevice?: (deviceId: string) => Promise<DeviceSyncRecord[] | void>;
  onDeleteOtherDevices?: (keepDeviceId: string) => Promise<DeviceSyncRecord[] | void>;
}

function formatSyncTime(timestamp?: number): string {
  if (!timestamp) return 'Never synced';
  const now = Date.now();
  const diffSec = Math.floor((now - timestamp) / 1000);

  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) {
    const mins = Math.floor(diffSec / 60);
    return `${mins} min${mins > 1 ? 's' : ''} ago`;
  }
  if (diffSec < 86400) {
    const hours = Math.floor(diffSec / 3600);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  }
  const days = Math.floor(diffSec / 86400);
  if (days < 7) {
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Smart-name pill selector row
// ---------------------------------------------------------------------------

interface PillRowProps {
  options: RenameOption[];
  selected: string;
  onSelect: (value: string) => void;
  isDark: boolean;
}

const PillRow: React.FC<PillRowProps> = ({ options, selected, onSelect, isDark }) => (
  <div
    style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: '5px',
    }}
  >
    {options.map((opt) => {
      const isSelected = selected === opt.value;
      return (
        <button
          key={opt.value}
          type="button"
          onClick={() => onSelect(isSelected ? '' : opt.value)}
          title={opt.label}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 8px',
            borderRadius: '20px',
            border: isSelected
              ? '1.5px solid #0284c7'
              : `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
            background: isSelected
              ? isDark ? 'rgba(2,132,199,0.2)' : '#e0f2fe'
              : isDark ? '#0f172a' : '#f8fafc',
            color: isSelected
              ? isDark ? '#38bdf8' : '#0284c7'
              : isDark ? '#94a3b8' : '#64748b',
            cursor: 'pointer',
            fontSize: '11px',
            fontWeight: isSelected ? 600 : 400,
            transition: 'all 0.12s ease',
            whiteSpace: 'nowrap',
          }}
        >
          {opt.icon && (
            <img
              src={opt.icon}
              alt=""
              style={{ width: '13px', height: '13px', objectFit: 'contain', flexShrink: 0 }}
            />
          )}
          {opt.label}
        </button>
      );
    })}
  </div>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const DeviceModal: React.FC<DeviceModalProps> = ({
  isOpen,
  onClose,
  raindropToken,
  currentDeviceId,
  onFetchDevices,
  onRenameDevice,
  onDeleteDevice,
  onDeleteOtherDevices,
}) => {
  const { isDark } = useSystemTheme();
  const [devices, setDevices] = useState<DeviceSyncRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Active editing device state
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);

  // Rename mode
  const [renameMode, setRenameMode] = useState<'smart' | 'custom'>('smart');
  // Smart selector state
  const [smartType, setSmartType] = useState('');
  const [smartBrowser, setSmartBrowser] = useState('');
  const [smartOs, setSmartOs] = useState('');
  const [smartLocation, setSmartLocation] = useState('');

  // Confirm delete device state
  const [confirmDeleteDevice, setConfirmDeleteDevice] = useState<DeviceSyncRecord | null>(null);
  // Confirm delete all other devices state
  const [confirmDeleteOtherDevices, setConfirmDeleteOtherDevices] = useState(false);

  const effectiveCurrentDeviceId = currentDeviceId || (typeof window !== 'undefined' ? getOrCreateDeviceId() : '');

  // Sorted devices: always sorted by lastSyncAt descending (most recent one on top)
  const sortedDevices = useMemo(() => {
    return sortDevicesByLastSync(devices);
  }, [devices]);

  // Derive the generated name from smart selectors
  const generateSmartName = useCallback((): string => {
    const parts = [smartType, smartBrowser, smartOs].filter(Boolean);
    if (smartLocation === 'home') parts.push('🏠 Home');
    else if (smartLocation === 'office') parts.push('🏢 Office');
    return parts.join(' / ');
  }, [smartType, smartBrowser, smartOs, smartLocation]);

  const loadDevices = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setErrorMessage(null);
    }

    try {
      if (onFetchDevices) {
        const fetched = await onFetchDevices();
        if (Array.isArray(fetched)) {
          setDevices(sortDevicesByLastSync(fetched));
        }
      } else if (raindropToken) {
        const res = await fetchRaindropDevices(raindropToken, effectiveCurrentDeviceId);
        if (res.success && res.devices) {
          setDevices(sortDevicesByLastSync(res.devices));
        } else {
          setErrorMessage(res.error || 'Failed to load devices from Raindrop.');
        }
      } else {
        setErrorMessage('Please connect Raindrop account or provide an access token to view devices.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error loading devices.');
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [onFetchDevices, raindropToken, effectiveCurrentDeviceId]);

  useEffect(() => {
    if (isOpen) {
      setEditingDeviceId(null);
      setConfirmDeleteDevice(null);
      setConfirmDeleteOtherDevices(false);
      setSuccessMessage(null);
      void loadDevices();
    }
  }, [isOpen, loadDevices]);

  const resetRenameState = () => {
    setRenameMode('smart');
    setSmartType('');
    setSmartBrowser('');
    setSmartOs('');
    setSmartLocation('');
    setEditNameValue('');
  };

  const handleStartRename = (device: DeviceSyncRecord) => {
    // Only allow renaming the current device
    if (device.deviceId !== effectiveCurrentDeviceId) return;

    // Try to parse the existing name as a smart name and pre-select matching values
    const existingName = (device.deviceName || '').trim();
    const parts = existingName.split(' / ').map((p) => p.trim());

    const typeValues = new Set(TYPE_OPTIONS.map((o) => o.value));
    const browserValues = new Set(BROWSER_OPTIONS.map((o) => o.value));
    const osValues = new Set(OS_OPTIONS.map((o) => o.value));

    let detectedType = '';
    let detectedBrowser = '';
    let detectedOs = '';
    let detectedLocation = '';

    for (const part of parts) {
      if (!detectedType && typeValues.has(part)) { detectedType = part; continue; }
      if (!detectedBrowser && browserValues.has(part)) { detectedBrowser = part; continue; }
      if (!detectedOs && osValues.has(part)) { detectedOs = part; continue; }
      if (part === '🏠 Home') { detectedLocation = 'home'; continue; }
      if (part === '🏢 Office') { detectedLocation = 'office'; continue; }
    }

    if (!detectedType) detectedType = detectDeviceType();
    if (!detectedBrowser) {
      const currentBrowser = detectBrowserName();
      if (browserValues.has(currentBrowser)) detectedBrowser = currentBrowser;
    }
    if (!detectedOs) {
      const currentOs = detectOsName();
      if (osValues.has(currentOs)) detectedOs = currentOs;
    }

    setRenameMode('smart');
    setSmartType(detectedType);
    setSmartBrowser(detectedBrowser);
    setSmartOs(detectedOs);
    setSmartLocation(detectedLocation);
    setEditNameValue('');
    setEditingDeviceId(device.deviceId);
    setConfirmDeleteDevice(null);
    setConfirmDeleteOtherDevices(false);
  };

  const handleCancelRename = () => {
    setEditingDeviceId(null);
    resetRenameState();
  };

  const handleSaveRename = async (deviceId: string) => {
    const trimmed = renameMode === 'smart' ? generateSmartName().trim() : editNameValue.trim();
    if (!trimmed) return;

    // Only allow renaming the current device
    if (deviceId !== effectiveCurrentDeviceId) return;

    setActionInProgressId(deviceId);
    setErrorMessage(null);
    try {
      // Remember locally for next syncs
      setStoredDeviceName(trimmed);

      if (onRenameDevice) {
        const updated = await onRenameDevice(deviceId, trimmed);
        if (Array.isArray(updated)) {
          setDevices(sortDevicesByLastSync(updated));
        } else {
          await loadDevices(true);
        }
      } else if (raindropToken) {
        const res = await renameRaindropDevice(raindropToken, deviceId, trimmed);
        if (res.success && res.devices) {
          setDevices(sortDevicesByLastSync(res.devices));
        } else {
          throw new Error(res.error || 'Failed to rename device');
        }
      }

      setSuccessMessage('Device renamed successfully.');
      setTimeout(() => setSuccessMessage(null), 3000);
      setEditingDeviceId(null);
      resetRenameState();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to rename device.');
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteDevice) return;
    const deviceId = confirmDeleteDevice.deviceId;

    setActionInProgressId(deviceId);
    setErrorMessage(null);
    try {
      if (onDeleteDevice) {
        const updated = await onDeleteDevice(deviceId);
        if (Array.isArray(updated)) {
          setDevices(sortDevicesByLastSync(updated));
        } else {
          await loadDevices(true);
        }
      } else if (raindropToken) {
        const res = await deleteRaindropDevice(raindropToken, deviceId);
        if (res.success && res.devices) {
          setDevices(sortDevicesByLastSync(res.devices));
        } else {
          throw new Error(res.error || 'Failed to delete device');
        }
      }

      setSuccessMessage(`Device "${confirmDeleteDevice.deviceName || confirmDeleteDevice.deviceId}" removed.`);
      setTimeout(() => setSuccessMessage(null), 3500);
      setConfirmDeleteDevice(null);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to delete device.');
    } finally {
      setActionInProgressId(null);
    }
  };

  const handleConfirmDeleteOtherDevices = async () => {
    setActionInProgressId('all_other');
    setErrorMessage(null);
    try {
      if (onDeleteOtherDevices) {
        const updated = await onDeleteOtherDevices(effectiveCurrentDeviceId);
        if (Array.isArray(updated)) {
          setDevices(sortDevicesByLastSync(updated));
        } else {
          await loadDevices(true);
        }
      } else if (raindropToken) {
        const res = await deleteAllOtherRaindropDevices(raindropToken, effectiveCurrentDeviceId);
        if (res.success && res.devices) {
          setDevices(sortDevicesByLastSync(res.devices));
        } else {
          throw new Error(res.error || 'Failed to delete other devices');
        }
      }

      setSuccessMessage('All other devices removed. Workspace baseline re-compacted.');
      setTimeout(() => setSuccessMessage(null), 3500);
      setConfirmDeleteOtherDevices(false);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to delete other devices.');
    } finally {
      setActionInProgressId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <style>{`
        @media (max-width: 479.98px) {
          .arcable-device-modal-box {
            padding: 16px !important;
          }
          .arcable-device-id,
          .arcable-device-id-sep {
            display: none !important;
          }
          .arcable-device-badge-desktop {
            display: none !important;
          }
          .arcable-device-actions-desktop {
            display: none !important;
          }
          .arcable-device-row2 {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            width: 100% !important;
            margin-top: 4px !important;
            overflow: visible !important;
          }
          .arcable-device-row2-right {
            display: flex !important;
            align-items: center !important;
            gap: 6px !important;
            flex-shrink: 0 !important;
            margin-left: auto !important;
          }
          .arcable-device-badge-mobile {
            display: inline-flex !important;
          }
        }
      `}</style>
      <div
        style={{
          position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '16px',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        className="arcable-device-modal-box"
        style={{
          backgroundColor: isDark ? '#1e293b' : '#ffffff',
          borderRadius: '16px',
          padding: '24px',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: isDark
            ? '0 25px 50px -12px rgba(0, 0, 0, 0.6)'
            : '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '16px',
            borderBottom: `1px solid ${isDark ? '#334155' : '#f1f5f9'}`,
            paddingBottom: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                backgroundColor: isDark ? 'rgba(56, 189, 248, 0.15)' : '#e0f2fe',
                color: isDark ? '#38bdf8' : '#0284c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <DevicesIcon size={20} color={isDark ? '#38bdf8' : '#0284c7'} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: isDark ? '#f8fafc' : '#0f172a' }}>
                Device Management
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: isDark ? '#94a3b8' : '#64748b' }}>
                Synced clients in Raindrop <code style={{ fontSize: '11px', color: isDark ? '#38bdf8' : '#0284c7' }}>data.json</code>
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={() => void loadDevices()}
              disabled={loading}
              title="Refresh devices list"
              style={{
                border: `1px solid ${isDark ? '#475569' : '#e2e8f0'}`,
                background: isDark ? '#0f172a' : '#f8fafc',
                color: isDark ? '#94a3b8' : '#64748b',
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                transition: 'all 0.15s ease',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  animation: loading ? 'spin 1s linear infinite' : 'none',
                }}
              >
                <RefreshIcon size={14} color={isDark ? '#94a3b8' : '#64748b'} />
              </span>
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                border: 'none',
                background: 'transparent',
                fontSize: '18px',
                cursor: 'pointer',
                color: isDark ? '#94a3b8' : '#94a3b8',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CloseIcon size={18} />
            </button>
          </div>
        </div>

        {/* Feedback Alert Banners */}
        {errorMessage && (
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#fef2f2',
              border: `1px solid ${isDark ? '#b91c1c' : '#fecaca'}`,
              borderRadius: '8px',
              color: isDark ? '#fca5a5' : '#b91c1c',
              fontSize: '13px',
              marginBottom: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              style={{ border: 'none', background: 'none', color: isDark ? '#fca5a5' : '#b91c1c', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        )}

        {successMessage && (
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: isDark ? 'rgba(34, 197, 94, 0.2)' : '#f0fdf4',
              border: `1px solid ${isDark ? '#15803d' : '#bbf7d0'}`,
              borderRadius: '8px',
              color: isDark ? '#86efac' : '#15803d',
              fontSize: '13px',
              marginBottom: '14px',
            }}
          >
            ✓ {successMessage}
          </div>
        )}

        {/* Delete Confirmation Card */}
        {confirmDeleteDevice && (
          <div
            style={{
              padding: '14px',
              backgroundColor: isDark ? 'rgba(225, 29, 72, 0.15)' : '#fff1f2',
              border: `1px solid ${isDark ? '#9f1239' : '#fecdd3'}`,
              borderRadius: '10px',
              marginBottom: '14px',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 600, color: isDark ? '#fecdd3' : '#9f1239', marginBottom: '4px' }}>
              Confirm Device Removal
            </div>
            <p style={{ margin: '0 0 12px', fontSize: '12px', color: isDark ? '#fda4af' : '#be123c', lineHeight: 1.4 }}>
              Are you sure you want to delete <strong>{confirmDeleteDevice.deviceName || confirmDeleteDevice.deviceId}</strong>?
              The sync file will re-compact its baseline snapshot. If this device connects again later, its local cache will be overwritten with the latest remote state.
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmDeleteDevice(null)}
                disabled={actionInProgressId === confirmDeleteDevice.deviceId}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleConfirmDelete}
                isLoading={actionInProgressId === confirmDeleteDevice.deviceId}
                style={{ backgroundColor: '#e11d48', borderColor: '#e11d48', color: '#ffffff' }}
              >
                Delete Device
              </Button>
            </div>
          </div>
        )}

        {/* Delete All Other Devices Confirmation Card */}
        {confirmDeleteOtherDevices && (
          <div
            style={{
              padding: '14px',
              backgroundColor: isDark ? 'rgba(225, 29, 72, 0.15)' : '#fff1f2',
              border: `1px solid ${isDark ? '#9f1239' : '#fecdd3'}`,
              borderRadius: '10px',
              marginBottom: '14px',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 600, color: isDark ? '#fecdd3' : '#9f1239', marginBottom: '4px' }}>
              Confirm Remove All Other Devices
            </div>
            <p style={{ margin: '0 0 12px', fontSize: '12px', color: isDark ? '#fda4af' : '#be123c', lineHeight: 1.4 }}>
              Are you sure you want to delete all other devices except this current device?
              Only this current device will remain registered. The sync file will be re-compacted immediately.
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmDeleteOtherDevices(false)}
                disabled={actionInProgressId === 'all_other'}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleConfirmDeleteOtherDevices}
                isLoading={actionInProgressId === 'all_other'}
                style={{ backgroundColor: '#e11d48', borderColor: '#e11d48', color: '#ffffff' }}
              >
                Delete All But This
              </Button>
            </div>
          </div>
        )}

        {/* Device List Area */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '2px', minHeight: '180px' }}>
          {loading && sortedDevices.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: isDark ? '#94a3b8' : '#64748b', fontSize: '13px' }}>
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  border: `2px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                  borderTopColor: '#0284c7',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                  margin: '0 auto 10px',
                }}
              />
              Loading devices from Raindrop...
            </div>
          ) : sortedDevices.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '36px 16px',
                backgroundColor: isDark ? '#0f172a' : '#f8fafc',
                borderRadius: '12px',
                border: `1px dashed ${isDark ? '#334155' : '#cbd5e1'}`,
                color: isDark ? '#94a3b8' : '#64748b',
              }}
            >
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>💻</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: isDark ? '#cbd5e1' : '#334155' }}>No Devices Found</div>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: isDark ? '#64748b' : '#94a3b8' }}>
                Run a Raindrop sync to register this device into the workspace.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {sortedDevices.map((device) => {
                const isCurrent = device.deviceId === effectiveCurrentDeviceId;
                const isEditing = editingDeviceId === device.deviceId;
                const isBusy = actionInProgressId === device.deviceId;

                // Compute generated name for save button state
                const smartName = isEditing ? generateSmartName() : '';
                const canSave = isEditing
                  ? renameMode === 'smart' ? smartName.trim().length > 0 : editNameValue.trim().length > 0
                  : false;

                return (
                  <div
                    key={device.deviceId}
                    style={{
                      padding: '12px 14px',
                      backgroundColor: isCurrent
                        ? (isDark ? 'rgba(34, 197, 94, 0.15)' : '#f0fdf4')
                        : (isDark ? '#0f172a' : '#ffffff'),
                      border: isCurrent
                        ? `1.5px solid ${isDark ? '#16a34a' : '#86efac'}`
                        : `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: isEditing ? 'flex-start' : 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      transition: 'all 0.15s ease',
                      boxShadow: isCurrent ? '0 2px 4px rgba(22, 163, 74, 0.05)' : 'none',
                    }}
                  >
                    {/* Device icon & Info */}
                    <div style={{ display: 'flex', alignItems: isEditing ? 'flex-start' : 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          width: '34px',
                          height: '34px',
                          borderRadius: '8px',
                          backgroundColor: isCurrent
                            ? (isDark ? 'rgba(34, 197, 94, 0.25)' : '#dcfce7')
                            : (isDark ? '#1e293b' : '#f1f5f9'),
                          color: isCurrent ? (isDark ? '#4ade80' : '#16a34a') : (isDark ? '#94a3b8' : '#64748b'),
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          marginTop: isEditing ? '2px' : '0',
                        }}
                      >
                        <LaptopIcon size={18} color={isCurrent ? (isDark ? '#4ade80' : '#16a34a') : (isDark ? '#94a3b8' : '#64748b')} />
                      </div>

                      <div style={{ minWidth: 0, flex: 1 }}>
                        {isEditing ? (
                          /* -------------------------------------------------- */
                          /* Rename editor                                        */
                          /* -------------------------------------------------- */
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

                            {renameMode === 'smart' ? (
                              /* Smart mode */
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {/* Type */}
                                <div>
                                  <div style={{ fontSize: '10px', fontWeight: 600, color: isDark ? '#64748b' : '#94a3b8', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Type
                                  </div>
                                  <PillRow options={TYPE_OPTIONS} selected={smartType} onSelect={setSmartType} isDark={isDark} />
                                </div>

                                {/* Browser */}
                                <div>
                                  <div style={{ fontSize: '10px', fontWeight: 600, color: isDark ? '#64748b' : '#94a3b8', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Browser
                                  </div>
                                  <PillRow options={BROWSER_OPTIONS} selected={smartBrowser} onSelect={setSmartBrowser} isDark={isDark} />
                                </div>

                                {/* OS */}
                                <div>
                                  <div style={{ fontSize: '10px', fontWeight: 600, color: isDark ? '#64748b' : '#94a3b8', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    OS
                                  </div>
                                  <PillRow options={OS_OPTIONS} selected={smartOs} onSelect={setSmartOs} isDark={isDark} />
                                </div>

                                {/* Location */}
                                <div>
                                  <div style={{ fontSize: '10px', fontWeight: 600, color: isDark ? '#64748b' : '#94a3b8', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Location
                                  </div>
                                  <PillRow options={LOCATION_OPTIONS} selected={smartLocation} onSelect={setSmartLocation} isDark={isDark} />
                                </div>

                                {/* Name preview */}
                                <div
                                  style={{
                                    padding: '6px 10px',
                                    borderRadius: '8px',
                                    backgroundColor: isDark ? '#0f172a' : '#f1f5f9',
                                    border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                                    fontSize: '12px',
                                    color: smartName ? (isDark ? '#f8fafc' : '#0f172a') : (isDark ? '#475569' : '#94a3b8'),
                                    fontWeight: smartName ? 600 : 400,
                                    fontStyle: smartName ? 'normal' : 'italic',
                                  }}
                                >
                                  {smartName || 'Select options above to generate a name…'}
                                </div>
                              </div>
                            ) : (
                              /* Custom mode */
                              <input
                                type="text"
                                value={editNameValue}
                                onChange={(e) => setEditNameValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') void handleSaveRename(device.deviceId);
                                  if (e.key === 'Escape') handleCancelRename();
                                }}
                                autoFocus
                                disabled={isBusy}
                                placeholder="Enter device name…"
                                style={{
                                  width: '100%',
                                  padding: '6px 10px',
                                  fontSize: '13px',
                                  borderRadius: '6px',
                                  border: '1.5px solid #0284c7',
                                  backgroundColor: isDark ? '#1e293b' : '#ffffff',
                                  color: isDark ? '#f8fafc' : '#0f172a',
                                  outline: 'none',
                                  boxSizing: 'border-box',
                                }}
                              />
                            )}

                            {/* Action row: Save / Cancel + mode toggle */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                              {/* Mode toggle */}
                              <button
                                type="button"
                                onClick={() => {
                                  setRenameMode(renameMode === 'smart' ? 'custom' : 'smart');
                                  setEditNameValue('');
                                }}
                                style={{
                                  border: 'none',
                                  background: 'none',
                                  padding: 0,
                                  cursor: 'pointer',
                                  fontSize: '11px',
                                  color: isDark ? '#38bdf8' : '#0284c7',
                                  textDecoration: 'underline',
                                  textUnderlineOffset: '2px',
                                }}
                              >
                                {renameMode === 'smart' ? 'Custom name' : 'Smart name'}
                              </button>

                              {/* Save / Cancel */}
                              <div style={{ display: 'flex', gap: '5px' }}>
                                <button
                                  type="button"
                                  onClick={() => void handleSaveRename(device.deviceId)}
                                  disabled={isBusy || !canSave}
                                  title="Save name"
                                  style={{
                                    border: 'none',
                                    background: isBusy || canSave ? '#0284c7' : (isDark ? '#334155' : '#e2e8f0'),
                                    color: '#ffffff',
                                    padding: '4px 10px',
                                    borderRadius: '6px',
                                    cursor: canSave && !isBusy ? 'pointer' : 'not-allowed',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    transition: 'all 0.12s ease',
                                    opacity: isBusy ? 0.85 : 1,
                                    minWidth: '60px',
                                    justifyContent: 'center',
                                  }}
                                >
                                  {isBusy ? (
                                    <span
                                      style={{
                                        display: 'inline-block',
                                        width: '11px',
                                        height: '11px',
                                        border: '2px solid rgba(255,255,255,0.35)',
                                        borderTopColor: '#ffffff',
                                        borderRadius: '50%',
                                        animation: 'spin 0.7s linear infinite',
                                        flexShrink: 0,
                                      }}
                                    />
                                  ) : (
                                    <CheckIcon size={12} color={canSave ? '#ffffff' : (isDark ? '#475569' : '#94a3b8')} />
                                  )}
                                  {isBusy ? 'Saving…' : 'Save'}
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCancelRename}
                                  disabled={isBusy}
                                  title="Cancel"
                                  style={{
                                    border: `1px solid ${isDark ? '#475569' : '#cbd5e1'}`,
                                    background: isDark ? '#1e293b' : '#f8fafc',
                                    color: isDark ? '#94a3b8' : '#64748b',
                                    padding: '4px 10px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    transition: 'all 0.12s ease',
                                  }}
                                >
                                  <CloseIcon size={12} />
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div
                              className="arcable-device-row1"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                minWidth: 0,
                                flexWrap: 'nowrap',
                              }}
                            >
                              <span
                                style={{
                                  fontSize: '13px',
                                  fontWeight: 600,
                                  color: isDark ? '#f8fafc' : '#0f172a',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  minWidth: 0,
                                  flexShrink: 1,
                                }}
                                title={device.deviceName || 'Unnamed Device'}
                              >
                                {device.deviceName || 'Unnamed Device'}
                              </span>

                              <span className="arcable-device-badge-desktop" style={{ flexShrink: 0, display: 'inline-flex' }}>
                                {isCurrent ? (
                                  <Badge variant="success">Current</Badge>
                                ) : isDeviceOnline(device.lastSyncAt) ? (
                                  <Badge variant="info">Online</Badge>
                                ) : (
                                  <Badge variant="default">Offline</Badge>
                                )}
                              </span>
                            </div>

                            <div
                              className="arcable-device-row2"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                marginTop: '2px',
                                minWidth: 0,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <div
                                className="arcable-device-row2-left"
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  minWidth: 0,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                <span
                                  className="arcable-device-id"
                                  style={{
                                    fontFamily: 'monospace',
                                    fontSize: '11px',
                                    color: isDark ? '#64748b' : '#94a3b8',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    minWidth: 0,
                                    flexShrink: 1,
                                  }}
                                  title={device.deviceId}
                                >
                                  {device.deviceId.length > 20
                                    ? `${device.deviceId.substring(0, 16)}...`
                                    : device.deviceId}
                                </span>
                                <span
                                  className="arcable-device-id-sep"
                                  style={{
                                    fontSize: '11px',
                                    color: isDark ? '#475569' : '#cbd5e1',
                                    flexShrink: 0,
                                  }}
                                >
                                  •
                                </span>
                                <span
                                  style={{
                                    fontSize: '11px',
                                    color: isDark ? '#94a3b8' : '#64748b',
                                    flexShrink: 0,
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {formatSyncTime(device.lastSyncAt)}
                                </span>
                              </div>

                              <div
                                className="arcable-device-row2-right"
                                style={{
                                  display: 'none',
                                }}
                              >
                                <span className="arcable-device-badge-mobile" style={{ display: 'none', flexShrink: 0 }}>
                                  {isCurrent ? (
                                    <Badge variant="success">Current</Badge>
                                  ) : isDeviceOnline(device.lastSyncAt) ? (
                                    <Badge variant="info">Online</Badge>
                                  ) : (
                                    <Badge variant="default">Offline</Badge>
                                  )}
                                </span>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                  {isCurrent && (
                                    <button
                                      type="button"
                                      onClick={() => handleStartRename(device)}
                                      disabled={isBusy}
                                      title="Rename Current Device"
                                      style={{
                                        border: `1px solid ${isDark ? '#475569' : '#e2e8f0'}`,
                                        background: isDark ? '#1e293b' : '#f8fafc',
                                        color: isDark ? '#cbd5e1' : '#475569',
                                        width: '26px',
                                        height: '26px',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: 0,
                                        transition: 'all 0.15s ease',
                                      }}
                                    >
                                      <EditIcon size={13} color={isDark ? '#cbd5e1' : '#475569'} />
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteDevice(device)}
                                    disabled={isBusy}
                                    title="Delete"
                                    style={{
                                      border: `1px solid ${isDark ? '#7f1d1d' : '#fee2e2'}`,
                                      background: isDark ? 'rgba(239, 68, 68, 0.15)' : '#fef2f2',
                                      color: '#ef4444',
                                      width: '26px',
                                      height: '26px',
                                      borderRadius: '6px',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      padding: 0,
                                      transition: 'all 0.15s ease',
                                    }}
                                  >
                                    <TrashIcon size={13} color="#ef4444" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Action buttons (Rename & Delete) — hidden while editing */}
                    {!isEditing && (
                      <div className="arcable-device-actions-desktop" style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                        {/* Only allow renaming the current device */}
                        {isCurrent && (
                          <button
                            type="button"
                            onClick={() => handleStartRename(device)}
                            disabled={isBusy}
                            title="Rename Current Device"
                            style={{
                              border: `1px solid ${isDark ? '#475569' : '#e2e8f0'}`,
                              background: isDark ? '#1e293b' : '#f8fafc',
                              color: isDark ? '#cbd5e1' : '#475569',
                              width: '28px',
                              height: '28px',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: 0,
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <EditIcon size={14} color={isDark ? '#cbd5e1' : '#475569'} />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setConfirmDeleteDevice(device)}
                          disabled={isBusy}
                          title="Delete"
                          style={{
                            border: `1px solid ${isDark ? '#7f1d1d' : '#fee2e2'}`,
                            background: isDark ? 'rgba(239, 68, 68, 0.15)' : '#fef2f2',
                            color: '#ef4444',
                            width: '28px',
                            height: '28px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0,
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <TrashIcon size={14} color="#ef4444" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '18px',
            borderTop: `1px solid ${isDark ? '#334155' : '#f1f5f9'}`,
            paddingTop: '14px',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '12px', color: isDark ? '#64748b' : '#94a3b8' }}>
              {sortedDevices.length} registered device{sortedDevices.length === 1 ? '' : 's'}
            </span>

            {sortedDevices.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setConfirmDeleteDevice(null);
                  setConfirmDeleteOtherDevices(true);
                }}
                disabled={actionInProgressId !== null}
                style={{
                  color: '#ef4444',
                  fontSize: '12px',
                  padding: '4px 8px',
                  height: 'auto',
                }}
              >
                Delete all but this
              </Button>
            )}
          </div>

          <Button variant="secondary" size="md" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
    </>
  );
};
