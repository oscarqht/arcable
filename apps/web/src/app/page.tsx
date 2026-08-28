'use client';

import React, { useState, useEffect } from 'react';
import { Header, Card, Button, Badge, RaindropAuthCard, WorkspaceManager } from '@arcable/shared/components';
import { formatDate, generateId } from '@arcable/shared/utils';
import { ArcableItem, RaindropAuthState } from '@arcable/shared/types';
import { useLocalStorage } from '@arcable/shared/hooks';

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<'workspace' | 'raindrop' | 'info'>('workspace');

  // Legacy Arcable quick items state for Raindrop sync test
  const [items, setItems] = useLocalStorage<ArcableItem[]>('arcable_web_items', [
    {
      id: 'demo_1',
      title: 'Welcome to Arcable Workspace',
      url: 'https://arcable.dev',
      description: 'Unified browser workspace and Next.js web application with Spaces, Folders, and Tabs.',
      tags: ['Getting Started', 'Workspace'],
      createdAt: Date.now() - 3600000,
      updatedAt: Date.now() - 3600000,
      starred: true,
    },
  ]);

  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [tag, setTag] = useState('');
  const [saveToRaindrop, setSaveToRaindrop] = useState(true);

  // Raindrop Auth State
  const [authState, setAuthState] = useState<RaindropAuthState>({
    isAuthenticated: false,
  });
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [savingRaindropId, setSavingRaindropId] = useState<string | null>(null);

  // Load auth status from API on mount
  useEffect(() => {
    // Check URL parameters for OAuth status or errors
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const err = params.get('error');
      if (err) {
        setAuthError(decodeURIComponent(err));
        window.history.replaceState({}, '', window.location.pathname);
      }
      const auth = params.get('auth');
      if (auth === 'success') {
        window.history.replaceState({}, '', window.location.pathname);
      }
    }

    fetchAuthState();
  }, []);

  const fetchAuthState = async () => {
    setAuthLoading(true);
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.isAuthenticated && data.user) {
          setAuthState({
            isAuthenticated: true,
            user: data.user,
            accessToken: data.token,
            authType: 'oauth',
          });
        } else {
          setAuthState({ isAuthenticated: false });
        }
      }
    } catch (e) {
      console.error('Failed to fetch auth state:', e);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLoginWithToken = async (token: string) => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const res = await fetch('/api/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to authenticate token');
      }

      setAuthState({
        isAuthenticated: true,
        user: data.user,
        accessToken: data.token,
        authType: 'token',
      });
    } catch (err: any) {
      setAuthError(err.message || 'Token authentication failed');
      throw err;
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLoginWithOAuth = () => {
    setAuthError(null);
    window.location.href = '/api/auth/login';
  };

  const handleLogout = async () => {
    setAuthLoading(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setAuthState({ isAuthenticated: false });
    } catch (e) {
      console.error('Logout error:', e);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newItem: ArcableItem = {
      id: generateId('web'),
      title: title.trim(),
      url: url.trim() || undefined,
      tags: tag.trim() ? [tag.trim()] : ['Web'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setItems([newItem, ...items]);

    // If connected to Raindrop and URL exists, save to Raindrop
    if (authState.isAuthenticated && url.trim() && saveToRaindrop) {
      try {
        await fetch('/api/raindrop/bookmarks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: newItem.title,
            link: newItem.url,
            tags: newItem.tags,
          }),
        });
      } catch (err) {
        console.warn('Failed to sync item to Raindrop:', err);
      }
    }

    setTitle('');
    setUrl('');
    setTag('');
  };

  const handleSyncToRaindrop = async (item: ArcableItem) => {
    if (!item.url) return;
    setSavingRaindropId(item.id);
    try {
      const res = await fetch('/api/raindrop/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: item.title,
          link: item.url,
          tags: item.tags,
        }),
      });
      if (res.ok) {
        alert(`Saved "${item.title}" to Raindrop!`);
      } else {
        const data = await res.json();
        alert(`Raindrop sync error: ${data.error || 'Failed'}`);
      }
    } catch (e: any) {
      alert(`Error saving to Raindrop: ${e.message}`);
    } finally {
      setSavingRaindropId(null);
    }
  };

  const handleSyncWorkspace = async (syncParams?: {
    localState: any;
    deviceId: string;
    pendingOps: any[];
  }) => {
    try {
      const res = await fetch('/api/raindrop/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: authState.accessToken,
          deviceName: 'Arcable Web App',
          localState: syncParams?.localState,
          deviceId: syncParams?.deviceId,
          pendingOps: syncParams?.pendingOps,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to sync with Raindrop');
      }
      return data;
    } catch (err: any) {
      console.error('Workspace sync error:', err);
      throw err;
    }
  };

  const handleDeleteItem = (id: string) => {
    setItems(items.filter((item: ArcableItem) => item.id !== id));
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc' }}>
      <Header
        title="Arcable"
        badgeText="Web App"
        badgeVariant="success"
        actions={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {authState.isAuthenticated && authState.user && (
              <span style={{ fontSize: '13px', color: '#64748b' }}>
                Signed in as <strong>{authState.user.name}</strong>
              </span>
            )}
            <Button size="sm" variant="outline" onClick={() => window.open('https://github.com', '_blank')}>
              GitHub
            </Button>
          </div>
        }
      />

      <main style={{ maxWidth: '1040px', width: '100%', margin: '28px auto', padding: '0 16px', boxSizing: 'border-box' }}>
        {/* Hero Header */}
        <div style={{ marginBottom: '24px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em', marginBottom: '6px' }}>
            Arcable Workspace Hub
          </h1>
          <p style={{ fontSize: '15px', color: '#64748b', margin: 0 }}>
            Unified hierarchy with Spaces, Folders & Tabs stored locally in a single JSON structure.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '24px' }}>
          <button
            onClick={() => setActiveTab('workspace')}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              border: activeTab === 'workspace' ? '1px solid #0284c7' : '1px solid #e2e8f0',
              backgroundColor: activeTab === 'workspace' ? '#0284c7' : '#ffffff',
              color: activeTab === 'workspace' ? '#ffffff' : '#475569',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              boxShadow: activeTab === 'workspace' ? '0 2px 6px rgba(2,132,199,0.25)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            🗂️ Workspace (Spaces & Folders)
          </button>
          <button
            onClick={() => setActiveTab('raindrop')}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              border: activeTab === 'raindrop' ? '1px solid #0284c7' : '1px solid #e2e8f0',
              backgroundColor: activeTab === 'raindrop' ? '#0284c7' : '#ffffff',
              color: activeTab === 'raindrop' ? '#ffffff' : '#475569',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              boxShadow: activeTab === 'raindrop' ? '0 2px 6px rgba(2,132,199,0.25)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            💧 Raindrop.io Sync
          </button>
          <button
            onClick={() => setActiveTab('info')}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              border: activeTab === 'info' ? '1px solid #0284c7' : '1px solid #e2e8f0',
              backgroundColor: activeTab === 'info' ? '#0284c7' : '#ffffff',
              color: activeTab === 'info' ? '#ffffff' : '#475569',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              boxShadow: activeTab === 'info' ? '0 2px 6px rgba(2,132,199,0.25)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            📦 Architecture
          </button>
        </div>

        {/* Tab 1: Workspace Management (Spaces, Folders, Tabs CRUD) */}
        {activeTab === 'workspace' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <WorkspaceManager
              showJsonInspector={true}
              raindropToken={authState.accessToken}
              onSyncRaindrop={authState.isAuthenticated ? handleSyncWorkspace : undefined}
            />
          </div>
        )}

        {/* Tab 2: Raindrop Sync */}
        {activeTab === 'raindrop' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <RaindropAuthCard
              authState={authState}
              isLoading={authLoading}
              errorMessage={authError}
              onLoginWithToken={handleLoginWithToken}
              onLoginWithOAuth={handleLoginWithOAuth}
              onLogout={handleLogout}
              onClearError={() => setAuthError(null)}
            />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
              <Card title="Quick Sync Bookmark" subtitle="Create bookmark and sync to Raindrop">
                <form onSubmit={handleAddItem} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#334155', marginBottom: '4px' }}>
                      Title
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Research Arcable Features"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        fontSize: '14px',
                        boxSizing: 'border-box',
                      }}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#334155', marginBottom: '4px' }}>
                      URL (Optional)
                    </label>
                    <input
                      type="url"
                      placeholder="https://..."
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        fontSize: '14px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#334155', marginBottom: '4px' }}>
                      Tag
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Design, Productivity"
                      value={tag}
                      onChange={(e) => setTag(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        fontSize: '14px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  {authState.isAuthenticated && url.trim() && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        id="saveToRaindrop"
                        checked={saveToRaindrop}
                        onChange={(e) => setSaveToRaindrop(e.target.checked)}
                      />
                      <label htmlFor="saveToRaindrop" style={{ fontSize: '13px', color: '#334155' }}>
                        Sync directly to Raindrop.io
                      </label>
                    </div>
                  )}

                  <Button type="submit" variant="primary" style={{ marginTop: '8px' }}>
                    Add Bookmark
                  </Button>
                </form>
              </Card>

              <Card title="Raindrop Quick Bookmarks" subtitle={`Saved items (${items.length})`}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '340px', overflowY: 'auto' }}>
                  {items.map((item: ArcableItem) => (
                    <div
                      key={item.id}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '6px',
                        border: '1px solid #e2e8f0',
                        backgroundColor: '#ffffff',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: '13px', color: '#0f172a' }}>{item.title}</strong>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {authState.isAuthenticated && item.url && (
                            <Button
                              variant="outline"
                              size="sm"
                              isLoading={savingRaindropId === item.id}
                              onClick={() => handleSyncToRaindrop(item)}
                              style={{ fontSize: '11px', padding: '2px 6px', height: '22px' }}
                            >
                              ☁️ Sync
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteItem(item.id)}
                            style={{ color: '#ef4444', fontSize: '11px', padding: '2px 6px', height: '22px' }}
                          >
                            ✕
                          </Button>
                        </div>
                      </div>
                      {item.url && (
                        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>{item.url}</div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* Tab 3: Architecture Info */}
        {activeTab === 'info' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            <Card title="Monorepo Packages" subtitle="Active workspace modules">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>apps/web</span>
                    <Badge variant="success">Next.js 15</Badge>
                  </div>
                  <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                    Web client and management dashboard with interactive Spaces, Folders, and Tabs hierarchy.
                  </p>
                </div>

                <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>apps/extension</span>
                    <Badge variant="info">Sidepanel + Popup</Badge>
                  </div>
                  <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                    MV3 browser extension with Sidepanel view, active tab capture, and unified local storage persistence.
                  </p>
                </div>

                <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>packages/shared</span>
                    <Badge variant="default">React + TS</Badge>
                  </div>
                  <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                    Shared types, Workspace CRUD hooks, UI components, modals, and single-JSON storage managers.
                  </p>
                </div>
              </div>
            </Card>

            <Card title="Data Model & Schema" subtitle="Relationships & single-JSON local storage structure">
              <div style={{ fontSize: '13px', color: '#334155', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <strong>Space:</strong> <code>[id, name, emojiIcon?, colors?]</code>
                </div>
                <div>
                  <strong>Folder:</strong> <code>[id, name, customEmojiIcon?, colors?, parentFolderId?, parentSpaceId]</code>
                </div>
                <div>
                  <strong>Tab:</strong> <code>[id, url, pinned, customTitle?, customEmojiIcon?, parentFolderId?, parentSpaceId]</code>
                </div>
                <div style={{ backgroundColor: '#f1f5f9', padding: '8px', borderRadius: '6px', fontSize: '12px', color: '#475569' }}>
                  Stored in <code>localStorage</code> under <code>&apos;arcable_workspace_data&apos;</code> as a single JSON object containing <code>{'{ spaces, folders, tabs, activeSpaceId }'}</code>.
                </div>
              </div>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
