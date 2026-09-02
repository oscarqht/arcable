'use client';

import React, { useEffect } from 'react';
import { Button } from '../Button';
import { useSystemTheme } from '../../hooks/useSystemTheme';
import { TrashIcon, CloseIcon } from '../Icons';

export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Deletion',
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  danger = true,
}) => {
  const { isDark } = useSystemTheme();

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100000,
        padding: '16px',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        style={{
          backgroundColor: isDark ? '#1e293b' : '#ffffff',
          borderRadius: '16px',
          padding: '22px 24px 20px 24px',
          width: '100%',
          maxWidth: '420px',
          boxShadow: isDark
            ? '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.3)'
            : '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2',
                color: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <TrashIcon size={16} />
            </div>
            <h2
              id="confirm-modal-title"
              style={{
                margin: 0,
                fontSize: '17px',
                fontWeight: 600,
                color: isDark ? '#f8fafc' : '#0f172a',
              }}
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: isDark ? '#94a3b8' : '#64748b',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px',
            }}
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Message */}
        <div
          style={{
            fontSize: '14px',
            color: isDark ? '#cbd5e1' : '#475569',
            lineHeight: 1.5,
            marginBottom: '20px',
            wordBreak: 'break-word',
          }}
        >
          {message}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <Button type="button" variant="secondary" size="md" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={danger ? 'danger' : 'primary'}
            size="md"
            autoFocus
            onClick={() => {
              onConfirm();
              onClose();
            }}
            style={danger ? { backgroundColor: '#ef4444', borderColor: '#ef4444', color: '#ffffff' } : undefined}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};
