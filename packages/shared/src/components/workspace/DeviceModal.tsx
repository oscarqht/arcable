'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { DeviceRecordWithTabs } from '../../types/sync';
import { TmpTab } from '../../types/workspace';
import {
  getOrCreateDeviceId,
  getStoredDeviceName,
  setStoredDeviceName,
} from '../../utils/syncEngine';
import {
  fetchDevicesWithTmpTabs,
  renameRaindropDevice,
  deleteRaindropDevice,
} from '../../utils/raindropSync';
import { useSystemTheme } from '../../hooks/useSystemTheme';
import {
  LaptopIcon,
  EditIcon,
  TrashIcon,
  CheckIcon,
  CloseIcon,
  RefreshIcon,
} from '../Icons';

export interface DeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  raindropToken?: string;
  currentDeviceId?: string;
  currentDeviceName?: string;
  onFetchDevices?: () => Promise<DeviceRecordWithTabs[]>;
  onRenameDevice?: (deviceId: string, newName: string) => Promise<DeviceRecordWithTabs[] | void>;
  onDeleteDevice?: (deviceId: string) => Promise<DeviceRecordWithTabs[] | void>;
  onOpenTmpTab?: (url: string, title?: string, activate?: boolean) => void;
  onOpenAllTmpTabs?: (tabs: Array<{ url: string; title?: string }>) => void;
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

export const DeviceModal: React.FC<DeviceModalProps> = ({
  isOpen,
  onClose,
  raindropToken,
  currentDeviceId: propCurrentDeviceId,
  currentDeviceName: propCurrentDeviceName,
  onFetchDevices,
  onRenameDevice,
  onDeleteDevice,
  onOpenTmpTab,
  onOpenAllTmpTabs,
}) => {
  const { isDark } = useSystemTheme();
  const [devices, setDevices] = useState<DeviceRecordWithTabs[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Rename state
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [savingRename, setSavingRename] = useState(false);

  // Deleting state
  const [deletingDeviceId, setDeletingDeviceId] = useState<string | null>(null);

  // Opened tabs visual feedback (maps tabId/url -> timestamp)
  const [openedTabKeys, setOpenedTabKeys] = useState<Record<string, boolean>>({});
  const [openedAllDeviceId, setOpenedAllDeviceId] = useState<string | null>(null);

  const effectiveCurrentDeviceId = propCurrentDeviceId || getOrCreateDeviceId();
  const effectiveCurrentDeviceName = propCurrentDeviceName || getStoredDeviceName();

  const loadDevices = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      if (onFetchDevices) {
        const fetched = await onFetchDevices();
        setDevices(fetched);
      } else if (raindropToken) {
        const res = await fetchDevicesWithTmpTabs(raindropToken, effectiveCurrentDeviceId);
        if (res.success) {
          setDevices(res.devices);
        } else {
          setErrorMessage(res.error || 'Failed to fetch devices');
        }
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error loading devices');
    } finally {
      setLoading(false);
    }
  }, [onFetchDevices, raindropToken, effectiveCurrentDeviceId]);

  useEffect(() => {
    if (isOpen) {
      void loadDevices();
    } else {
      setEditingDeviceId(null);
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [isOpen, loadDevices]);

  const handleStartRename = (device: DeviceRecordWithTabs) => {
    setEditingDeviceId(device.deviceId);
    setEditNameValue(device.deviceName || '');
  };

  const handleCancelRename = () => {
    setEditingDeviceId(null);
    setEditNameValue('');
  };

  const handleSaveRename = async (device: DeviceRecordWithTabs) => {
    const trimmed = editNameValue.trim();
    if (!trimmed || trimmed === device.deviceName) {
      handleCancelRename();
      return;
    }

    setSavingRename(true);
    setErrorMessage(null);
    try {
      if (onRenameDevice) {
        const updated = await onRenameDevice(device.deviceId, trimmed);
        if (Array.isArray(updated)) setDevices(updated);
        else await loadDevices();
      } else if (raindropToken) {
        const res = await renameRaindropDevice(raindropToken, device.deviceId, trimmed);
        if (res.success) {
          setDevices(res.devices);
          setStoredDeviceName(trimmed);
        } else {
          setErrorMessage(res.error || 'Failed to rename device');
        }
      }
      setEditingDeviceId(null);
      setSuccessMessage(`Device renamed to "${trimmed}"`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to rename device');
    } finally {
      setSavingRename(false);
    }
  };

  const handleDeleteDevice = async (device: DeviceRecordWithTabs) => {
    if (!window.confirm(`Are you sure you want to remove "${device.deviceName || 'this device'}" and all its synced tmp tabs?`)) {
      return;
    }

    setDeletingDeviceId(device.deviceId);
    setErrorMessage(null);
    try {
      if (onDeleteDevice) {
        const updated = await onDeleteDevice(device.deviceId);
        if (Array.isArray(updated)) setDevices(updated);
        else await loadDevices();
      } else if (raindropToken) {
        const res = await deleteRaindropDevice(raindropToken, device.deviceId);
        if (res.success) {
          setDevices(res.devices);
        } else {
          setErrorMessage(res.error || 'Failed to delete device');
        }
      }
      setSuccessMessage(`Device "${device.deviceName}" removed`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to delete device');
    } finally {
      setDeletingDeviceId(null);
    }
  };

  const handleOpenTab = (tab: TmpTab) => {
    if (!tab.url) return;
    onOpenTmpTab?.(tab.url, tab.customTitle || tab.title, true);
    
    // Mark as opened for 2 seconds
    const key = tab.id || tab.url;
    setOpenedTabKeys((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => {
      setOpenedTabKeys((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }, 2000);
  };

  const handleOpenAllTabs = (device: DeviceRecordWithTabs) => {
    if (!device.tabs || device.tabs.length === 0) return;

    if (onOpenAllTmpTabs) {
      onOpenAllTmpTabs(device.tabs.map((t) => ({ url: t.url, title: t.customTitle || t.title })));
    } else if (onOpenTmpTab) {
      device.tabs.forEach((t) => {
        onOpenTmpTab(t.url, t.customTitle || t.title, false);
      });
    }

    setOpenedAllDeviceId(device.deviceId);
    setTimeout(() => setOpenedAllDeviceId(null), 2500);
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="device-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(3px)',
        padding: '16px',
        boxSizing: 'border-box',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '16px',
          background: isDark ? '#1e293b' : '#ffffff',
          color: isDark ? '#f8fafc' : '#0f172a',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
          border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: isDark ? 'rgba(56, 189, 248, 0.15)' : 'rgba(2, 132, 199, 0.1)',
                color: isDark ? '#38bdf8' : '#0284c7',
              }}
            >
              <LaptopIcon size={18} />
            </div>
            <div>
              <h2
                id="device-modal-title"
                style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  margin: 0,
                  lineHeight: '20px',
                }}
              >
                Devices & Synced Tmp Tabs
              </h2>
              <p
                style={{
                  fontSize: '12px',
                  margin: 0,
                  color: isDark ? '#94a3b8' : '#64748b',
                }}
              >
                Browse temporary tabs open on other synced devices
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={() => void loadDevices()}
              disabled={loading}
              title="Refresh devices and tabs"
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                border: 'none',
                background: 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isDark ? '#94a3b8' : '#64748b',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  animation: loading ? 'arcable-spin 1s linear infinite' : 'none',
                }}
              >
                <RefreshIcon size={15} />
              </span>
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Close modal"
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                border: 'none',
                background: 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isDark ? '#94a3b8' : '#64748b',
                cursor: 'pointer',
              }}
            >
              <CloseIcon size={16} />
            </button>
          </div>
        </div>

        {/* Alerts */}
        {errorMessage && (
          <div
            style={{
              padding: '10px 16px',
              fontSize: '12px',
              background: isDark ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2',
              color: isDark ? '#fca5a5' : '#b91c1c',
              borderBottom: isDark ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid #fecaca',
            }}
          >
            {errorMessage}
          </div>
        )}
        {successMessage && (
          <div
            style={{
              padding: '10px 16px',
              fontSize: '12px',
              background: isDark ? 'rgba(34, 197, 94, 0.2)' : '#dcfce7',
              color: isDark ? '#86efac' : '#15803d',
              borderBottom: isDark ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid #bbf7d0',
            }}
          >
            {successMessage}
          </div>
        )}

        {/* Content list */}
        <div
          style={{
            padding: '16px',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          {loading && devices.length === 0 ? (
            <div
              style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: isDark ? '#94a3b8' : '#64748b',
                fontSize: '13px',
              }}
            >
              <div
                style={{
                  display: 'inline-block',
                  animation: 'arcable-spin 1s linear infinite',
                  marginBottom: '10px',
                }}
              >
                <RefreshIcon size={24} />
              </div>
              <div>Loading devices and synced tabs...</div>
            </div>
          ) : devices.length === 0 ? (
            <div
              style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: isDark ? '#94a3b8' : '#64748b',
                fontSize: '13px',
              }}
            >
              <LaptopIcon size={32} style={{ opacity: 0.5, marginBottom: '8px' }} />
              <div>No devices synced yet.</div>
              <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.8 }}>
                Temporary tabs are synced to Raindrop every minute automatically.
              </div>
            </div>
          ) : (
            devices.map((device) => {
              const isCurrent = Boolean(
                device.isCurrent ||
                device.deviceId === effectiveCurrentDeviceId ||
                device.deviceName?.toLowerCase() === effectiveCurrentDeviceName?.toLowerCase()
              );
              const isEditing = editingDeviceId === device.deviceId;
              const isDeleting = deletingDeviceId === device.deviceId;
              const isAllOpened = openedAllDeviceId === device.deviceId;

              return (
                <div
                  key={device.deviceId || device.collectionId}
                  style={{
                    borderRadius: '12px',
                    border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
                    background: isDark ? '#0f172a' : '#f8fafc',
                    overflow: 'hidden',
                  }}
                >
                  {/* Device Header */}
                  <div
                    style={{
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderBottom: isDark ? '1px solid #1e293b' : '1px solid #e2e8f0',
                      background: isDark ? 'rgba(30, 41, 59, 0.4)' : '#ffffff',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                      <LaptopIcon size={16} color={isDark ? '#94a3b8' : '#64748b'} />
                      
                      {isEditing ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, maxWidth: '280px' }}>
                          <input
                            type="text"
                            value={editNameValue}
                            onChange={(e) => setEditNameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void handleSaveRename(device);
                              if (e.key === 'Escape') handleCancelRename();
                            }}
                            autoFocus
                            disabled={savingRename}
                            style={{
                              flex: 1,
                              fontSize: '13px',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              border: isDark ? '1px solid #475569' : '1px solid #cbd5e1',
                              background: isDark ? '#1e293b' : '#ffffff',
                              color: 'inherit',
                              outline: 'none',
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => void handleSaveRename(device)}
                            disabled={savingRename}
                            style={{
                              padding: '3px 8px',
                              fontSize: '11px',
                              borderRadius: '6px',
                              border: 'none',
                              background: '#0284c7',
                              color: '#ffffff',
                              cursor: 'pointer',
                              fontWeight: 500,
                            }}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelRename}
                            style={{
                              padding: '3px 6px',
                              fontSize: '11px',
                              borderRadius: '6px',
                              border: 'none',
                              background: 'transparent',
                              color: isDark ? '#94a3b8' : '#64748b',
                              cursor: 'pointer',
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                          <span
                            style={{
                              fontWeight: 600,
                              fontSize: '13px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {device.deviceName || 'Unnamed Device'}
                          </span>
                          {isCurrent && (
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 600,
                                padding: '1px 6px',
                                borderRadius: '9999px',
                                background: isDark ? 'rgba(56, 189, 248, 0.2)' : '#e0f2fe',
                                color: isDark ? '#38bdf8' : '#0284c7',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                              }}
                            >
                              This Device
                            </span>
                          )}
                          <span
                            style={{
                              fontSize: '11px',
                              color: isDark ? '#64748b' : '#94a3b8',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            • {formatSyncTime(device.lastSyncAt)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      {device.tabs && device.tabs.length > 0 && (
                        <button
                          type="button"
                          onClick={() => handleOpenAllTabs(device)}
                          title="Open all tabs from this device in current browser"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 9px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 500,
                            border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                            background: isAllOpened
                              ? (isDark ? 'rgba(34, 197, 94, 0.2)' : '#dcfce7')
                              : (isDark ? '#1e293b' : '#ffffff'),
                            color: isAllOpened
                              ? (isDark ? '#86efac' : '#15803d')
                              : (isDark ? '#cbd5e1' : '#334155'),
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {isAllOpened ? (
                            <>
                              <CheckIcon size={12} />
                              <span>Opened All</span>
                            </>
                          ) : (
                            <span>Open All ({device.tabs.length})</span>
                          )}
                        </button>
                      )}

                      {isCurrent ? (
                        !isEditing && (
                          <button
                            type="button"
                            onClick={() => handleStartRename(device)}
                            title="Rename device"
                            style={{
                              width: '26px',
                              height: '26px',
                              borderRadius: '6px',
                              border: 'none',
                              background: 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: isDark ? '#94a3b8' : '#64748b',
                              cursor: 'pointer',
                            }}
                          >
                            <EditIcon size={13} />
                          </button>
                        )
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleDeleteDevice(device)}
                          disabled={isDeleting}
                          title="Delete this device and its synced tabs"
                          style={{
                            width: '26px',
                            height: '26px',
                            borderRadius: '6px',
                            border: 'none',
                            background: 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: isDark ? '#94a3b8' : '#64748b',
                            cursor: isDeleting ? 'not-allowed' : 'pointer',
                          }}
                        >
                          <TrashIcon size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Tabs List */}
                  <div style={{ padding: '6px' }}>
                    {!device.tabs || device.tabs.length === 0 ? (
                      <div
                        style={{
                          padding: '12px',
                          textAlign: 'center',
                          fontSize: '12px',
                          color: isDark ? '#64748b' : '#94a3b8',
                        }}
                      >
                        No temporary tabs open on this device
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {device.tabs.map((tab) => {
                          const tabKey = tab.id || tab.url;
                          const isOpened = Boolean(openedTabKeys[tabKey]);
                          let hostname = '';
                          try {
                            hostname = new URL(tab.url).hostname;
                          } catch {
                            hostname = tab.url;
                          }

                          return (
                            <div
                              key={tabKey}
                              onClick={() => handleOpenTab(tab)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '8px',
                                padding: '6px 10px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                transition: 'background 0.12s ease',
                                background: isOpened
                                  ? (isDark ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.1)')
                                  : 'transparent',
                              }}
                              onMouseEnter={(e) => {
                                if (!isOpened) {
                                  e.currentTarget.style.background = isDark ? 'rgba(51, 65, 85, 0.6)' : 'rgba(226, 232, 240, 0.7)';
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (!isOpened) {
                                  e.currentTarget.style.background = 'transparent';
                                }
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  flex: 1,
                                  minWidth: 0,
                                }}
                              >
                                {tab.favIconUrl ? (
                                  <img
                                    src={tab.favIconUrl}
                                    alt=""
                                    style={{
                                      width: '15px',
                                      height: '15px',
                                      borderRadius: '3px',
                                      flexShrink: 0,
                                      objectFit: 'contain',
                                    }}
                                    onError={(e) => {
                                      // Fallback on broken favicon
                                      e.currentTarget.style.display = 'none';
                                    }}
                                  />
                                ) : (
                                  <div
                                    style={{
                                      width: '15px',
                                      height: '15px',
                                      borderRadius: '3px',
                                      background: isDark ? '#334155' : '#e2e8f0',
                                      flexShrink: 0,
                                    }}
                                  />
                                )}

                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div
                                    style={{
                                      fontSize: '12px',
                                      fontWeight: 500,
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      color: isDark ? '#e2e8f0' : '#1e293b',
                                    }}
                                  >
                                    {tab.customTitle || tab.title || tab.url}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: '10px',
                                      color: isDark ? '#64748b' : '#94a3b8',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {hostname}
                                  </div>
                                </div>
                              </div>

                              <div style={{ flexShrink: 0 }}>
                                {isOpened ? (
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                      fontSize: '11px',
                                      fontWeight: 500,
                                      color: isDark ? '#86efac' : '#15803d',
                                    }}
                                  >
                                    <CheckIcon size={12} />
                                    <span>Opened</span>
                                  </span>
                                ) : (
                                  <span
                                    style={{
                                      fontSize: '11px',
                                      fontWeight: 500,
                                      padding: '2px 7px',
                                      borderRadius: '5px',
                                      background: isDark ? '#1e293b' : '#e2e8f0',
                                      color: isDark ? '#94a3b8' : '#475569',
                                    }}
                                  >
                                    Open
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
