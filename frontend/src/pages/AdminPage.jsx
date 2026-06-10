import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Shield, Users, Activity, Crown, Sparkles, ChevronDown, RefreshCw, Loader2 } from 'lucide-react';

const TIER_OPTIONS = [
  { value: 'free', label: 'FREE' },
  { value: 'pro', label: 'PRO' },
  { value: 'academy', label: 'ACADEMY' },
];

export default function AdminPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [impersonateBusy, setImpersonateBusy] = useState(false);

  useEffect(() => {
    if (user === null) return;
    if (user && user.role !== 'owner') {
      toast.error('Owner access required');
      navigate('/dashboard');
    }
  }, [user, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [u, s] = await Promise.all([api.get('/admin/users'), api.get('/admin/stats')]);
      setUsers(u.data || []);
      setStats(s.data || null);
    } catch (err) {
      console.error('admin load failed', err);
      toast.error('Could not load admin data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (user?.role === 'owner') load(); }, [user, load]);

  const setUserTier = async (uid, tier) => {
    setBusyId(uid);
    try {
      const r = await api.patch(`/admin/users/${uid}`, { tier });
      setUsers((prev) => prev.map((u) => (u.user_id === uid ? r.data : u)));
      toast.success(`Tier set to ${tier.toUpperCase()}`);
    } catch (err) {
      console.error('tier update failed', err);
      toast.error(err?.response?.data?.detail || 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  const setUserRole = async (uid, role) => {
    setBusyId(uid);
    try {
      const r = await api.patch(`/admin/users/${uid}`, { role });
      setUsers((prev) => prev.map((u) => (u.user_id === uid ? r.data : u)));
      toast.success(`Role set to ${role.toUpperCase()}`);
    } catch (err) {
      console.error('role update failed', err);
      toast.error(err?.response?.data?.detail || 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  const impersonate = async (tier) => {
    setImpersonateBusy(true);
    try {
      const r = await api.post('/admin/impersonate', { tier });
      setUser(r.data);
      setUsers((prev) => prev.map((u) => (u.user_id === r.data.user_id ? { ...u, ...r.data } : u)));
      toast.success(tier ? `Viewing as ${tier.toUpperCase()} user` : 'Owner access restored');
    } catch (err) {
      console.error('impersonate failed', err);
      toast.error('Could not switch test mode');
    } finally {
      setImpersonateBusy(false);
    }
  };

  if (user?.role !== 'owner') {
    return (
      <div className="max-w-md mx-auto p-6 text-center text-xs text-muted-foreground uppercase tracking-widest">
        Owner access required
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 py-6 space-y-5">
      {/* header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-primary font-bold flex items-center gap-1.5">
            <Shield className="w-3 h-3" /> OWNER · ADMIN
          </div>
          <h2 className="font-display font-black text-3xl sm:text-4xl tracking-tighter">CONTROL ROOM</h2>
        </div>
        <button data-testid="admin-refresh-btn" onClick={load} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-white/10 hover:border-primary/40 text-[11px] uppercase tracking-widest">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      {/* stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {stats && [
          { label: 'USERS', value: stats.users, icon: Users },
          { label: 'OWNERS', value: stats.owners, icon: Shield },
          { label: 'PRO', value: stats.pro_users, icon: Sparkles },
          { label: 'ACADEMY', value: stats.academy_users, icon: Crown },
          { label: 'SESSIONS', value: stats.sessions, icon: Activity },
          { label: 'PREDICTIONS', value: stats.predictions, icon: Activity },
          { label: 'PAID', value: stats.transactions, icon: Sparkles },
        ].map((s) => (
          <div key={s.label} className="broadcast-card p-3" data-testid={`admin-stat-${s.label.toLowerCase()}`}>
            <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground font-bold flex items-center gap-1">
              <s.icon className="w-3 h-3 text-primary" /> {s.label}
            </div>
            <div className="font-display font-black text-2xl tabular-nums mt-1 text-foreground">{s.value}</div>
          </div>
        ))}
      </div>

      {/* impersonation */}
      <div className="broadcast-card p-4 space-y-3 border-primary/30">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-primary font-bold">DEV / TESTING</div>
          <div className="font-display font-bold text-foreground tracking-tight">Act as a paying tier</div>
          <div className="text-[11px] text-muted-foreground mt-1">
            Owner bypass is <span className="text-primary font-bold">suspended</span> while you impersonate — you'll hit the real 10-shot limit and 402 paywalls. A red banner appears at the top until you exit.
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">CURRENT:</div>
          <span className="px-2 py-0.5 rounded border border-primary/40 text-[10px] uppercase tracking-widest text-primary font-bold">
            {user.impersonate_tier ? `IMPERSONATING ${user.impersonate_tier}` : 'OWNER (full access)'}
          </span>
          <div className="flex items-center gap-1.5 ml-auto">
            {TIER_OPTIONS.map((t) => (
              <button
                key={t.value}
                data-testid={`impersonate-${t.value}-btn`}
                onClick={() => impersonate(t.value)}
                disabled={impersonateBusy || user.impersonate_tier === t.value}
                className={`px-2.5 py-1.5 rounded text-[11px] font-black uppercase tracking-widest border transition-all disabled:opacity-50 ${
                  user.impersonate_tier === t.value
                    ? 'bg-primary text-black border-primary'
                    : 'border-white/15 text-foreground hover:border-primary/40 hover:bg-white/5'
                }`}
              >
                ACT AS {t.label}
              </button>
            ))}
            <button
              data-testid="impersonate-clear-btn"
              onClick={() => impersonate(null)}
              disabled={impersonateBusy || !user.impersonate_tier}
              className="px-2.5 py-1.5 rounded text-[11px] font-black uppercase tracking-widest bg-destructive text-white hover:bg-destructive/90 disabled:opacity-40"
            >
              EXIT
            </button>
          </div>
        </div>
      </div>

      {/* users table */}
      <div className="broadcast-card overflow-hidden">
        <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground font-bold">USERS · {users.length}</div>
          {loading && <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead className="bg-white/[0.02]">
              <tr className="text-left text-muted-foreground uppercase tracking-widest text-[10px]">
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Tier</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2 text-right">Sessions</th>
                <th className="px-3 py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isMe = u.user_id === user.user_id;
                const rowBusy = busyId === u.user_id;
                return (
                  <tr key={u.user_id} data-testid={`admin-user-${u.user_id}`} className="border-t border-white/5 hover:bg-white/[0.02]">
                    <td className="px-3 py-2">
                      <div className="font-bold text-foreground flex items-center gap-1.5">
                        {u.name || u.email}
                        {u.role === 'owner' && <Shield className="w-3 h-3 text-primary" />}
                        {isMe && <span className="px-1 py-0.5 rounded bg-primary/20 text-primary text-[9px] uppercase tracking-widest">YOU</span>}
                      </div>
                      <div className="text-[10px] text-muted-foreground">{u.email}</div>
                    </td>
                    <td className="px-3 py-2">
                      <TierSelect
                        value={u.tier || 'free'}
                        disabled={rowBusy}
                        onChange={(v) => setUserTier(u.user_id, v)}
                        testid={`tier-select-${u.user_id}`}
                      />
                      {u.impersonate_tier && (
                        <div className="text-[9px] uppercase tracking-widest text-red-400 mt-0.5">acting as {u.impersonate_tier}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        data-testid={`role-select-${u.user_id}`}
                        value={u.role || 'user'}
                        disabled={rowBusy || isMe}
                        onChange={(e) => setUserRole(u.user_id, e.target.value)}
                        className="bg-black border border-white/15 rounded px-2 py-1 text-xs text-foreground uppercase tracking-widest disabled:opacity-50"
                      >
                        <option value="user">USER</option>
                        <option value="owner">OWNER</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{u.session_count ?? 0}</td>
                    <td className="px-3 py-2 text-muted-foreground text-[10px]">{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                  </tr>
                );
              })}
              {!loading && users.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-xs text-muted-foreground">No users yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TierSelect({ value, onChange, disabled, testid }) {
  return (
    <div className="relative inline-block">
      <select
        data-testid={testid}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-black border border-white/15 rounded pl-2 pr-6 py-1 text-xs text-foreground uppercase tracking-widest disabled:opacity-50"
      >
        {TIER_OPTIONS.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>
      <ChevronDown className="w-3 h-3 text-muted-foreground absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none" />
    </div>
  );
}
