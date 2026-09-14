'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArcableWorkspaceData } from '../../types/workspace';
import {
  getStoredDeviceName,
  detectDeviceType,
} from '../../utils/syncEngine';
import {
  exportWorkspaceToJson,
  parseWorkspaceBackupJson,
  WorkspaceBackupSummary,
} from '../../utils/workspaceBackup';
import { Badge } from '../Badge';
import { useSystemTheme } from '../../hooks/useSystemTheme';
import {
  CloseIcon,
  RefreshIcon,
  CheckIcon,
  DownloadIcon,
  UploadIcon,
} from '../Icons';

export interface BackupRestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentWorkspaceData?: ArcableWorkspaceData;
  onRestoreComplete?: (restoredSnapshot: ArcableWorkspaceData) => void;
  onExport?: () => Promise<ArcableWorkspaceData | void> | ArcableWorkspaceData | void;
  onRestore?: (workspaceData: ArcableWorkspaceData) => Promise<{ success: boolean; error?: string } | void> | void;

  // Deprecated legacy Raindrop props (optional, kept for backwards compatibility)
  raindropToken?: string;
  onBackup?: () => Promise<{ success: boolean; fileName?: string; error?: string }>;
  onFetchBackups?: () => Promise<any[]>;
  onRestoreBackup?: (backupId: number) => Promise<{ success: boolean; restoredSnapshot?: ArcableWorkspaceData; error?: string }>;
}

export const BackupRestoreModal: React.FC<BackupRestoreModalProps> = ({
  isOpen,
  onClose,
  currentWorkspaceData,
  onRestoreComplete,
  onExport,
  onRestore,
}) => {
  const { isDark } = useSystemTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Export state
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);
  const [exportErrorMsg, setExportErrorMsg] = useState<string | null>(null);

  // Restore state
  const [isDragging, setIsDragging] = useState(false);
  const [parsedData, setParsedData] = useState<ArcableWorkspaceData | null>(null);
  const [fileSummary, setFileSummary] = useState<WorkspaceBackupSummary | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreErrorMsg, setRestoreErrorMsg] = useState<string | null>(null);
  const [restoreSuccessMsg, setRestoreSuccessMsg] = useState<string | null>(null);

  const deviceType = detectDeviceType();
  const currentDeviceName = getStoredDeviceName(undefined, deviceType);

  // Resolve current active workspace data
  const getActiveWorkspaceData = useCallback((): ArcableWorkspaceData => {
    if (currentWorkspaceData && Array.isArray(currentWorkspaceData.spaces) && currentWorkspaceData.spaces.length > 0) {
      return currentWorkspaceData;
    }
    if (typeof window !== 'undefined') {
      const raw = window.localStorage.getItem('arcable_workspace_data');
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.spaces)) {
            return parsed;
          }
        } catch {}
      }
    }
    return {
      activeSpaceId: 'space_personal',
      version: 1,
      spaces: [],
      folders: [],
      tabs: [],
    };
  }, [currentWorkspaceData]);

  const activeWs = getActiveWorkspaceData();
  const currentSpacesCount = activeWs.spaces.length;
  const currentFoldersCount = activeWs.folders.length;
  const currentTabsCount = activeWs.tabs.length;

  // Reset state on modal open
  useEffect(() => {
    if (isOpen) {
      setExportSuccessMsg(null);
      setExportErrorMsg(null);
      setRestoreErrorMsg(null);
      setRestoreSuccessMsg(null);
      setParsedData(null);
      setFileSummary(null);
      setIsDragging(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [isOpen]);

  // Handle JSON export
  const handleExport = async () => {
    if (isExporting || isRestoring) return;
    setIsExporting(true);
    setExportSuccessMsg(null);
    setExportErrorMsg(null);

    try {
      if (onExport) {
        const customData = await onExport();
        if (customData) {
          const { fileName } = exportWorkspaceToJson(customData, {
            deviceName: currentDeviceName,
            deviceType,
          });
          setExportSuccessMsg(`Exported successfully: ${fileName}`);
        } else {
          setExportSuccessMsg('Workspace exported successfully.');
        }
      } else {
        const wsToExport = getActiveWorkspaceData();
        const { fileName } = exportWorkspaceToJson(wsToExport, {
          deviceName: currentDeviceName,
          deviceType,
        });
        setExportSuccessMsg(`Exported successfully: ${fileName}`);
      }
    } catch (err: any) {
      console.error('[BackupRestoreModal] Export failed:', err);
      setExportErrorMsg(err?.message || 'Failed to export workspace JSON file.');
    } finally {
      setIsExporting(false);
    }
  };

  // Process a selected or dropped file
  const processFile = (file: File) => {
    setRestoreErrorMsg(null);
    setRestoreSuccessMsg(null);

    if (!file.name.toLowerCase().endsWith('.json') && file.type !== 'application/json') {
      setRestoreErrorMsg('Please select a valid .json file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = String(e.target?.result || '');
      const result = parseWorkspaceBackupJson(content, {
        fileName: file.name,
        fileSize: file.size,
      });

      if (!result.success || !result.data) {
        setRestoreErrorMsg(result.error || 'Failed to parse JSON backup file.');
        setParsedData(null);
        setFileSummary(null);
      } else {
        setParsedData(result.data);
        setFileSummary(result.summary || null);
        setRestoreErrorMsg(null);
      }
    };

    reader.onerror = () => {
      setRestoreErrorMsg('Error reading file from disk.');
    };

    reader.readAsText(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  // Confirm restore
  const handleConfirmRestore = async () => {
    if (!parsedData || isRestoring) return;
    setIsRestoring(true);
    setRestoreErrorMsg(null);
    setRestoreSuccessMsg(null);

    try {
      if (onRestore) {
        const result = await onRestore(parsedData);
        if (result && !result.success) {
          throw new Error(result.error || 'Failed to restore workspace.');
        }
      }

      if (onRestoreComplete) {
        onRestoreComplete(parsedData);
      } else if (typeof window !== 'undefined') {
        window.localStorage.setItem('arcable_workspace_data', JSON.stringify(parsedData));
        try {
          window.localStorage.removeItem('arcable_pending_ops');
        } catch {}
        window.location.reload();
      }

      setRestoreSuccessMsg('Workspace restored successfully! Updating layout...');
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('[BackupRestoreModal] Restore failed:', err);
      setRestoreErrorMsg(err?.message || 'Failed to restore workspace from file.');
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
        if (e.target === e.currentTarget && !isRestoring && !isExporting) {
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
          .arcable-card-row {
            display: flex;
            align-items: center;
            justifyContent: space-between;
            gap: 12px;
            flex-wrap: wrap;
          }
          @media (max-width: 480px) {
            .arcable-card-row {
              flex-direction: column;
              align-items: flex-start;
              gap: 8px;
            }
            .arcable-card-row button {
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
                Export workspace as JSON or restore from a local file
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isRestoring || isExporting}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: isRestoring || isExporting ? 'not-allowed' : 'pointer',
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
          {/* Section 1: Export as JSON */}
          <div
            style={{
              padding: '14px',
              borderRadius: '12px',
              backgroundColor: isDark ? '#0e1522' : '#f8fafc',
              border: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div className="arcable-card-row">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <DownloadIcon size={15} color={isDark ? '#38bdf8' : '#0284c7'} />
                  <span style={{ fontSize: '13px', fontWeight: 600, color: isDark ? '#f1f5f9' : '#1e293b', lineHeight: 1.2 }}>
                    Export as JSON File
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: isDark ? '#94a3b8' : '#64748b', marginTop: '2px' }}>
                  Download a full backup containing all spaces, folders, and tabs.
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                  <Badge variant="default">{currentSpacesCount} {currentSpacesCount === 1 ? 'Space' : 'Spaces'}</Badge>
                  <Badge variant="default">{currentFoldersCount} {currentFoldersCount === 1 ? 'Folder' : 'Folders'}</Badge>
                  <Badge variant="default">{currentTabsCount} {currentTabsCount === 1 ? 'Tab' : 'Tabs'}</Badge>
                  <Badge variant="info">{currentDeviceName}</Badge>
                </div>
              </div>

              <button
                type="button"
                onClick={handleExport}
                disabled={isExporting || isRestoring}
                style={{
                  border: 'none',
                  backgroundColor: isDark ? '#38bdf8' : '#0284c7',
                  color: isDark ? '#0f172a' : '#ffffff',
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '8px 14px',
                  borderRadius: '8px',
                  cursor: isExporting || isRestoring ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  opacity: isExporting ? 0.75 : 1,
                  transition: 'opacity 0.15s ease',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {isExporting ? (
                  <>
                    <span style={{ animation: 'arcable-spin 1s linear infinite', display: 'inline-flex' }}>
                      <RefreshIcon size={13} />
                    </span>
                    <span>Exporting...</span>
                  </>
                ) : (
                  <>
                    <DownloadIcon size={14} />
                    <span>Export JSON</span>
                  </>
                )}
              </button>
            </div>

            {exportSuccessMsg && (
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
                <span>{exportSuccessMsg}</span>
              </div>
            )}

            {exportErrorMsg && (
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
                {exportErrorMsg}
              </div>
            )}
          </div>

          {/* Section 2: Restore from Local JSON File */}
          <div
            style={{
              padding: '14px',
              borderRadius: '12px',
              backgroundColor: isDark ? '#0e1522' : '#f8fafc',
              border: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <UploadIcon size={15} color={isDark ? '#38bdf8' : '#0284c7'} />
                <span style={{ fontSize: '13px', fontWeight: 600, color: isDark ? '#f1f5f9' : '#1e293b', lineHeight: 1.2 }}>
                  Restore from Local JSON File
                </span>
              </div>
              <span style={{ fontSize: '11px', color: isDark ? '#94a3b8' : '#64748b' }}>
                Select a previously exported Arcable backup JSON file to restore.
              </span>
            </div>

            {/* Hidden File Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={handleFileInputChange}
            />

            {!parsedData ? (
              /* Drop / Select Area */
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${isDragging ? '#38bdf8' : isDark ? '#334155' : '#cbd5e1'}`,
                  backgroundColor: isDragging
                    ? isDark ? 'rgba(56, 189, 248, 0.1)' : '#f0f9ff'
                    : isDark ? '#131c2d' : '#f1f5f9',
                  borderRadius: '10px',
                  padding: '24px 16px',
                  textAlign: 'center',
                  cursor: isRestoring ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ fontSize: '24px', opacity: 0.9 }}>📂</div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: isDark ? '#f1f5f9' : '#1e293b' }}>
                  {isDragging ? 'Drop your JSON backup file here' : 'Choose a JSON file or drag & drop here'}
                </div>
                <div style={{ fontSize: '11px', color: isDark ? '#94a3b8' : '#64748b' }}>
                  Supports exported Arcable JSON backup files (*.json)
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  disabled={isRestoring}
                  style={{
                    marginTop: '4px',
                    border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
                    backgroundColor: isDark ? '#1e293b' : '#ffffff',
                    color: isDark ? '#f1f5f9' : '#334155',
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '5px 12px',
                    borderRadius: '6px',
                    cursor: isRestoring ? 'not-allowed' : 'pointer',
                  }}
                >
                  Browse File...
                </button>
              </div>
            ) : (
              /* Selected Backup File Preview */
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  padding: '12px',
                  borderRadius: '10px',
                  backgroundColor: isDark ? '#131c2d' : '#ffffff',
                  border: `1px solid ${isDark ? '#243247' : '#e2e8f0'}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '14px' }}>📄</span>
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: isDark ? '#f8fafc' : '#0f172a',
                          wordBreak: 'break-all',
                        }}
                      >
                        {fileSummary?.fileName || 'Selected Backup File'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10.5px', color: isDark ? '#94a3b8' : '#64748b', flexWrap: 'wrap' }}>
                      {fileSummary?.fileSize !== undefined && (
                        <span>{Math.max(1, Math.round(fileSummary.fileSize / 1024))} KB</span>
                      )}
                      {fileSummary?.exportedAt && (
                        <>
                          <span>•</span>
                          <span>Exported: {new Date(fileSummary.exportedAt).toLocaleString()}</span>
                        </>
                      )}
                      {fileSummary?.deviceName && (
                        <>
                          <span>•</span>
                          <span>{fileSummary.deviceName}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setParsedData(null);
                      setFileSummary(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    disabled={isRestoring}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: isDark ? '#94a3b8' : '#64748b',
                      fontSize: '11px',
                      cursor: isRestoring ? 'not-allowed' : 'pointer',
                      padding: '4px 6px',
                      borderRadius: '4px',
                      textDecoration: 'underline',
                      flexShrink: 0,
                    }}
                  >
                    Change
                  </button>
                </div>

                {/* Content preview badges */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <Badge variant="info">
                    {fileSummary?.spacesCount || parsedData.spaces.length} Spaces
                  </Badge>
                  <Badge variant="default">
                    {fileSummary?.foldersCount || parsedData.folders.length} Folders
                  </Badge>
                  <Badge variant="default">
                    {fileSummary?.tabsCount || parsedData.tabs.length} Tabs
                  </Badge>
                </div>

                {/* Overwrite Warning Banner */}
                <div
                  style={{
                    fontSize: '11px',
                    lineHeight: '1.4',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#fef2f2',
                    color: isDark ? '#fca5a5' : '#b91c1c',
                    border: `1px solid ${isDark ? 'rgba(239, 68, 68, 0.25)' : '#fecaca'}`,
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '6px',
                  }}
                >
                  <span style={{ flexShrink: 0, marginTop: '1px' }}>⚠️</span>
                  <span>
                    <strong>Warning:</strong> Restoring this backup will replace all existing spaces, folders, and tabs in your current workspace layout.
                  </span>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setParsedData(null);
                      setFileSummary(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    disabled={isRestoring}
                    style={{
                      border: `1px solid ${isDark ? '#334155' : '#cbd5e1'}`,
                      backgroundColor: 'transparent',
                      color: isDark ? '#94a3b8' : '#64748b',
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '6px 12px',
                      borderRadius: '6px',
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
                      border: 'none',
                      backgroundColor: '#dc2626',
                      color: '#ffffff',
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '6px 14px',
                      borderRadius: '6px',
                      cursor: isRestoring ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
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
                      <span>Restore Workspace</span>
                    )}
                  </button>
                </div>
              </div>
            )}

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
                }}
              >
                <CheckIcon size={13} />
                <span>{restoreSuccessMsg}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const ExportRestoreModal = BackupRestoreModal;
