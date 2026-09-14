'use client';

import React, { useEffect, useState } from 'react';
import { Environment } from '../../types/workspace';
import { ENVIRONMENT_VARIABLE_NAME_PATTERN } from '../../utils/environment';
import { Button } from '../Button';
import { useSystemTheme } from '../../hooks/useSystemTheme';

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
  const [newEnvironmentName, setNewEnvironmentName] = useState('');
  const [newVariable, setNewVariable] = useState('');
  const environment = props.environments.find((item) => item.id === props.selectedEnvironmentId) || props.environments[0];

  useEffect(() => {
    if (environment && environment.id !== props.selectedEnvironmentId) props.onSelect(environment.id);
  }, [environment, props]);

  if (!props.isOpen || !environment) return null;
  const inputStyle: React.CSSProperties = {
    width: '100%', border: `1px solid ${isDark ? '#475569' : '#cbd5e1'}`, borderRadius: '8px',
    padding: '8px 10px', background: isDark ? '#0f172a' : '#fff', color: isDark ? '#f8fafc' : '#0f172a', boxSizing: 'border-box',
  };
  const addEnvironment = () => {
    const name = newEnvironmentName.trim();
    if (!name || props.environments.some((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return;
    props.onCreateEnvironment(name); setNewEnvironmentName('');
  };
  const addVariable = () => {
    if (props.onCreateVariable(newVariable)) setNewVariable('');
  };

  return <div onClick={props.onClose} style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)' }}>
    <div onClick={(event) => event.stopPropagation()} style={{ width: '100%', maxWidth: 560, maxHeight: 'calc(100vh - 32px)', overflow: 'auto', padding: 20, borderRadius: 16, background: isDark ? '#1e293b' : '#fff', color: isDark ? '#f8fafc' : '#0f172a', border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}><div><h2 style={{ margin: 0, fontSize: 18 }}>Environments</h2><div style={{ marginTop: 3, fontSize: 12, color: isDark ? '#94a3b8' : '#64748b' }}>Values are synced in plain text.</div></div><button onClick={props.onClose} style={{ border: 0, background: 'transparent', color: 'inherit', fontSize: 20, cursor: 'pointer' }}>×</button></div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}><select aria-label="Selected environment" value={environment.id} onChange={(event) => props.onSelect(event.target.value)} style={{ ...inputStyle, flex: 1 }}>
        {props.environments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><Button onClick={() => { if (props.environments.length > 1 && window.confirm(`Delete ${environment.name}?`)) props.onDeleteEnvironment(environment.id); }} disabled={props.environments.length <= 1}>Delete</Button></div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}><input value={newEnvironmentName} onChange={(event) => setNewEnvironmentName(event.target.value)} placeholder="New environment name" style={{ ...inputStyle, flex: 1 }} /><Button onClick={addEnvironment}>Add environment</Button></div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 5 }}>Environment name</label><input value={environment.name} onChange={(event) => props.onUpdateEnvironment(environment.id, { name: event.target.value })} onBlur={(event) => props.onUpdateEnvironment(environment.id, { name: event.target.value.trim() || environment.name })} style={{ ...inputStyle, marginBottom: 16 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><strong style={{ fontSize: 13 }}>Variables</strong><span style={{ fontSize: 11, color: isDark ? '#94a3b8' : '#64748b' }}>Use in URLs as {'{{name}}'}</span></div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}><input value={newVariable} onChange={(event) => setNewVariable(event.target.value)} placeholder="Variable name" pattern={ENVIRONMENT_VARIABLE_NAME_PATTERN.source} style={{ ...inputStyle, flex: 1 }} /><Button onClick={addVariable}>Add</Button></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{props.variables.map((variable) => <div key={variable} style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, .7fr) minmax(140px, 1fr) auto', gap: 8, alignItems: 'center' }}>
        <input defaultValue={variable} aria-label={`${variable} name`} pattern={ENVIRONMENT_VARIABLE_NAME_PATTERN.source} onBlur={(event) => { const next = event.target.value.trim(); if (next && next !== variable && !props.onRenameVariable(variable, next)) event.target.value = variable; }} style={inputStyle} />
        <input value={environment.values[variable] ?? ''} aria-label={`${variable} value`} onChange={(event) => props.onUpdateEnvironment(environment.id, { values: { [variable]: event.target.value } })} style={inputStyle} />
        <Button onClick={() => props.onDeleteVariable(variable)}>Remove</Button>
      </div>)}</div>
    </div>
  </div>;
};
