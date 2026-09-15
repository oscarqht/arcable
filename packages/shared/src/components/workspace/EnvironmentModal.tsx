'use client';

import React, { useEffect, useState } from 'react';
import { Environment } from '../../types/workspace';
import { ENVIRONMENT_VARIABLE_NAME_PATTERN } from '../../utils/environment';
import { Button } from '../Button';
import { useSystemTheme } from '../../hooks/useSystemTheme';
import { PlusIcon, TrashIcon, CloseIcon } from '../Icons';

interface EnvironmentModalProps {
  isOpen: boolean;
  environments: Environment[];
  variables: string[];
  selectedEnvironmentId: string;
  onClose: () => void;
  onSelect: (id: string) => void;
  onCreateEnvironment: (name: string) => void;
  onUpdateEnvironment: (id: string, updates: Partial<Pick<Environment, 'name' | 'values'>>) => void;
  onDeleteEnvironment: (id: string) => void;
  onCreateVariable: (name: string) => boolean;
  onRenameVariable: (oldName: string, newName: string) => boolean;
  onDeleteVariable: (name: string) => void;
}

export const EnvironmentModal: React.FC<EnvironmentModalProps> = (props) => {
  const { isDark } = useSystemTheme();
  const [isAddingEnvironment, setIsAddingEnvironment] = useState(false);
  const [newEnvironmentName, setNewEnvironmentName] = useState('');
  const [environmentError, setEnvironmentError] = useState('');
  const [newVariable, setNewVariable] = useState('');
  const [variableError, setVariableError] = useState('');
  const [invalidVariableName, setInvalidVariableName] = useState<string | null>(null);

  const environment = props.environments.find((item) => item.id === props.selectedEnvironmentId) || props.environments[0];

  useEffect(() => {
    if (environment && environment.id !== props.selectedEnvironmentId) props.onSelect(environment.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [environment]);

  useEffect(() => {
    if (!props.isOpen) {
      setIsAddingEnvironment(false);
      setNewEnvironmentName('');
      setEnvironmentError('');
      setNewVariable('');
      setVariableError('');
      setInvalidVariableName(null);
    }
  }, [props.isOpen]);

  if (!props.isOpen || !environment) return null;

  const border = isDark ? '#334155' : '#e2e8f0';
  const mutedText = isDark ? '#94a3b8' : '#64748b';
  const labelText = isDark ? '#cbd5e1' : '#334155';
  const inputBg = isDark ? '#0f172a' : '#ffffff';
  const cardBg = isDark ? '#0f172a' : '#f8fafc';
  const accent = '#0284c7';

  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: '35px',
    border: `1px solid ${border}`,
    borderRadius: '6px',
    padding: '8px 10px',
    background: inputBg,
    color: isDark ? '#f8fafc' : '#0f172a',
    fontSize: '13px',
    boxSizing: 'border-box',
    outline: 'none',
  };

  const addEnvironment = () => {
    const name = newEnvironmentName.trim();
    if (!name) {
      setEnvironmentError('Enter a name for the environment.');
      return;
    }
    if (props.environments.some((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setEnvironmentError('An environment with this name already exists.');
      return;
    }
    props.onCreateEnvironment(name);
    setNewEnvironmentName('');
    setEnvironmentError('');
    setIsAddingEnvironment(false);
  };

  const addVariable = () => {
    const name = newVariable.trim();
    if (!name) {
      setVariableError('Enter a variable name.');
      return;
    }
    if (!ENVIRONMENT_VARIABLE_NAME_PATTERN.test(name)) {
      setVariableError('Use letters, numbers, and underscores only — starting with a letter or underscore.');
      return;
    }
    if (!props.onCreateVariable(name)) {
      setVariableError('A variable with this name already exists.');
      return;
    }
    setNewVariable('');
    setVariableError('');
  };

  const handleDeleteEnvironment = () => {
    if (props.environments.length <= 1) return;
    if (window.confirm(`Delete "${environment.name}"? This cannot be undone.`)) {
      props.onDeleteEnvironment(environment.id);
    }
  };

  return (
    <div
      onClick={props.onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 520,
          maxHeight: 'calc(100vh - 32px)',
          overflow: 'auto',
          padding: 24,
          borderRadius: 12,
          background: isDark ? '#1e293b' : '#ffffff',
          color: isDark ? '#f8fafc' : '#0f172a',
          border: `1px solid ${border}`,
          boxShadow: isDark
            ? '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.3)'
            : '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: isDark ? '#f8fafc' : '#0f172a' }}>Environments</h3>
            <div style={{ marginTop: 4, fontSize: '12px', color: mutedText }}>
              Switch between environments and manage the variables tab URLs can reference. Values are synced in plain text.
            </div>
          </div>
          <button
            onClick={props.onClose}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: mutedText, padding: 4, display: 'flex' }}
            aria-label="Close"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* Environment pill selector */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {props.environments.map((item) => {
            const isSelected = item.id === environment.id;
            return (
              <button
                key={item.id}
                onClick={() => props.onSelect(item.id)}
                title={item.name}
                style={{
                  padding: '6px 12px',
                  borderRadius: '999px',
                  fontSize: '13px',
                  fontWeight: isSelected ? 600 : 500,
                  cursor: 'pointer',
                  border: `1px solid ${isSelected ? accent : border}`,
                  background: isSelected ? (isDark ? 'rgba(2, 132, 199, 0.18)' : '#e0f2fe') : 'transparent',
                  color: isSelected ? accent : labelText,
                  transition: 'all 0.12s ease',
                  maxWidth: 180,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.name}
              </button>
            );
          })}
          <button
            onClick={() => setIsAddingEnvironment((v) => !v)}
            title="Add environment"
            style={{
              padding: '6px 10px',
              borderRadius: '999px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              border: `1px dashed ${border}`,
              background: 'transparent',
              color: mutedText,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <PlusIcon size={14} /> New
          </button>
        </div>

        {isAddingEnvironment && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                autoFocus
                value={newEnvironmentName}
                onChange={(event) => {
                  setNewEnvironmentName(event.target.value);
                  if (environmentError) setEnvironmentError('');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') addEnvironment();
                  if (event.key === 'Escape') {
                    setIsAddingEnvironment(false);
                    setNewEnvironmentName('');
                    setEnvironmentError('');
                  }
                }}
                placeholder="e.g. Staging"
                style={{ ...inputStyle, flex: 1 }}
              />
              <Button onClick={addEnvironment} size="sm" style={{ height: '35px' }}>Add</Button>
            </div>
            {environmentError && <div style={{ marginTop: 6, fontSize: '12px', color: '#ef4444' }}>{environmentError}</div>}
          </div>
        )}

        {/* Selected environment name + delete */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: labelText, marginBottom: 5 }}>
              Environment name
            </label>
            <input
              value={environment.name}
              onChange={(event) => props.onUpdateEnvironment(environment.id, { name: event.target.value })}
              onBlur={(event) => props.onUpdateEnvironment(environment.id, { name: event.target.value.trim() || environment.name })}
              style={inputStyle}
            />
          </div>
          <button
            onClick={handleDeleteEnvironment}
            disabled={props.environments.length <= 1}
            title={props.environments.length <= 1 ? 'At least one environment is required' : `Delete ${environment.name}`}
            style={{
              border: `1px solid ${border}`,
              borderRadius: '6px',
              background: 'transparent',
              color: props.environments.length <= 1 ? mutedText : '#ef4444',
              cursor: props.environments.length <= 1 ? 'not-allowed' : 'pointer',
              opacity: props.environments.length <= 1 ? 0.5 : 1,
              padding: '8px 10px',
              display: 'flex',
              alignItems: 'center',
              height: '35px',
              boxSizing: 'border-box',
            }}
          >
            <TrashIcon size={15} />
          </button>
        </div>

        {/* Variables */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <strong style={{ fontSize: '13px', color: labelText }}>Variables</strong>
          <span style={{ fontSize: '11px', color: mutedText }}>Use in URLs as {'{{name}}'}</span>
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={newVariable}
              onChange={(event) => {
                setNewVariable(event.target.value);
                if (variableError) setVariableError('');
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') addVariable();
              }}
              placeholder="Variable name (e.g. apiHost)"
              style={{ ...inputStyle, flex: 1 }}
            />
            <Button onClick={addVariable} size="sm" style={{ height: '35px', gap: '6px' }}>
              <PlusIcon size={14} /> Add
            </Button>
          </div>
          {variableError && <div style={{ marginTop: 6, fontSize: '12px', color: '#ef4444' }}>{variableError}</div>}
        </div>

        {props.variables.length === 0 ? (
          <div
            style={{
              padding: '16px 12px',
              textAlign: 'center',
              fontSize: '13px',
              color: mutedText,
              border: `1px dashed ${border}`,
              borderRadius: '8px',
            }}
          >
            No variables yet. Add one above to reference it in a tab URL as {'{{name}}'}.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {props.variables.map((variable) => (
              <div
                key={variable}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor: cardBg,
                  padding: 8,
                  borderRadius: 8,
                  border: `1px solid ${invalidVariableName === variable ? '#ef4444' : border}`,
                }}
              >
                <input
                  defaultValue={variable}
                  aria-label={`${variable} name`}
                  title="Variable name"
                  onFocus={() => setInvalidVariableName(null)}
                  onBlur={(event) => {
                    const next = event.target.value.trim();
                    if (!next || next === variable) {
                      event.target.value = variable;
                      return;
                    }
                    if (!ENVIRONMENT_VARIABLE_NAME_PATTERN.test(next) || !props.onRenameVariable(variable, next)) {
                      event.target.value = variable;
                      setInvalidVariableName(variable);
                    }
                  }}
                  style={{
                    ...inputStyle,
                    width: '130px',
                    flexShrink: 0,
                    fontFamily: 'monospace',
                  }}
                />
                <input
                  value={environment.values[variable] ?? ''}
                  aria-label={`${variable} value`}
                  placeholder="Value for this environment"
                  onChange={(event) => props.onUpdateEnvironment(environment.id, { values: { [variable]: event.target.value } })}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button
                  onClick={() => props.onDeleteVariable(variable)}
                  title={`Remove ${variable}`}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: mutedText,
                    cursor: 'pointer',
                    padding: '6px',
                    borderRadius: '4px',
                    flexShrink: 0,
                    display: 'flex',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#ef4444';
                    e.currentTarget.style.backgroundColor = isDark ? 'rgba(239, 68, 68, 0.15)' : '#fee2e2';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = mutedText;
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <TrashIcon size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
