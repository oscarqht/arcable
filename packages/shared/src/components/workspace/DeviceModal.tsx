'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { DeviceSyncRecord } from '../../types/sync';
import { getOrCreateDeviceId, getStoredDeviceName } from '../../utils/syncEngine';
import {
  fetchRaindropDevices,
  renameRaindropDevice,
  deleteRaindropDevice,
  deleteAllOtherRaindropDevices,
} from '../../utils/raindropSync';
import { Button } from '../Button';
import { Badge } from '../Badge';
import {
  DevicesIcon,
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
  const [devices, setDevices] = useState<DeviceSyncRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Active editing device state
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);

  // Confirm delete device state
  const [confirmDeleteDevice, setConfirmDeleteDevice] = useState<DeviceSyncRecord | null>(null);
  // Confirm delete all other devices state
  const [confirmDeleteOtherDevices, setConfirmDeleteOtherDevices] = useState(false);

  const effectiveCurrentDeviceId = currentDeviceId || (typeof window !== 'undefined' ? getOrCreateDeviceId() : '');

  const loadDevices = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setErrorMessage(null);
    }

    try {
      if (onFetchDevices) {
        const fetched = await onFetchDevices();
        if (Array.isArray(fetched)) {
          setDevices(fetched);
        }
      } else if (raindropToken) {
        const res = await fetchRaindropDevices(raindropToken, effectiveCurrentDeviceId);
        if (res.success && res.devices) {
          setDevices(res.devices);
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

  const handleStartRename = (device: DeviceSyncRecord) => {
    setEditingDeviceId(device.deviceId);
    setEditNameValue(device.deviceName || '');
    setConfirmDeleteDevice(null);
    setConfirmDeleteOtherDevices(false);
  };

  const handleCancelRename = () => {
    setEditingDeviceId(null);
    setEditNameValue('');
  };

  const handleSaveRename = async (deviceId: string) => {
    const trimmed = editNameValue.trim();
    if (!trimmed) return;

    setActionInProgressId(deviceId);
    setErrorMessage(null);
    try {
      if (onRenameDevice) {
        const updated = await onRenameDevice(deviceId, trimmed);
        if (Array.isArray(updated)) {
          setDevices(updated);
        } else {
          await loadDevices(true);
        }
      } else if (raindropToken) {
        const res = await renameRaindropDevice(raindropToken, deviceId, trimmed);
        if (res.success && res.devices) {
          setDevices(res.devices);
        } else {
          throw new Error(res.error || 'Failed to rename device');
        }
      }

      setSuccessMessage('Device renamed successfully.');
      setTimeout(() => setSuccessMessage(null), 3000);
      setEditingDeviceId(null);
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
          setDevices(updated);
        } else {
          await loadDevices(true);
        }
      } else if (raindropToken) {
        const res = await deleteRaindropDevice(raindropToken, deviceId);
        if (res.success && res.devices) {
          setDevices(res.devices);
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
          setDevices(updated);
        } else {
          await loadDevices(true);
        }
      } else if (raindropToken) {
        const res = await deleteAllOtherRaindropDevices(raindropToken, effectiveCurrentDeviceId);
        if (res.success && res.devices) {
          setDevices(res.devices);
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
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: '24px',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #e2e8f0',
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
            borderBottom: '1px solid #f1f5f9',
            paddingBottom: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                backgroundColor: '#e0f2fe',
                color: '#0284c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <DevicesIcon size={20} color="#0284c7" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                Device Management
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                Synced clients in Raindrop <code style={{ fontSize: '11px', color: '#0284c7' }}>data.json</code>
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
                border: '1px solid #e2e8f0',
                background: '#f8fafc',
                color: '#64748b',
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
                <RefreshIcon size={14} color="#64748b" />
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
                color: '#94a3b8',
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
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              color: '#b91c1c',
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
              style={{ border: 'none', background: 'none', color: '#b91c1c', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        )}

        {successMessage && (
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '8px',
              color: '#15803d',
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
              backgroundColor: '#fff1f2',
              border: '1px solid #fecdd3',
              borderRadius: '10px',
              marginBottom: '14px',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#9f1239', marginBottom: '4px' }}>
              Confirm Device Removal
            </div>
            <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#be123c', lineHeight: 1.4 }}>
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
              backgroundColor: '#fff1f2',
              border: '1px solid #fecdd3',
              borderRadius: '10px',
              marginBottom: '14px',
            }}
          >
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#9f1239', marginBottom: '4px' }}>
              Confirm Remove All Other Devices
            </div>
            <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#be123c', lineHeight: 1.4 }}>
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
          {loading && devices.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b', fontSize: '13px' }}>
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  border: '2px solid #e2e8f0',
                  borderTopColor: '#0284c7',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                  margin: '0 auto 10px',
                }}
              />
              Loading devices from Raindrop...
            </div>
          ) : devices.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '36px 16px',
                backgroundColor: '#f8fafc',
                borderRadius: '12px',
                border: '1px dashed #cbd5e1',
                color: '#64748b',
              }}
            >
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>💻</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#334155' }}>No Devices Found</div>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                Run a Raindrop sync to register this device into the workspace.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {devices.map((device) => {
                const isCurrent = device.deviceId === effectiveCurrentDeviceId;
                const isEditing = editingDeviceId === device.deviceId;
                const isBusy = actionInProgressId === device.deviceId;

                return (
                  <div
                    key={device.deviceId}
                    style={{
                      padding: '12px 14px',
                      backgroundColor: isCurrent ? '#f0fdf4' : '#ffffff',
                      border: isCurrent ? '1.5px solid #86efac' : '1px solid #e2e8f0',
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      transition: 'all 0.15s ease',
                      boxShadow: isCurrent ? '0 2px 4px rgba(22, 163, 74, 0.05)' : 'none',
                    }}
                  >
                    {/* Device icon & Info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          width: '34px',
                          height: '34px',
                          borderRadius: '8px',
                          backgroundColor: isCurrent ? '#dcfce7' : '#f1f5f9',
                          color: isCurrent ? '#16a34a' : '#64748b',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <LaptopIcon size={18} color={isCurrent ? '#16a34a' : '#64748b'} />
                      </div>

                      <div style={{ minWidth: 0, flex: 1 }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                              style={{
                                width: '100%',
                                padding: '4px 8px',
                                fontSize: '13px',
                                borderRadius: '6px',
                                border: '1.5px solid #0284c7',
                                outline: 'none',
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => void handleSaveRename(device.deviceId)}
                              disabled={isBusy || !editNameValue.trim()}
                              title="Save name"
                              style={{
                                border: 'none',
                                background: '#0284c7',
                                color: '#ffffff',
                                width: '26px',
                                height: '26px',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}
                            >
                              <CheckIcon size={14} color="#ffffff" />
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelRename}
                              disabled={isBusy}
                              title="Cancel"
                              style={{
                                border: '1px solid #cbd5e1',
                                background: '#f8fafc',
                                color: '#64748b',
                                width: '26px',
                                height: '26px',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}
                            >
                              <CloseIcon size={14} />
                            </button>
                          </div>
                        ) : (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span
                                style={{
                                  fontSize: '13px',
                                  fontWeight: 600,
                                  color: '#0f172a',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {device.deviceName || 'Unnamed Device'}
                              </span>

                              {isCurrent && (
                                <Badge variant="success">Current</Badge>
                              )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                              <span
                                style={{
                                  fontFamily: 'monospace',
                                  fontSize: '11px',
                                  color: '#94a3b8',
                                }}
                                title={device.deviceId}
                              >
                                {device.deviceId.length > 20
                                  ? `${device.deviceId.substring(0, 16)}...`
                                  : device.deviceId}
                              </span>
                              <span style={{ fontSize: '11px', color: '#cbd5e1' }}>•</span>
                              <span style={{ fontSize: '11px', color: '#64748b' }}>
                                {formatSyncTime(device.lastSyncAt)}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Action buttons (Rename & Delete) */}
                    {!isEditing && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => handleStartRename(device)}
                          disabled={isBusy}
                          title="Rename Device"
                          style={{
                            border: '1px solid #e2e8f0',
                            background: '#f8fafc',
                            color: '#475569',
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
                          <EditIcon size={14} color="#475569" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setConfirmDeleteDevice(device)}
                          disabled={isBusy}
                          title="Delete Device"
                          style={{
                            border: '1px solid #fee2e2',
                            background: '#fef2f2',
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
            borderTop: '1px solid #f1f5f9',
            paddingTop: '14px',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>
              {devices.length} registered device{devices.length === 1 ? '' : 's'}
            </span>

            {devices.length > 1 && (
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
  );
};
