import React, { useState, useEffect, useRef } from 'react';
import { Card, Button, Badge } from '@arcable/shared/components';
import { CustomCodeRule, WorkspaceOperation } from '@arcable/shared/types';
import {
  isValidUrlPattern,
  normalizeCustomCodeRules,
  generateRuleId,
  sortCustomCodeRules,
  formatDate,
  extractRulesFromNenyaExport,
  mergeCustomCodeRules,
  mergeRunCodeRules,
  createWorkspaceOperation,
} from '@arcable/shared/utils';
import { browser } from '../../utils/browser';
import { CodeEditor } from './CodeEditor';

const STORAGE_KEY = 'customCodeRules';

interface CustomCodeTabProps {
  isDark: boolean;
  showToast: (msg: string, type?: 'info' | 'success' | 'warning') => void;
  initialPattern?: string;
  onClearInitialPattern?: () => void;
}

export const CustomCodeTab: React.FC<CustomCodeTabProps> = ({
  isDark,
  showToast,
  initialPattern,
  onClearInitialPattern,
}) => {
  const [rules, setRules] = useState<CustomCodeRule[]>([]);
  const [patternInput, setPatternInput] = useState('');
  const [cssCode, setCssCode] = useState('');
  const [jsCode, setJsCode] = useState('');
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [selectedRule, setSelectedRule] = useState<CustomCodeRule | null>(null);
  const [activeCodeTab, setActiveCodeTab] = useState<'css' | 'js'>('css');
  const [patternError, setPatternError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const patternInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadRules();

    const handleStorageChange = (changes: any, area: string) => {
      if (area === 'local' && changes[STORAGE_KEY]) {
        const { rules: normalized } = normalizeCustomCodeRules(changes[STORAGE_KEY].newValue);
        setRules(normalized);
      }
    };
    browser.storage.onChanged.addListener(handleStorageChange);
    return () => {
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  // Handle prefill pattern if provided
  useEffect(() => {
    if (initialPattern) {
      setPatternInput(initialPattern);
      patternInputRef.current?.focus();
      onClearInitialPattern?.();
    }
  }, [initialPattern]);

  const loadRules = async () => {
    try {
      const stored = await browser.storage.local.get(STORAGE_KEY);
      const { rules: normalized, mutated } = normalizeCustomCodeRules(stored[STORAGE_KEY]);
      setRules(normalized);
      if (mutated) {
        await browser.storage.local.set({ [STORAGE_KEY]: normalized });
      }
    } catch (err) {
      console.warn('[CustomCodeTab] Failed to load rules:', err);
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
      console.warn('[CustomCodeTab] Failed to queue operations:', e);
    }
  };

  const saveRulesToStorage = async (newRules: CustomCodeRule[]) => {
    const sorted = sortCustomCodeRules(newRules);
    setRules(sorted);
    await browser.storage.local.set({ [STORAGE_KEY]: sorted });
  };

  const handlePatternChange = (val: string) => {
    setPatternInput(val);
    if (!val.trim()) {
      setPatternError(null);
      return;
    }
    if (isValidUrlPattern(val.trim())) {
      setPatternError(null);
    } else {
      setPatternError('Invalid URL pattern. Example: https://*.example.com/* or *://example.com/*');
    }
  };

  const resetForm = () => {
    setEditingRuleId(null);
    setPatternInput('');
    setCssCode('');
    setJsCode('');
    setPatternError(null);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanPattern = patternInput.trim();
    if (!cleanPattern) {
      setFormError('Please enter a URL pattern.');
      return;
    }

    if (!isValidUrlPattern(cleanPattern)) {
      setFormError('Please enter a valid URL pattern.');
      return;
    }

    if (!cssCode.trim() && !jsCode.trim()) {
      setFormError('Please provide at least CSS or JavaScript code.');
      return;
    }

    const now = new Date().toISOString();

    if (editingRuleId) {
      const updated = rules.map((r) => {
        if (r.id === editingRuleId) {
          return {
            ...r,
            pattern: cleanPattern,
            css: cssCode,
            js: jsCode,
            updatedAt: now,
          };
        }
        return r;
      });
      await saveRulesToStorage(updated);
      await queueOperations(
        createWorkspaceOperation('CUSTOM_CODE_UPDATE', editingRuleId, {
          pattern: cleanPattern,
          css: cssCode,
          js: jsCode,
        })
      );
      showToast('Rule updated successfully!', 'success');
    } else {
      const newRule: CustomCodeRule = {
        id: generateRuleId('cjc'),
        pattern: cleanPattern,
        css: cssCode,
        js: jsCode,
        disabled: false,
        createdAt: now,
        updatedAt: now,
      };
      await saveRulesToStorage([...rules, newRule]);
      await queueOperations(createWorkspaceOperation('CUSTOM_CODE_CREATE', newRule.id, newRule));
      showToast('Rule created successfully!', 'success');
    }

    resetForm();
  };

  const handleEditRule = (rule: CustomCodeRule) => {
    setEditingRuleId(rule.id);
    setPatternInput(rule.pattern);
    setCssCode(rule.css || '');
    setJsCode(rule.js || '');
    setPatternError(null);
    setFormError(null);
    if (rule.css?.trim() && !rule.js?.trim()) {
      setActiveCodeTab('css');
    } else if (rule.js?.trim() && !rule.css?.trim()) {
      setActiveCodeTab('js');
    }
    patternInputRef.current?.scrollIntoView({ behavior: 'smooth' });
    patternInputRef.current?.focus();
  };

  const handleDuplicateRule = async (rule: CustomCodeRule) => {
    const now = new Date().toISOString();
    const dup: CustomCodeRule = {
      ...rule,
      id: generateRuleId('cjc'),
      pattern: `${rule.pattern}*`,
      createdAt: now,
      updatedAt: now,
    };
    await saveRulesToStorage([...rules, dup]);
    await queueOperations(createWorkspaceOperation('CUSTOM_CODE_CREATE', dup.id, dup));
    showToast('Rule duplicated!', 'info');
  };

  const handleDeleteRule = async (rule: CustomCodeRule) => {
    if (window.confirm(`Delete rule for "${rule.pattern}"?`)) {
      const remaining = rules.filter((r) => r.id !== rule.id);
      if (editingRuleId === rule.id) resetForm();
      if (selectedRule?.id === rule.id) setSelectedRule(null);
      await saveRulesToStorage(remaining);
      await queueOperations(createWorkspaceOperation('CUSTOM_CODE_DELETE', rule.id));
      showToast('Rule deleted', 'info');
    }
  };

  const handleToggleDisabled = async (rule: CustomCodeRule) => {
    const updated = rules.map((r) => {
      if (r.id === rule.id) {
        return { ...r, disabled: !r.disabled };
      }
      return r;
    });
    await saveRulesToStorage(updated);
    await queueOperations(
      createWorkspaceOperation('CUSTOM_CODE_UPDATE', rule.id, { disabled: !rule.disabled })
    );
  };

  const handleExportSingleRule = (rule: CustomCodeRule) => {
    try {
      const cleanHost = rule.pattern.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 30) || 'rule';
      const fileName = `arcable-cjc-${cleanHost}.json`;
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
      a.download = `arcable-custom-code-rules-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('All rules exported', 'success');
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
          showToast('No valid Custom JS/CSS or Run Code rules found in JSON file.', 'warning');
          return;
        }

        let customAdded = 0;
        let runAdded = 0;
        const opsToQueue: WorkspaceOperation[] = [];

        if (extractedCustom.length > 0) {
          const { merged, addedCount, addedRules } = mergeCustomCodeRules(rules, extractedCustom);
          await saveRulesToStorage(merged);
          customAdded = addedCount;
          for (const r of addedRules) {
            opsToQueue.push(createWorkspaceOperation('CUSTOM_CODE_CREATE', r.id, r));
          }
        }

        if (extractedRun.length > 0) {
          const storedRun = await browser.storage.local.get('runCodeInPageRules');
          const existingRun = (storedRun.runCodeInPageRules as any[]) || [];
          const { merged: mergedRun, addedCount, addedRules } = mergeRunCodeRules(existingRun, extractedRun);
          await browser.storage.local.set({ runCodeInPageRules: mergedRun });
          runAdded = addedCount;
          for (const r of addedRules) {
            opsToQueue.push(createWorkspaceOperation('RUN_CODE_CREATE', r.id, r));
          }
        }

        if (opsToQueue.length > 0) {
          await queueOperations(opsToQueue);
        }

        if (customAdded > 0 && runAdded > 0) {
          showToast(`Imported ${customAdded} Custom JS/CSS rule(s) & ${runAdded} Run Code snippet(s) from Nenya export!`, 'success');
        } else if (customAdded > 0) {
          showToast(`Imported ${customAdded} Custom JS/CSS rule(s) successfully!`, 'success');
        } else {
          showToast(`Imported ${runAdded} Run Code snippet(s) successfully!`, 'success');
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
      {/* Hidden File Input for JSON Import */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleImportFile}
      />

      {/* Editor Form Card */}
      <Card
        title={editingRuleId ? 'Edit Custom JS & CSS Rule' : 'Create Custom JS & CSS Rule'}
        subtitle="Automatically inject stylesheets and scripts into web pages matching a URL pattern."
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

          {/* Pattern Input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13.5px', fontWeight: 600, color: isDark ? '#f8fafc' : '#0f172a' }}>
              URL Pattern (URLPattern API)
            </label>
            <input
              ref={patternInputRef}
              type="text"
              value={patternInput}
              onChange={(e) => handlePatternChange(e.target.value)}
              placeholder="e.g. *://*.github.com/* or https://example.com/docs/*"
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '13.5px',
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
            {patternError ? (
              <span style={{ fontSize: '12px', color: '#ef4444' }}>{patternError}</span>
            ) : (
              <span style={{ fontSize: '12px', color: isDark ? '#94a3b8' : '#64748b' }}>
                Standard URLPattern format. Wildcards (*) and named wildcards supported.
              </span>
            )}
          </div>

          {/* Code Sub-Tabs (CSS / JavaScript) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setActiveCodeTab('css')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: 'none',
                    backgroundColor: activeCodeTab === 'css' ? (isDark ? '#38bdf8' : '#0284c7') : isDark ? '#1e293b' : '#f1f5f9',
                    color: activeCodeTab === 'css' ? '#ffffff' : isDark ? '#94a3b8' : '#64748b',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>🎨 CSS</span>
                  {cssCode.trim() && <Badge variant="info">Added</Badge>}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCodeTab('js')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: 'none',
                    backgroundColor: activeCodeTab === 'js' ? (isDark ? '#38bdf8' : '#0284c7') : isDark ? '#1e293b' : '#f1f5f9',
                    color: activeCodeTab === 'js' ? '#ffffff' : isDark ? '#94a3b8' : '#64748b',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>⚡ JavaScript</span>
                  {jsCode.trim() && <Badge variant="info">Added</Badge>}
                </button>
              </div>
              <span style={{ fontSize: '12px', color: isDark ? '#94a3b8' : '#64748b' }}>
                {activeCodeTab === 'css' ? 'Injected into page <head>' : 'Executed on document_idle in page context'}
              </span>
            </div>

            {activeCodeTab === 'css' ? (
              <CodeEditor
                value={cssCode}
                onChange={setCssCode}
                mode="css"
                height="240px"
                placeholder="/* Add custom CSS styles here */&#10;body {&#10;  filter: grayscale(20%);&#10;}"
              />
            ) : (
              <CodeEditor
                value={jsCode}
                onChange={setJsCode}
                mode="javascript"
                height="240px"
                placeholder="// Add custom JavaScript here&#10;console.log('Arcable Custom JS initialized on:', window.location.href);"
              />
            )}
          </div>

          {/* Form Actions */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '4px' }}>
            <Button variant="primary" type="submit">
              {editingRuleId ? 'Save Changes' : 'Add Rule'}
            </Button>
            {editingRuleId && (
              <Button variant="outline" type="button" onClick={resetForm}>
                Cancel Edit
              </Button>
            )}
          </div>
        </form>
      </Card>

      {/* Saved Rules List Card */}
      <Card
        title={`Saved Rules (${rules.length})`}
        subtitle="Manage, toggle, or export your automatic injection rules."
        style={{ borderRadius: '16px', padding: '24px' }}
      >
        {/* Bulk Action Toolbar */}
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
            Rules apply automatically whenever you visit matching URLs.
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
            No custom rules configured yet. Create a rule above to style or customize any website!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {rules.map((rule) => {
              const hasCss = Boolean(rule.css?.trim());
              const hasJs = Boolean(rule.js?.trim());
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
                      <span
                        style={{
                          fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                          fontSize: '13.5px',
                          fontWeight: 600,
                          color: isDark ? '#38bdf8' : '#0284c7',
                        }}
                      >
                        {rule.pattern}
                      </span>
                      {hasCss && <Badge variant="info">CSS</Badge>}
                      {hasJs && <Badge variant="warning">JS</Badge>}
                      {rule.disabled && <Badge variant="default">Disabled</Badge>}
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
                      title={rule.disabled ? 'Enable rule' : 'Disable rule'}
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
                      onClick={() => setSelectedRule(selectedRule?.id === rule.id ? null : rule)}
                    >
                      {selectedRule?.id === rule.id ? 'Close' : 'View'}
                    </Button>
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

      {/* Rule Detail View Card */}
      {selectedRule && (
        <Card
          title={`Rule Preview: ${selectedRule.pattern}`}
          subtitle={`Inspect code for rule ${selectedRule.id}`}
          style={{ borderRadius: '16px', padding: '24px', animation: 'fadeIn 0.2s ease-out' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {selectedRule.css?.trim() && (
              <div>
                <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: isDark ? '#94a3b8' : '#64748b' }}>
                  Custom CSS:
                </h4>
                <CodeEditor
                  value={selectedRule.css}
                  onChange={() => {}}
                  mode="css"
                  readOnly={true}
                  height="160px"
                />
              </div>
            )}
            {selectedRule.js?.trim() && (
              <div>
                <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: isDark ? '#94a3b8' : '#64748b' }}>
                  Custom JavaScript:
                </h4>
                <CodeEditor
                  value={selectedRule.js}
                  onChange={() => {}}
                  mode="javascript"
                  readOnly={true}
                  height="160px"
                />
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedRule(null)}
              >
                Close Preview
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
