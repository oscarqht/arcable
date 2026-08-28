'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Space, Folder } from '../../types/workspace';
import { Button } from '../Button';
import { FolderInputIcon } from '../Icons';

export interface ConvertSpaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  space: Space | null;
  allSpaces: Space[];
  allFolders: Folder[];
  onConvert: (sourceSpaceId: string, targetSpaceId: string, targetParentFolderId?: string) => void;
}

export const ConvertSpaceModal: React.FC<ConvertSpaceModalProps> = ({
  isOpen,
  onClose,
  space,
  allSpaces,
  allFolders,
  onConvert,
}) => {
  // Available destination spaces (all except the space being converted)
  const destinationSpaces = useMemo(() => {
    if (!space) return [];
    return allSpaces.filter((s) => s.id !== space.id);
  }, [allSpaces, space]);

  const [targetSpaceId, setTargetSpaceId] = useState('');
  const [targetParentFolderId, setTargetParentFolderId] = useState('');

  useEffect(() => {
    if (isOpen && destinationSpaces.length > 0) {
      setTargetSpaceId(destinationSpaces[0].id);
      setTargetParentFolderId('');
    }
  }, [isOpen, destinationSpaces]);

  // Folders in the selected destination space
  const availableParentFolders = useMemo(() => {
    if (!targetSpaceId) return [];
    return allFolders.filter((f) => f.parentSpaceId === targetSpaceId);
  }, [allFolders, targetSpaceId]);

  if (!isOpen || !space) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetSpaceId) return;

    onConvert(space.id, targetSpaceId, targetParentFolderId || undefined);
    onClose();
  };

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
          borderRadius: '14px',
          padding: '24px',
          width: '100%',
          maxWidth: '460px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          border: '1px solid #e2e8f0',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: '#f0f9ff',
                color: '#0284c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FolderInputIcon size={18} color="#0284c7" />
            </div>
            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>
              Convert Space to Folder
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'none',
              fontSize: '18px',
              cursor: 'pointer',
              color: '#94a3b8',
              padding: '4px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Informational description */}
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            fontSize: '13px',
            color: '#475569',
            marginBottom: '18px',
            lineHeight: 1.5,
          }}
        >
          Converting space <strong style={{ color: '#0f172a' }}>{space.emojiIcon ? `${space.emojiIcon} ` : ''}{space.name}</strong> will turn it into a folder inside the chosen destination space. All existing folders and tabs will be preserved.
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: '#334155',
                marginBottom: '6px',
              }}
            >
              Destination Space <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <select
              value={targetSpaceId}
              onChange={(e) => {
                setTargetSpaceId(e.target.value);
                setTargetParentFolderId('');
              }}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
                backgroundColor: '#ffffff',
                boxSizing: 'border-box',
                outline: 'none',
              }}
              required
            >
              {destinationSpaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.emojiIcon ? `${s.emojiIcon} ` : ''}{s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: '#334155',
                marginBottom: '6px',
              }}
            >
              Target Parent Folder (Optional)
            </label>
            <select
              value={targetParentFolderId}
              onChange={(e) => setTargetParentFolderId(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
                backgroundColor: '#ffffff',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            >
              <option value="">(Root of Destination Space)</option>
              {availableParentFolders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.customEmojiIcon ? `${f.customEmojiIcon} ` : '📁 '}{f.name}
                </option>
              ))}
            </select>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              marginTop: '12px',
            }}
          >
            <Button type="button" variant="secondary" size="md" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={!targetSpaceId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <FolderInputIcon size={15} />
              <span>Convert to Folder</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
