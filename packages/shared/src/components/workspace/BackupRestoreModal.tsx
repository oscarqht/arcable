'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArcableWorkspaceData } from '../../types/workspace';
import { RaindropBackupRecord } from '../../types/raindrop';
import {
  getStoredDeviceName,
  detectDeviceType,
} from '../../utils/syncEngine';
import {
  createRaindropBackup,
  fetchRaindropBackups,
  restoreRaindropBackup,
} from '../../utils/raindropSync';
import { Badge } from '../Badge';
import { useSystemTheme } from '../../hooks/useSystemTheme';
import {
  CloseIcon,
  RefreshIcon,
  CheckIcon,
} from '../Icons';

export interface BackupRestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  raindropToken?: string;
  currentWorkspaceData?: ArcableWorkspaceData;
  onBackup?: () => Promise<{ success: boolean; fileName?: string; error?: string }>;
  onFetchBackups?: () => Promise<RaindropBackupRecord[]>;
  onRestoreBackup?: (backupId: number) => Promise<{ success: boolean; restoredSnapshot?: ArcableWorkspaceData; error?: string }>;
  onRestoreComplete?: (restoredSnapshot: ArcableWorkspaceData) => void;
}

export const BackupRestoreModal: React.FC<BackupRestoreModalProps> = ({
  isOpen,
  onClose,
  raindropToken,
  currentWorkspaceData,
  onBackup,
  onFetchBackups,
  onRestoreBackup,
  onRestoreComplete,
}) => {
  const { isDark } = useSystemTheme();

  // Callback Refs to prevent infinite reload loops caused by unstable prop references
  const onFetchBackupsRef = useRef(onFetchBackups);
  onFetchBackupsRef.current = onFetchBackups;

  const onBackupRef = useRef(onBackup);
  onBackupRef.current = onBackup;

  const onRestoreBackupRef = useRef(onRestoreBackup);
  onRestoreBackupRef.current = onRestoreBackup;

  const onRestoreCompleteRef = useRef(onRestoreComplete);
  onRestoreCompleteRef.current = onRestoreComplete;

  const currentWorkspaceDataRef = useRef(currentWorkspaceData);
  currentWorkspaceDataRef.current = currentWorkspaceData;

  // State
  const [backups, setBackups] = useState<RaindropBackupRecord[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupSuccessMsg, setBackupSuccessMsg] = useState<string | null>(null);
  const [backupErrorMsg, setBackupErrorMsg] = useState<string | null>(null);

  // Restore Confirmation State
  const [selectedBackup, setSelectedBackup] = useState<RaindropBackupRecord | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreErrorMsg, setRestoreErrorMsg] = useState<string | null>(null);
  const [restoreSuccessMsg, setRestoreSuccessMsg] = useState<string | null>(null);

  const deviceType = detectDeviceType();
  const currentDeviceName = getStoredDeviceName(undefined, deviceType);

  // Fetch Backups function
  const loadBackups = useCallback(async () => {
    setIsLoadingBackups(true);
    setRestoreErrorMsg(null);
    try {
      if (onFetchBackupsRef.current) {
        const list = await onFetchBackupsRef.current();
        setBackups(list || []);
      } else if (raindropToken) {
        const res = await fetchRaindropBackups(raindropToken);
        if (res.success) {
          setBackups(res.backups || []);
        } else {
          setRestoreErrorMsg(res.error || 'Failed to load backups.');
        }
      }
    } catch (err: any) {
      console.error('Error loading backups:', err);
      setRestoreErrorMsg(err?.message || 'Failed to load backups.');
    } finally {
      setIsLoadingBackups(false);
    }
  }, [raindropToken]);

  // Load backups only when modal opens
  useEffect(() => {
    if (isOpen) {
      setBackupSuccessMsg(null);
      setBackupErrorMsg(null);
      setRestoreErrorMsg(null);
      setRestoreSuccessMsg(null);
      setSelectedBackup(null);
      void loadBackups();
    }
  }, [isOpen, loadBackups]);

  // Handle Backup Creation
  const handleCreateBackup = async () => {
    if (isBackingUp) return;
    setIsBackingUp(true);
    setBackupSuccessMsg(null);
    setBackupErrorMsg(null);

    try {
      if (onBackupRef.current) {
        const res = await onBackupRef.current();
        if (res.success) {
          setBackupSuccessMsg(`Backup created successfully: ${res.fileName || 'backup.json.txt'}`);
          void loadBackups();
        } else {
          setBackupErrorMsg(res.error || 'Failed to create backup.');
        }
      } else if (raindropToken) {
        let wsData = currentWorkspaceDataRef.current;
        if (!wsData && typeof window !== 'undefined') {
          const raw = window.localStorage.getItem('arcable_workspace_data');
          if (raw) {
            try {
              wsData = JSON.parse(raw);
            } catch {}
          }
        }
        if (!wsData) {
          wsData = {
            activeSpaceId: 'space_personal',
            version: 1,
            spaces: [],
            folders: [],
            tabs: [],
          };
        }

        const res = await createRaindropBackup(raindropToken, {
          workspaceData: wsData,
          deviceName: currentDeviceName,
          deviceType,
        });

        if (res.success) {
          setBackupSuccessMsg(`Backup created successfully: ${res.fileName}`);
          void loadBackups();
        } else {
          setBackupErrorMsg(res.error || 'Failed to create backup.');
        }
      } else {
        setBackupErrorMsg('Raindrop token is not configured or missing.');
      }
    } catch (err: any) {
      console.error('Error creating backup:', err);
      setBackupErrorMsg(err?.message || 'Failed to create backup.');
    } finally {
      setIsBackingUp(false);
    }
  };

  // Handle Restore Confirmation
  const handleConfirmRestore = async () => {
    if (!selectedBackup || isRestoring) return;
    setIsRestoring(true);
    setRestoreErrorMsg(null);
    setRestoreSuccessMsg(null);

    try {
      if (onRestoreBackupRef.current) {
        const res = await onRestoreBackupRef.current(selectedBackup.id);
        if (res.success && res.restoredSnapshot) {
          setRestoreSuccessMsg(`Workspace restored successfully from ${selectedBackup.fileName}`);
          onRestoreCompleteRef.current?.(res.restoredSnapshot);
          setTimeout(() => {
            setSelectedBackup(null);
            onClose();
          }, 1200);
        } else {
          setRestoreErrorMsg(res.error || 'Failed to restore backup.');
        }
      } else if (raindropToken) {
        const res = await restoreRaindropBackup(raindropToken, selectedBackup.id, {
          deviceName: currentDeviceName,
        });
        if (res.success && res.restoredSnapshot) {
          setRestoreSuccessMsg(`Workspace restored successfully from ${selectedBackup.fileName}`);
          onRestoreCompleteRef.current?.(res.restoredSnapshot);
          setTimeout(() => {
            setSelectedBackup(null);
            onClose();
          }, 1200);
        } else {
          setRestoreErrorMsg(res.error || 'Failed to restore backup.');
        }
      } else {
        setRestoreErrorMsg('Raindrop token is not configured.');
      }
    } catch (err: any) {
      console.error('Error restoring backup:', err);
      setRestoreErrorMsg(err?.message || 'Failed to restore backup.');
    } finally {
      setIsRestoring(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(3px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        boxSizing: 'border-box',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isRestoring && !isBackingUp) {
          onClose();
        }
      }}
    >
      <div
        style={{
          backgroundColor: isDark ? '#151e2e' : '#ffffff',
          borderRadius: '16px',
          border: `1px solid ${isDark ? '#243247' : '#e2e8f0'}`,
          boxShadow: isDark
            ? '0 20px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.5)'
            : '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
          maxWidth: '560px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'arcable-modal-fade 0.18s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`
          @keyframes arcable-modal-fade {
            from { opacity: 0; transform: scale(0.97); }
            to { opacity: 1; transform: scale(1); }
          }
          @keyframes arcable-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          .arcable-backup-card {
            display: flex;
            flex-direction: column;
            gap: 10px;
          }
          .arcable-backup-card-top {
            display: flex;
            align-items: center;
            justifyContent: space-between;
            gap: 8px;
            flex-wrap: wrap;
          }
          .arcable-backup-btn-row {
            display: flex;
            align-items: center;
            justifyContent: flex-end;
          }
          @media (max-width: 480px) {
            .arcable-backup-card-top {
              flex-direction: column;
              align-items: flex-start;
              gap: 6px;
            }
            .arcable-backup-btn-row {
              width: 100%;
            }
            .arcable-backup-btn-row button {
              width: 100%;
              justify-content: center;
            }
          }
        `}</style>

        {/* Modal Header */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: `1px solid ${isDark ? '#243247' : '#e2e8f0'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: isDark ? 'rgba(56, 189, 248, 0.15)' : '#e0f2fe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isDark ? '#38bdf8' : '#0284c7',
                fontSize: '16px',
                flexShrink: 0,
              }}
            >
              💾
            </div>
            <div style={{ minWidth: 0 }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: '15px',
                  fontWeight: 700,
                  color: isDark ? '#f8fafc' : '#0f172a',
                  letterSpacing: '-0.01em',
                  lineHeight: 1.2,
                }}
              >
                Backup & Restore
              </h2>
              <p
                style={{
                  margin: '2px 0 0 0',
                  fontSize: '11px',
                  color: isDark ? '#94a3b8' : '#64748b',
                  lineHeight: 1.3,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                Save snapshots to "Arcable" collection in Raindrop
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isRestoring || isBackingUp}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: isRestoring || isBackingUp ? 'not-allowed' : 'pointer',
              color: isDark ? '#94a3b8' : '#64748b',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'background 0.15s ease',
            }}
            title="Close"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div
          style={{
            padding: '16px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* Section 1: Backup */}
          <div
            className="arcable-backup-card"
            style={{
              padding: '14px',
              borderRadius: '12px',
              backgroundColor: isDark ? '#0e1522' : '#f8fafc',
              border: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
            }}
          >
            <div className="arcable-backup-card-top">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: isDark ? '#f1f5f9' : '#1e293b', lineHeight: 1.2 }}>
                  Create Manual Backup
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11px', color: isDark ? '#94a3b8' : '#64748b' }}>Device:</span>
                  <Badge variant="info">
                    {currentDeviceName}
                  </Badge>
                </div>
              </div>

              <div className="arcable-backup-btn-row">
                <button
                  type="button"
                  onClick={handleCreateBackup}
                  disabled={isBackingUp || isRestoring}
                  style={{
                    border: 'none',
                    backgroundColor: isDark ? '#38bdf8' : '#0284c7',
                    color: isDark ? '#0f172a' : '#ffffff',
                    fontSize: '12px',
                    fontWeight: 600,
                    padding: '7px 14px',
                    borderRadius: '8px',
                    cursor: isBackingUp || isRestoring ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    opacity: isBackingUp ? 0.75 : 1,
                    transition: 'opacity 0.15s ease',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isBackingUp ? (
                    <>
                      <span style={{ animation: 'arcable-spin 1s linear infinite', display: 'inline-flex' }}>
                        <RefreshIcon size={13} />
                      </span>
                      <span>Backing up...</span>
                    </>
                  ) : (
                    <>
                      <span>💾 Backup Now</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {backupSuccessMsg && (
              <div
                style={{
                  fontSize: '11px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  backgroundColor: isDark ? 'rgba(34, 197, 94, 0.15)' : '#dcfce7',
                  color: isDark ? '#4ade80' : '#15803d',
                  border: `1px solid ${isDark ? 'rgba(34, 197, 94, 0.3)' : '#bbf7d0'}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  wordBreak: 'break-all',
                }}
              >
                <CheckIcon size={13} />
                <span>{backupSuccessMsg}</span>
              </div>
            )}

            {backupErrorMsg && (
              <div
                style={{
                  fontSize: '11px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#fee2e2',
                  color: isDark ? '#f87171' : '#b91c1c',
                  border: `1px solid ${isDark ? 'rgba(239, 68, 68, 0.3)' : '#fecaca'}`,
                }}
              >
                {backupErrorMsg}
              </div>
            )}
          </div>

          {/* Section 2: Restore List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
                <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: isDark ? '#f1f5f9' : '#1e293b', lineHeight: 1.2 }}>
                  Available Backups
                </h3>
                <span style={{ fontSize: '11px', color: isDark ? '#64748b' : '#94a3b8' }}>
                  Top 10 most recent
                </span>
              </div>

              <button
                type="button"
                onClick={loadBackups}
                disabled={isLoadingBackups}
                style={{
                  background: 'transparent',
                  border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
                  color: isDark ? '#94a3b8' : '#64748b',
                  fontSize: '11px',
                  fontWeight: 500,
                  padding: '4px 8px',
                  borderRadius: '6px',
                  cursor: isLoadingBackups ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  flexShrink: 0,
                }}
                title="Refresh backups list"
              >
                <span style={{ animation: isLoadingBackups ? 'arcable-spin 1s linear infinite' : 'none', display: 'inline-flex' }}>
                  <RefreshIcon size={12} />
                </span>
                <span>Refresh</span>
              </button>
            </div>

            {restoreErrorMsg && (
              <div
                style={{
                  fontSize: '11px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#fee2e2',
                  color: isDark ? '#f87171' : '#b91c1c',
                  border: `1px solid ${isDark ? 'rgba(239, 68, 68, 0.3)' : '#fecaca'}`,
                }}
              >
                {restoreErrorMsg}
              </div>
            )}

            {restoreSuccessMsg && (
              <div
                style={{
                  fontSize: '11px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  backgroundColor: isDark ? 'rgba(34, 197, 94, 0.15)' : '#dcfce7',
                  color: isDark ? '#4ade80' : '#15803d',
                  border: `1px solid ${isDark ? 'rgba(34, 197, 94, 0.3)' : '#bbf7d0'}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  wordBreak: 'break-all',
                }}
              >
                <CheckIcon size={13} />
                <span>{restoreSuccessMsg}</span>
              </div>
            )}

            {isLoadingBackups ? (
              <div
                style={{
                  padding: '24px 16px',
                  textAlign: 'center',
                  color: isDark ? '#94a3b8' : '#64748b',
                  fontSize: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span style={{ animation: 'arcable-spin 1s linear infinite', display: 'inline-flex' }}>
                  <RefreshIcon size={18} />
                </span>
                <span>Loading backups from Raindrop...</span>
              </div>
            ) : backups.length === 0 ? (
              <div
                style={{
                  padding: '28px 16px',
                  textAlign: 'center',
                  borderRadius: '10px',
                  border: `1px dashed ${isDark ? '#334155' : '#cbd5e1'}`,
                  color: isDark ? '#94a3b8' : '#64748b',
                  fontSize: '12px',
                }}
              >
                <div style={{ fontSize: '22px', marginBottom: '6px' }}>📦</div>
                <div style={{ fontWeight: 500, color: isDark ? '#cbd5e1' : '#475569' }}>No backups found in your "Arcable" collection.</div>
                <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.8 }}>
                  Click "Backup Now" above to create your first snapshot.
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  maxHeight: '250px',
                  overflowY: 'auto',
                }}
              >
                {backups.map((bk, index) => (
                  <div
                    key={bk.id || index}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '10px',
                      backgroundColor: isDark ? '#0e1522' : '#f8fafc',
                      border: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                      transition: 'border-color 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1 }}>
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: isDark ? '#f8fafc' : '#0f172a',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={bk.fileName}
                      >
                        {bk.fileName}
                      </span>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '10.5px',
                          color: isDark ? '#94a3b8' : '#64748b',
                          flexWrap: 'wrap',
                        }}
                      >
                        <span>{bk.date || 'Unknown date'}</span>
                        <span>•</span>
                        <span>{bk.deviceName}</span>
                        {bk.size !== undefined && (
                          <>
                            <span>•</span>
                            <span>{Math.round(bk.size / 1024)} KB</span>
                          </>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setRestoreErrorMsg(null);
                        setRestoreSuccessMsg(null);
                        setSelectedBackup(bk);
                      }}
                      disabled={isRestoring || isBackingUp}
                      style={{
                        border: `1px solid ${isDark ? 'rgba(56, 189, 248, 0.4)' : '#bae6fd'}`,
                        backgroundColor: isDark ? 'rgba(56, 189, 248, 0.15)' : '#e0f2fe',
                        color: isDark ? '#38bdf8' : '#0284c7',
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '5px 10px',
                        borderRadius: '6px',
                        cursor: isRestoring || isBackingUp ? 'not-allowed' : 'pointer',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Confirmation Warning Modal / Overlay */}
        {selectedBackup && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: isDark ? 'rgba(15, 23, 42, 0.96)' : 'rgba(255, 255, 255, 0.97)',
              backdropFilter: 'blur(4px)',
              padding: '20px 16px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              textAlign: 'center',
              zIndex: 10000,
              animation: 'arcable-modal-fade 0.15s ease-out',
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2',
                color: isDark ? '#f87171' : '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
                marginBottom: '10px',
              }}
            >
              ⚠️
            </div>

            <h3
              style={{
                margin: '0 0 6px 0',
                fontSize: '16px',
                fontWeight: 700,
                color: isDark ? '#f8fafc' : '#0f172a',
              }}
            >
              Confirm Workspace Restore
            </h3>

            <p
              style={{
                margin: '0 0 12px 0',
                fontSize: '12px',
                lineHeight: '1.4',
                color: isDark ? '#cbd5e1' : '#475569',
                maxWidth: '380px',
              }}
            >
              Restoring will <strong style={{ color: isDark ? '#f87171' : '#dc2626' }}>override both local data and remote cloud data (data.json.txt)</strong> in your Raindrop "Arcable" collection.
            </p>

            <div
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                backgroundColor: isDark ? '#1e293b' : '#f1f5f9',
                border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                marginBottom: '16px',
                fontSize: '11px',
                color: isDark ? '#94a3b8' : '#64748b',
                maxWidth: '380px',
                width: '100%',
                boxSizing: 'border-box',
                textAlign: 'left',
                lineHeight: '1.4',
              }}
            >
              <div style={{ wordBreak: 'break-all' }}><strong>File:</strong> {selectedBackup.fileName}</div>
              <div><strong>Device:</strong> {selectedBackup.deviceName}</div>
              {selectedBackup.date && <div><strong>Time:</strong> {selectedBackup.date}</div>}
            </div>

            {restoreErrorMsg && (
              <div
                style={{
                  fontSize: '11px',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#fee2e2',
                  color: isDark ? '#f87171' : '#b91c1c',
                  marginBottom: '12px',
                  maxWidth: '380px',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              >
                {restoreErrorMsg}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', width: '100%', maxWidth: '320px' }}>
              <button
                type="button"
                onClick={() => setSelectedBackup(null)}
                disabled={isRestoring}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
                  backgroundColor: 'transparent',
                  color: isDark ? '#cbd5e1' : '#475569',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: isRestoring ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmRestore}
                disabled={isRestoring}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: isRestoring ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px',
                  whiteSpace: 'nowrap',
                }}
              >
                {isRestoring ? (
                  <>
                    <span style={{ animation: 'arcable-spin 1s linear infinite', display: 'inline-flex' }}>
                      <RefreshIcon size={12} />
                    </span>
                    <span>Restoring...</span>
                  </>
                ) : (
                  <span>Override & Restore</span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
