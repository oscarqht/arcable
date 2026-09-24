import React, { useState, useEffect, useRef } from 'react';
import { Card, Button, Badge } from '@arcable/shared/components';
import { RunCodeRule, WorkspaceOperation } from '@arcable/shared/types';
import {
  isValidUrlPattern,
  normalizeRunCodeRules,
  generateRuleId,
  sortRunCodeRules,
  formatDate,
  extractRulesFromNenyaExport,
  mergeCustomCodeRules,
  mergeRunCodeRules,
  createWorkspaceOperation,
} from '@arcable/shared/utils';
import {
  browser,
  checkUserScriptsAvailable,
  openExtensionDetailsPage,
  isBrave,
  isFirefox,
} from '../../utils/browser';
import { CodeEditor } from './CodeEditor';

const STORAGE_KEY = 'runCodeInPageRules';

interface RunCodeTabProps {
  isDark: boolean;
  showToast: (msg: string, type?: 'info' | 'success' | 'warning') => void;
}

export const RunCodeTab: React.FC<RunCodeTabProps> = ({ isDark, showToast }) => {
  const [rules, setRules] = useState<RunCodeRule[]>([]);
  const [titleInput, setTitleInput] = useState('');
  const [patterns, setPatterns] = useState<string[]>([]);
  const [newPatternInput, setNewPatternInput] = useState('');
  const [code, setCode] = useState('');
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [patternError, setPatternError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [userScriptsAvailable, setUserScriptsAvailable] = useState<boolean | null>(null);
  const [isCheckingScripts, setIsCheckingScripts] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const verifyUserScripts = async (silent = false) => {
    setIsCheckingScripts(true);
    try {
      const available = await checkUserScriptsAvailable();
      setUserScriptsAvailable(available);
      if (!silent) {
        if (available) {
          showToast('"Allow user scripts" is enabled! You can now run code in pages.', 'success');
        } else {
          showToast('"Allow user scripts" is still disabled in browser settings.', 'warning');
        }
      }
      return available;
    } catch (err) {
      console.warn('[RunCodeTab] Failed to verify user scripts status:', err);
      setUserScriptsAvailable(false);
      return false;
    } finally {
      setIsCheckingScripts(false);
    }
  };

  const syncToRaindropImmediately = async () => {
    try {
      let localState: any = undefined;
      if (typeof window !== 'undefined') {
        const stored = window.localStorage.getItem('arcable_workspace_data');
        if (stored) {
          try {
            localState = JSON.parse(stored);
          } catch {}
        }
      }
      const res = (await browser.runtime.sendMessage({
        type: 'RAINDROP_SYNC_WORKSPACE',
        payload: { localState },
      })) as { success: boolean; data?: { latestSnapshot?: any }; latestSnapshot?: any; error?: string };
      const latestSnapshot = res?.data?.latestSnapshot || (res as any)?.latestSnapshot;
      if (res?.success && latestSnapshot && typeof window !== 'undefined') {
        try {
          window.localStorage.setItem('arcable_workspace_data', JSON.stringify(latestSnapshot));
        } catch {}
      }
      return res;
    } catch (err: any) {
      console.warn('[RunCodeTab] Immediate Raindrop sync error:', err);
      return { success: false, error: err?.message };
    }
  };

  useEffect(() => {
    loadRules();
    void verifyUserScripts(true);

    const handleStorageChange = (changes: any, area: string) => {
      if (area === 'local' && changes[STORAGE_KEY]) {
        const { rules: normalized } = normalizeRunCodeRules(changes[STORAGE_KEY].newValue);
        setRules(normalized);
      }
    };
    browser.storage.onChanged.addListener(handleStorageChange);

    const handleWindowFocus = () => {
      void verifyUserScripts(true);
    };
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      browser.storage.onChanged.removeListener(handleStorageChange);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, []);

  const loadRules = async () => {
    try {
      const stored = await browser.storage.local.get(STORAGE_KEY);
      const { rules: normalized, mutated } = normalizeRunCodeRules(stored[STORAGE_KEY]);
      setRules(normalized);
      if (mutated) {
        await browser.storage.local.set({ [STORAGE_KEY]: normalized });
      }
    } catch (err) {
      console.warn('[RunCodeTab] Failed to load rules:', err);
    }
  };

  const queueOperations = async (ops: WorkspaceOperation | WorkspaceOperation[]) => {
    const opList = Array.isArray(ops) ? ops : [ops];
    if (opList.length === 0) return;
    try {
      const stored = await browser.storage.local.get('arcable_pending_ops');
      const cur = (stored.arcable_pending_ops as WorkspaceOperation[]) || [];
      cur.push(...opList);
      await browser.storage.local.set({ arcable_pending_ops: cur });
    } catch (e) {
      console.warn('[RunCodeTab] Failed to queue operations:', e);
    }
  };

  const saveRulesToStorage = async (newRules: RunCodeRule[]) => {
    const sorted = sortRunCodeRules(newRules);
    setRules(sorted);
    await browser.storage.local.set({ [STORAGE_KEY]: sorted });
  };

  const handleAddPattern = () => {
    const clean = newPatternInput.trim();
    if (!clean) return;

    if (!isValidUrlPattern(clean)) {
      setPatternError('Invalid URL pattern. Example: *://*.github.com/* or https://example.com/*');
      return;
    }

    if (!patterns.includes(clean)) {
      setPatterns([...patterns, clean]);
    }
    setNewPatternInput('');
    setPatternError(null);
  };

  const handleRemovePattern = (index: number) => {
    setPatterns(patterns.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setEditingRuleId(null);
    setTitleInput('');
    setPatterns([]);
    setNewPatternInput('');
    setCode('');
    setPatternError(null);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanTitle = titleInput.trim();
    if (!cleanTitle) {
      setFormError('Please enter a snippet title.');
      return;
    }

    if (!code.trim()) {
      setFormError('Please provide JavaScript code.');
      return;
    }

    setIsSaving(true);
    try {
      const now = new Date().toISOString();

      if (editingRuleId) {
        const updated = rules.map((r) => {
          if (r.id === editingRuleId) {
            return {
              ...r,
              title: cleanTitle,
              patterns,
              code,
              updatedAt: now,
            };
          }
          return r;
        });
        await saveRulesToStorage(updated);
        await queueOperations(
          createWorkspaceOperation('RUN_CODE_UPDATE', editingRuleId, {
            title: cleanTitle,
            patterns,
            code,
          })
        );
      } else {
        const newRule: RunCodeRule = {
          id: generateRuleId('run'),
          title: cleanTitle,
          patterns,
          code,
          disabled: false,
          createdAt: now,
          updatedAt: now,
        };
        await saveRulesToStorage([...rules, newRule]);
        await queueOperations(createWorkspaceOperation('RUN_CODE_CREATE', newRule.id, newRule));
      }

      // Immediately save the changes to Raindrop
      const syncRes = await syncToRaindropImmediately();
      if (syncRes?.success) {
        showToast(
          editingRuleId ? 'Snippet updated and saved to Raindrop!' : 'Snippet created and saved to Raindrop!',
          'success'
        );
      } else if (syncRes?.error && syncRes.error !== 'Not authenticated with Raindrop') {
        showToast(`Snippet saved locally, but Raindrop sync failed: ${syncRes.error}`, 'warning');
      } else {
        showToast(
          editingRuleId ? 'Snippet updated successfully!' : 'Snippet created successfully!',
          'success'
        );
      }

      resetForm();
    } catch (err: any) {
      setFormError(`Failed to save: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditRule = (rule: RunCodeRule) => {
    setEditingRuleId(rule.id);
    setTitleInput(rule.title);
    setPatterns([...rule.patterns]);
    setCode(rule.code || '');
    setPatternError(null);
    setFormError(null);
    titleInputRef.current?.scrollIntoView({ behavior: 'smooth' });
    titleInputRef.current?.focus();
  };

  const handleDuplicateRule = async (rule: RunCodeRule) => {
    const now = new Date().toISOString();
    const dup: RunCodeRule = {
      ...rule,
      id: generateRuleId('run'),
      title: `${rule.title} (Copy)`,
      createdAt: now,
      updatedAt: now,
    };
    await saveRulesToStorage([...rules, dup]);
    await queueOperations(createWorkspaceOperation('RUN_CODE_CREATE', dup.id, dup));
    void syncToRaindropImmediately();
    showToast('Snippet duplicated!', 'info');
  };

  const handleDeleteRule = async (rule: RunCodeRule) => {
    if (window.confirm(`Delete snippet "${rule.title}"?`)) {
      const remaining = rules.filter((r) => r.id !== rule.id);
      if (editingRuleId === rule.id) resetForm();
      if (typeof window !== 'undefined') {
        try {
          const raw = window.localStorage.getItem('arcable_workspace_data');
          if (raw) {
            const parsed = JSON.parse(raw);
            parsed.runCodeInPageRules = remaining;
            window.localStorage.setItem('arcable_workspace_data', JSON.stringify(parsed));
          }
        } catch {}
      }
      await saveRulesToStorage(remaining);
      await queueOperations(createWorkspaceOperation('RUN_CODE_DELETE', rule.id, { raindropId: rule.raindropId }));
      void syncToRaindropImmediately();
      showToast('Snippet deleted', 'info');
    }
  };

  const handleToggleDisabled = async (rule: RunCodeRule) => {
    const updated = rules.map((r) => {
      if (r.id === rule.id) {
        return { ...r, disabled: !r.disabled };
      }
      return r;
    });
    await saveRulesToStorage(updated);
    await queueOperations(
      createWorkspaceOperation('RUN_CODE_UPDATE', rule.id, { disabled: !rule.disabled })
    );
    void syncToRaindropImmediately();
  };

  const handleExportSingleRule = (rule: RunCodeRule) => {
    try {
      const clean = rule.title.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 30) || 'snippet';
      const fileName = `arcable-run-${clean}.json`;
      const blob = new Blob([JSON.stringify(rule, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Exported ${fileName}`, 'success');
    } catch {
      showToast('Export failed', 'warning');
    }
  };

  const handleExportAllRules = () => {
    try {
      const blob = new Blob([JSON.stringify(rules, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `arcable-run-code-rules-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('All snippets exported', 'success');
    } catch {
      showToast('Export failed', 'warning');
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = String(event.target?.result || '');
        const parsed = JSON.parse(text);

        const { customCodeRules: extractedCustom, runCodeRules: extractedRun } =
          extractRulesFromNenyaExport(parsed);

        if (extractedCustom.length === 0 && extractedRun.length === 0) {
          showToast('No valid Run Code snippets or Custom JS/CSS rules found in JSON file.', 'warning');
          return;
        }

        let runAdded = 0;
        let customAdded = 0;
        const opsToQueue: WorkspaceOperation[] = [];

        if (extractedRun.length > 0) {
          const { merged, addedCount, addedRules } = mergeRunCodeRules(rules, extractedRun);
          await saveRulesToStorage(merged);
          runAdded = addedCount;
          for (const r of addedRules) {
            opsToQueue.push(createWorkspaceOperation('RUN_CODE_CREATE', r.id, r));
          }
        }

        if (extractedCustom.length > 0) {
          const storedCustom = await browser.storage.local.get('customCodeRules');
          const existingCustom = (storedCustom.customCodeRules as any[]) || [];
          const { merged: mergedCustom, addedCount, addedRules } = mergeCustomCodeRules(existingCustom, extractedCustom);
          await browser.storage.local.set({ customCodeRules: mergedCustom });
          customAdded = addedCount;
          for (const r of addedRules) {
            opsToQueue.push(createWorkspaceOperation('CUSTOM_CODE_CREATE', r.id, r));
          }
        }

        if (opsToQueue.length > 0) {
          await queueOperations(opsToQueue);
          void syncToRaindropImmediately();
        }

        if (runAdded > 0 && customAdded > 0) {
          showToast(`Imported ${runAdded} Run Code snippet(s) & ${customAdded} Custom JS/CSS rule(s) from Nenya export!`, 'success');
        } else if (runAdded > 0) {
          showToast(`Imported ${runAdded} Run Code snippet(s) successfully!`, 'success');
        } else {
          showToast(`Imported ${customAdded} Custom JS/CSS rule(s) successfully!`, 'success');
        }
      } catch (err: any) {
        showToast(`Import failed: ${err.message}`, 'warning');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <input
        type="file"
        ref={fileInputRef}
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleImportFile}
      />

      {/* User Scripts Permission Warning Banner */}
      {userScriptsAvailable === false && (
        <div
          style={{
            borderRadius: '16px',
            padding: '20px 24px',
            backgroundColor: isDark ? 'rgba(245, 158, 11, 0.1)' : '#fffbeb',
            border: isDark ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid #fde68a',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <span style={{ fontSize: '24px', lineHeight: 1 }}>⚠️</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: isDark ? '#fef3c7' : '#92400e',
                }}
              >
                "Allow user scripts" must be enabled to run code in page
              </div>
              <div
                style={{
                  fontSize: '13px',
                  lineHeight: '1.5',
                  color: isDark ? '#d1d5db' : '#78350f',
                }}
              >
                {isBrave()
                  ? 'Brave requires user scripts to be explicitly enabled for this extension before running custom JavaScript in pages.'
                  : isFirefox()
                  ? 'Firefox requires explicit permission to execute custom user scripts in web pages.'
                  : 'Chrome requires user scripts permission (or Developer Mode on older versions) before executing custom JavaScript in pages.'}
              </div>
            </div>
          </div>

          <div
            style={{
              padding: '12px 16px',
              borderRadius: '10px',
              backgroundColor: isDark ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.7)',
              border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #fcd34d',
              fontSize: '13px',
              lineHeight: '1.6',
              color: isDark ? '#f1f5f9' : '#1e293b',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '6px' }}>Quick 2-Step Setup:</div>
            <ol style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <li>
                Click <strong>"Open Extension Settings"</strong> below to view Arcable's extension details.
              </li>
              <li>
                Scroll down to locate the <strong>"Allow user scripts"</strong> toggle and turn it <strong>ON</strong>.
              </li>
            </ol>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <Button
              size="sm"
              variant="primary"
              onClick={async () => {
                await openExtensionDetailsPage();
              }}
              style={{
                backgroundColor: '#d97706',
                borderColor: '#d97706',
                fontWeight: 600,
              }}
            >
              ⚙️ Open Extension Settings
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => verifyUserScripts(false)}
              disabled={isCheckingScripts}
            >
              {isCheckingScripts ? 'Checking...' : '🔄 Recheck Status'}
            </Button>
          </div>
        </div>
      )}

      {/* Editor Card */}
      <Card
        title={editingRuleId ? 'Edit Run Code Snippet' : 'Create Run Code Snippet'}
        subtitle="Author manual snippets callable via right-click context menu, popup, or sidepanel with arcableFetch cross-origin capability."
        style={{ borderRadius: '16px', padding: '24px' }}
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {formError && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#fee2e2',
                color: isDark ? '#fca5a5' : '#b91c1c',
                fontSize: '13.5px',
                fontWeight: 500,
              }}
            >
              ⚠️ {formError}
            </div>
          )}

          {/* Title Input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13.5px', fontWeight: 600, color: isDark ? '#f8fafc' : '#0f172a' }}>
              Snippet Title
            </label>
            <input
              ref={titleInputRef}
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              placeholder="e.g. Extract Page Links, Unblur Elements, Raindrop Quick Sync..."
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '13.5px',
                border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                backgroundColor: isDark ? '#0f172a' : '#ffffff',
                color: isDark ? '#f8fafc' : '#0f172a',
                outline: 'none',
              }}
            />
          </div>

          {/* URL Patterns Tags Manager */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '13.5px', fontWeight: 600, color: isDark ? '#f8fafc' : '#0f172a' }}>
              Target URL Patterns
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={newPatternInput}
                onChange={(e) => setNewPatternInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddPattern();
                  }
                }}
                placeholder="e.g. *://*.github.com/* (leave empty / add *://*/* for all sites)"
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                  border: patternError
                    ? '1px solid #ef4444'
                    : isDark
                    ? '1px solid #334155'
                    : '1px solid #cbd5e1',
                  backgroundColor: isDark ? '#0f172a' : '#ffffff',
                  color: isDark ? '#f8fafc' : '#0f172a',
                  outline: 'none',
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={handleAddPattern}>
                + Add Pattern
              </Button>
            </div>
            {patternError && (
              <span style={{ fontSize: '12px', color: '#ef4444' }}>{patternError}</span>
            )}

            {/* Pattern Chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '26px' }}>
              {patterns.map((p, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    borderRadius: '16px',
                    backgroundColor: isDark ? '#1e293b' : '#e2e8f0',
                    border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
                    fontSize: '12px',
                    fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                    color: isDark ? '#38bdf8' : '#0369a1',
                  }}
                >
                  <span>{p}</span>
                  <button
                    type="button"
                    onClick={() => handleRemovePattern(idx)}
                    style={{
                      border: 'none',
                      background: 'none',
                      cursor: 'pointer',
                      fontSize: '12px',
                      color: isDark ? '#94a3b8' : '#64748b',
                      padding: '0 2px',
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {patterns.length === 0 && (
                <span style={{ fontSize: '12px', color: isDark ? '#94a3b8' : '#64748b', fontStyle: 'italic' }}>
                  No pattern restrictions (runs on all web pages).
                </span>
              )}
            </div>
          </div>

          {/* JavaScript Editor */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: '13.5px', fontWeight: 600, color: isDark ? '#f8fafc' : '#0f172a' }}>
                JavaScript Code (Supports async/await & arcableFetch)
              </label>
              <span style={{ fontSize: '12px', color: isDark ? '#94a3b8' : '#64748b' }}>
                CSP-exempt USER_SCRIPT context
              </span>
            </div>
            <CodeEditor
              value={code}
              onChange={setCode}
              mode="javascript"
              height="800px"
              placeholder="// Write your snippet here:&#10;const title = document.title;&#10;console.log('Active tab:', title);&#10;&#10;// Cross-origin fetch through extension background:&#10;const res = await arcableFetch('https://api.raindrop.io');&#10;console.log('Status:', res.status);"
            />
          </div>

          {/* Form Actions */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '4px' }}>
            <Button variant="primary" type="submit" disabled={isSaving}>
              {isSaving ? 'Saving...' : editingRuleId ? 'Save Changes' : 'Add Snippet'}
            </Button>
            {editingRuleId && (
              <Button variant="outline" type="button" onClick={resetForm} disabled={isSaving}>
                Cancel Edit
              </Button>
            )}
          </div>
        </form>
      </Card>

      {/* Snippets List Card */}
      <Card
        title={`Saved Snippets (${rules.length})`}
        subtitle="Snippets are executed via right-click context menu and popup."
        style={{ borderRadius: '16px', padding: '24px' }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '13px', color: isDark ? '#94a3b8' : '#64748b' }}>
            Snippets run automatically via right-click context menu or matching URL patterns.
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              📥 Import JSON
            </Button>
            {rules.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportAllRules}
              >
                📤 Export All
              </Button>
            )}
          </div>
        </div>

        {rules.length === 0 ? (
          <div
            style={{
              padding: '36px 20px',
              textAlign: 'center',
              borderRadius: '12px',
              border: isDark ? '1px dashed #334155' : '1px dashed #cbd5e1',
              color: isDark ? '#94a3b8' : '#64748b',
              fontSize: '14px',
            }}
          >
            No manual snippets created yet. Add a snippet above to run custom scripts with 1 click!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {rules.map((rule) => {
              return (
                <div
                  key={rule.id}
                  style={{
                    padding: '14px 18px',
                    borderRadius: '12px',
                    backgroundColor: isDark ? '#151e2e' : '#f8fafc',
                    border: isDark ? '1px solid #243247' : '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                    opacity: rule.disabled ? 0.55 : 1,
                    transition: 'opacity 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '240px', flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: isDark ? '#f8fafc' : '#0f172a' }}>
                        {rule.title}
                      </span>
                      {rule.disabled && <Badge variant="default">Disabled</Badge>}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {rule.patterns.length === 0 ? (
                        <span style={{ fontSize: '11.5px', color: isDark ? '#94a3b8' : '#64748b' }}>
                          All sites
                        </span>
                      ) : (
                        rule.patterns.map((p, i) => (
                          <span
                            key={i}
                            style={{
                              fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                              fontSize: '11px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              backgroundColor: isDark ? '#1e293b' : '#e2e8f0',
                              color: isDark ? '#94a3b8' : '#475569',
                            }}
                          >
                            {p}
                          </span>
                        ))
                      )}
                    </div>
                    {rule.updatedAt && (
                      <span style={{ fontSize: '11.5px', color: isDark ? '#64748b' : '#94a3b8' }}>
                        Updated: {formatDate(new Date(rule.updatedAt).getTime())}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {/* Toggle Switch */}
                    <label
                      title={rule.disabled ? 'Enable snippet' : 'Disable snippet'}
                      style={{
                        position: 'relative',
                        display: 'inline-block',
                        width: '38px',
                        height: '22px',
                        cursor: 'pointer',
                        marginRight: '6px',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={!rule.disabled}
                        onChange={() => handleToggleDisabled(rule)}
                        style={{ opacity: 0, width: 0, height: 0 }}
                      />
                      <span
                        style={{
                          position: 'absolute',
                          cursor: 'pointer',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          backgroundColor: !rule.disabled ? '#10b981' : isDark ? '#334155' : '#cbd5e1',
                          borderRadius: '34px',
                          transition: '0.2s',
                        }}
                      >
                        <span
                          style={{
                            position: 'absolute',
                            content: '""',
                            height: '16px',
                            width: '16px',
                            left: !rule.disabled ? '18px' : '3px',
                            bottom: '3px',
                            backgroundColor: '#ffffff',
                            borderRadius: '50%',
                            transition: '0.2s',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                          }}
                        />
                      </span>
                    </label>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditRule(rule)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDuplicateRule(rule)}
                    >
                      Copy
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleExportSingleRule(rule)}
                    >
                      Export
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteRule(rule)}
                      style={{ color: '#ef4444' }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
};
