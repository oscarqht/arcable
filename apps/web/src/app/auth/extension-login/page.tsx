'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export default function ExtensionLoginPage() {
  const [supabase, setSupabase] = useState<any>(null);
  const [status, setStatus] = useState<'idle' | 'authenticating' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      setStatus('error');
      setErrorMessage(
        'Supabase environment variables (NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY) are not configured.'
      );
      return;
    }

    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    setSupabase(client);

    // Check if user returned from OAuth redirect
    client.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        setStatus('error');
        setErrorMessage(error.message);
        return;
      }

      if (session) {
        handleSessionSuccess(session);
      }
    });

    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        handleSessionSuccess(session);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleSessionSuccess = (session: any) => {
    setStatus('success');
    setUserEmail(session.user?.email || null);

    const tokens = {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      user: {
        id: session.user?.id,
        email: session.user?.email,
        user_metadata: session.user?.user_metadata,
      },
    };

    // 1. Post message to current window for content-script oauth-bridge
    if (typeof window !== 'undefined') {
      window.postMessage(
        {
          type: 'oauth_success',
          provider: 'supabase',
          tokens,
        },
        window.location.origin
      );

      // 2. If extId query param present, also attempt direct chrome.runtime message
      const params = new URLSearchParams(window.location.search);
      const extId = params.get('extId');
      if (extId && typeof (window as any).chrome !== 'undefined' && (window as any).chrome?.runtime?.sendMessage) {
        try {
          (window as any).chrome.runtime.sendMessage(extId, {
            type: 'oauth_bridge_success',
            provider: 'supabase',
            tokens,
          }, () => {
            // Ignore callback error if receiver tab closed
          });
        } catch (e) {
          console.warn('Could not directly message extension runtime:', e);
        }
      }
    }
  };

  const handleGoogleLogin = async () => {
    if (!supabase) return;
    setStatus('authenticating');
    setErrorMessage(null);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: typeof window !== 'undefined' ? window.location.href : undefined,
        },
      });

      if (error) {
        setStatus('error');
        setErrorMessage(error.message);
      }
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err?.message || 'Failed to initialize Google Sign-In.');
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0f172a',
        color: '#f8fafc',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        padding: '24px',
      }}
    >
      <div
        style={{
          maxWidth: '440px',
          width: '100%',
          backgroundColor: '#1e293b',
          borderRadius: '20px',
          padding: '36px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🌌</div>
        <h1 style={{ fontSize: '22px', fontWeight: 600, margin: '0 0 8px 0', letterSpacing: '-0.02em' }}>
          Connect Arcable Cloud
        </h1>
        <p style={{ fontSize: '14px', color: '#94a3b8', margin: '0 0 28px 0', lineHeight: 1.5 }}>
          Sign in with your Google Account to synchronize your spaces, folders, and tabs across all devices.
        </p>

        {status === 'success' ? (
          <div
            style={{
              padding: '20px',
              backgroundColor: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              borderRadius: '12px',
            }}
          >
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>✅</div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#4ade80', margin: '0 0 6px 0' }}>
              Connected Successfully!
            </h3>
            {userEmail && (
              <p style={{ fontSize: '13px', color: '#cbd5e1', margin: '0 0 12px 0' }}>
                Signed in as <strong>{userEmail}</strong>
              </p>
            )}
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
              Your credentials have been transferred to Arcable. You can safely close this window now.
            </p>
          </div>
        ) : (
          <div>
            {errorMessage && (
              <div
                style={{
                  padding: '12px 16px',
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '10px',
                  color: '#f87171',
                  fontSize: '13px',
                  marginBottom: '20px',
                  textAlign: 'left',
                }}
              >
                {errorMessage}
              </div>
            )}

            <button
              onClick={handleGoogleLogin}
              disabled={status === 'authenticating'}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                padding: '12px 20px',
                backgroundColor: '#ffffff',
                color: '#1e293b',
                border: 'none',
                borderRadius: '12px',
                fontSize: '15px',
                fontWeight: 600,
                cursor: status === 'authenticating' ? 'not-allowed' : 'pointer',
                opacity: status === 'authenticating' ? 0.7 : 1,
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)',
                transition: 'all 0.15s ease',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              {status === 'authenticating' ? 'Signing in...' : 'Continue with Google'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
