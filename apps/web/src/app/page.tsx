'use client';

import React, { useState, useEffect } from 'react';
import { Header, Card, Button, Badge, RaindropAuthCard } from '@arcable/shared/components';
import { formatDate, generateId } from '@arcable/shared/utils';
import { ArcableItem, RaindropAuthState } from '@arcable/shared/types';
import { useLocalStorage } from '@arcable/shared/hooks';

export default function HomePage() {
  const [items, setItems] = useLocalStorage<ArcableItem[]>('arcable_web_items', [
    {
      id: 'demo_1',
      title: 'Welcome to Arcable Monorepo',
      url: 'https://arcable.dev',
      description: 'Unified Next.js web application and cross-browser extension workspace.',
      tags: ['Getting Started', 'Monorepo'],
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
            authType: 'oauth', // Or personal token
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

  const handleDeleteItem = (id: string) => {
    setItems(items.filter((item: ArcableItem) => item.id !== id));
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
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

      <main style={{ maxWidth: '960px', width: '100%', margin: '32px auto', padding: '0 16px', boxSizing: 'border-box' }}>
        <div style={{ marginBottom: '32px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em', marginBottom: '8px' }}>
            Arcable Monorepo Hub
          </h1>
          <p style={{ fontSize: '16px', color: '#64748b' }}>
            Unified workspace with dual Raindrop OAuth & API Token integration.
          </p>
        </div>

        {/* Raindrop Authentication Card */}
        <div style={{ marginBottom: '24px' }}>
          <RaindropAuthCard
            authState={authState}
            isLoading={authLoading}
            errorMessage={authError}
            onLoginWithToken={handleLoginWithToken}
            onLoginWithOAuth={handleLoginWithOAuth}
            onLogout={handleLogout}
            onClearError={() => setAuthError(null)}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', alignItems: 'start' }}>
          {/* New Item Form */}
          <Card title="Add New Item" subtitle="Create an item using shared logic">
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
                Add Item
              </Button>
            </form>
          </Card>

          {/* Architecture Status */}
          <Card title="Monorepo Packages" subtitle="Active workspace modules">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 600, fontSize: '14px' }}>apps/web</span>
                  <Badge variant="success">Next.js 15</Badge>
                </div>
                <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                  Web client and management dashboard with Raindrop OAuth & Token API routes.
                </p>
              </div>

              <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 600, fontSize: '14px' }}>apps/extension</span>
                  <Badge variant="info">Chrome + Firefox</Badge>
                </div>
                <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                  MV3 browser extension with popup, background service, and dual Raindrop authentication.
                </p>
              </div>

              <div style={{ padding: '12px', borderRadius: '6px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 600, fontSize: '14px' }}>packages/shared</span>
                  <Badge variant="default">React + TS</Badge>
                </div>
                <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                  Shared Raindrop client, AuthCard UI, hooks, utilities, and TypeScript types.
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Item List */}
        <div style={{ marginTop: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
              Items ({items.length})
            </h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {items.map((item: ArcableItem) => (
              <Card
                key={item.id}
                title={item.title}
                subtitle={item.url}
                extra={
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {authState.isAuthenticated && item.url && (
                      <Button
                        variant="outline"
                        size="sm"
                        isLoading={savingRaindropId === item.id}
                        onClick={() => handleSyncToRaindrop(item)}
                      >
                        ☁️ Save to Raindrop
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteItem(item.id)} style={{ color: '#ef4444' }}>
                      Delete
                    </Button>
                  </div>
                }
              >
                {item.description && (
                  <p style={{ fontSize: '14px', color: '#475569', marginBottom: '12px' }}>{item.description}</p>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {item.tags.map((t: string) => (
                      <Badge key={t} variant="info">
                        {t}
                      </Badge>
                    ))}
                  </div>
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>{formatDate(item.createdAt)}</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
