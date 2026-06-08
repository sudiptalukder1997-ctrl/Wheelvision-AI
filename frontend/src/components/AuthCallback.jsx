import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function AuthCallback() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;
    const hash = window.location.hash || '';
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const sessionId = params.get('session_id');
    if (!sessionId) {
      navigate('/');
      return;
    }
    (async () => {
      try {
        const r = await api.post('/auth/session', { session_id: sessionId });
        setUser(r.data.user);
        window.history.replaceState({}, '', '/dashboard');
        navigate('/dashboard', { state: { user: r.data.user } });
      } catch (e) {
        navigate('/');
      }
    })();
  }, [navigate, setUser]);

  return (
    <div className="min-h-screen flex items-center justify-center text-foreground">
      <div className="text-center font-mono">
        <div className="text-2xl font-bold glow-text">CONNECTING…</div>
        <div className="text-sm text-muted-foreground mt-2">Authenticating with Google</div>
      </div>
    </div>
  );
}
