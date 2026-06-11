import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { api, shotTypeToAngle } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import WagonWheel from '@/components/WagonWheel';
import StatsPanel from '@/components/StatsPanel';
import ShotControls from '@/components/ShotControls';
import ShotLog from '@/components/ShotLog';
import RunDistribution from '@/components/RunDistribution';
import CoachingPanel from '@/components/CoachingPanel';
import LiveCamera from '@/components/LiveCamera';
import VideoAnalyzer from '@/components/VideoAnalyzer';
import { TID } from '@/constants/testIds';
import { Plus, Video, Camera, Share2, Sparkles, Zap } from 'lucide-react';

export default function Dashboard() {
  const { user, checkAuth } = useAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [shots, setShots] = useState([]);
  const [batterHand, setBatterHand] = useState('RH');
  const [shotType, setShotType] = useState('Drive');
  const [runs, setRuns] = useState(1);
  const [mode, setMode] = useState('manual');
  const [filter, setFilter] = useState(null);

  // Auth gate
  useEffect(() => {
    if (user === null) {
      const t = setTimeout(() => { if (!user) navigate('/'); }, 200);
      return () => clearTimeout(t);
    }
  }, [user, navigate]);

  // Load or create most recent session
  const loadOrCreate = useCallback(async () => {
    if (!user) return;
    try {
      const list = await api.get('/sessions');
      if (list.data.length > 0) {
        const s = list.data[0];
        setSession(s);
        setShots(s.shots || []);
        setBatterHand(s.batter_hand || 'RH');
      } else {
        const r = await api.post('/sessions', { name: 'Net Session', batter_hand: 'RH' });
        setSession(r.data);
        setShots([]);
      }
    } catch (err) {
      console.error('loadOrCreate failed', err);
    }
  }, [user]);

  useEffect(() => { loadOrCreate(); }, [loadOrCreate]);

  const newSession = async () => {
    try {
      const r = await api.post('/sessions', { name: `Net Session ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, batter_hand: batterHand });
      setSession(r.data);
      setShots([]);
      toast.success('New session started');
    } catch (err) {
      console.error('newSession failed', err);
      toast.error('Could not create session');
    }
  };

  // Update batter hand on server
  useEffect(() => {
    if (!session) return;
    if (session.batter_hand === batterHand) return;
    api.patch(`/sessions/${session.id}`, { batter_hand: batterHand }).catch(() => {});
  }, [batterHand, session]);

  const logShot = async (override) => {
    if (!session) return;
    const angle = override?.angle ?? shotTypeToAngle(shotType, batterHand);
    try {
      const r = await api.post(`/sessions/${session.id}/shots`, {
        runs,
        shot_type: shotType,
        x: 0.5,
        y: 0.5,
        angle,
      });
      setShots((p) => [...p, r.data]);
      toast.success(`+${runs} · ${shotType}`);
    } catch (e) {
      const status = e?.response?.status;
      const detail = e?.response?.data?.detail || 'Could not log shot';
      if (status === 402) {
        toast.error(detail);
        navigate('/pricing');
      } else {
        toast.error(detail);
      }
    }
  };

  const deleteShot = async (shotId) => {
    if (!session) return;
    await api.delete(`/sessions/${session.id}/shots/${shotId}`);
    setShots((p) => p.filter((s) => s.id !== shotId));
  };

  const clearAll = async () => {
    if (!session) return;
    if (!confirm('Clear all shots in this session?')) return;
    await api.post(`/sessions/${session.id}/shots/clear`);
    setShots([]);
    setSession((s) => ({ ...s, coaching: null }));
  };

  const onFieldClick = ({ angle }) => {
    logShot({ angle });
  };

  const setCoaching = (text) => setSession((s) => ({ ...s, coaching: text }));

  const shareSession = async () => {
    const total = shots.length;
    const tr = shots.reduce((a, s) => a + s.runs, 0);
    const sr = total ? ((tr / total) * 100).toFixed(1) : '0';
    const text = `WheelVision AI · ${total} balls, ${tr} runs, SR ${sr}`;
    const url = window.location.origin;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'WheelVision AI', text, url });
      } else {
        await navigator.clipboard.writeText(`${text} — ${url}`);
        toast.success('Copied share text to clipboard');
      }
    } catch (err) { console.error('share failed', err); }
  };

  const tier = user?.tier || 'free';
  const freeRemaining = tier === 'free' ? Math.max(0, 10 - shots.length) : Infinity;
  const isPro = tier === 'pro' || tier === 'academy';

  // Biomech profile (personal thresholds + AI accuracy)
  const [profile, setProfile] = useState({ personal_thresholds: {}, ai_accuracy: 0, total_predictions: 0 });
  const refreshProfile = useCallback(async () => {
    if (!user) return;
    try {
      const r = await api.get('/profile/biomech');
      setProfile(r.data);
    } catch (err) { console.error('refreshProfile failed', err); }
  }, [user]);
  useEffect(() => { refreshProfile(); }, [refreshProfile]);

  const [liveOpen, setLiveOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const onAutoShotLogged = (shot) => {
    setShots((p) => [...p, shot]);
    refreshProfile();
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="rec-dot" />
          <div className="text-[10px] uppercase tracking-[0.3em] text-primary font-bold">
            {session?.name || 'LIVE SESSION'}
          </div>
          {tier === 'free' && (
            <span className="ml-2 px-2 py-0.5 rounded border border-primary/30 text-[10px] uppercase tracking-widest text-primary">
              FREE · {freeRemaining} shots left
            </span>
          )}
          {isPro && (
            <span
              data-testid="ai-accuracy-badge"
              className="ml-1 px-2 py-0.5 rounded border border-primary/30 text-[10px] uppercase tracking-widest text-primary font-bold flex items-center gap-1"
              title="Improves as you correct AI predictions"
            >
              <Sparkles className="w-3 h-3" /> AI {profile.ai_accuracy || 0}% · {profile.total_predictions || 0} preds
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            data-testid={TID.newSessionBtn}
            onClick={newSession}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-white/10 hover:border-primary/40 text-[11px] font-bold uppercase tracking-widest"
          >
            <Plus className="w-3.5 h-3.5" /> New
          </button>
          <button
            data-testid={TID.shareBtn}
            onClick={shareSession}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-white/10 hover:border-primary/40 text-[11px] font-bold uppercase tracking-widest"
          >
            <Share2 className="w-3.5 h-3.5" /> Share
          </button>
        </div>
      </div>

      {/* Stats */}
      <StatsPanel shots={shots} />

      {/* Main grid: wheel + controls/log */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 broadcast-card p-3 sm:p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground font-bold">WAGON WHEEL</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {filter == null ? 'ALL SHOTS' : `FILTER · ${filter}s`}
            </div>
          </div>
          <WagonWheel shots={shots} batterHand={batterHand} filter={filter} onFieldClick={onFieldClick} selectedShotType={shotType} />
        </div>

        <div className="space-y-4">
          <ShotControls
            shotType={shotType}
            setShotType={setShotType}
            runs={runs}
            setRuns={setRuns}
            mode={mode}
            setMode={setMode}
            batterHand={batterHand}
            setBatterHand={setBatterHand}
            onLogShot={() => logShot()}
            onClear={clearAll}
            canLog={!!session}
          />
          <RunDistribution shots={shots} filter={filter} setFilter={setFilter} />
        </div>
      </div>

      {/* Shot log + Coaching */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ShotLog shots={shots} onDelete={deleteShot} />
        <CoachingPanel session={session} shots={shots} tier={tier} onUpdated={setCoaching} />
      </div>

      {/* Auto-detect entry points (MoveNet Thunder) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="broadcast-card p-3 sm:p-4 relative overflow-hidden group">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground font-bold">VIDEO ANALYSER · MOVENET THUNDER</div>
            {isPro ? null : <span className="text-[10px] uppercase tracking-widest text-primary">PRO</span>}
          </div>
          <div className="aspect-video bg-black rounded border border-white/10 flex items-center justify-center relative overflow-hidden">
            <Video className="w-12 h-12 text-primary/60" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent pointer-events-none" />
          </div>
          <div className="mt-2 text-[10px] text-muted-foreground">Upload a 1–3 min batting clip · auto-detected shots draw the wagon wheel for you.</div>
          <button
            data-testid={TID.uploadVideoBtn}
            onClick={() => (isPro ? setVideoOpen(true) : navigate('/pricing'))}
            className="mt-3 w-full py-2 rounded bg-primary text-black font-black uppercase tracking-widest text-xs hover:bg-primary/90 flex items-center justify-center gap-1.5"
          >
            <Zap className="w-3.5 h-3.5" /> {isPro ? 'UPLOAD & ANALYSE' : 'UPGRADE TO PRO'}
          </button>
        </div>
        <div className="broadcast-card p-3 sm:p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground font-bold">LIVE CAMERA · POSE DETECT</div>
            {isPro ? null : <span className="text-[10px] uppercase tracking-widest text-primary">PRO</span>}
          </div>
          <div className="aspect-video bg-black rounded border border-white/10 flex items-center justify-center relative overflow-hidden">
            <Camera className="w-12 h-12 text-primary/60" />
            <div className="absolute top-2 right-2 flex items-center gap-1 text-[10px] uppercase tracking-widest text-red-400">
              <div className="rec-dot" /> READY
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent pointer-events-none" />
          </div>
          <div className="mt-2 text-[10px] text-muted-foreground">Film side-on · MoveNet Thunder detects every swing live and logs the shot automatically.</div>
          <button
            data-testid={TID.liveCameraBtn}
            onClick={() => (isPro ? setLiveOpen(true) : navigate('/pricing'))}
            className="mt-3 w-full py-2 rounded bg-primary text-black font-black uppercase tracking-widest text-xs hover:bg-primary/90 flex items-center justify-center gap-1.5"
          >
            <Zap className="w-3.5 h-3.5" /> {isPro ? 'START LIVE CAMERA' : 'UPGRADE TO PRO'}
          </button>
        </div>
      </div>

      {/* Auto-detect modals */}
      <LiveCamera
        open={liveOpen}
        onClose={() => setLiveOpen(false)}
        session={session}
        batterHand={batterHand}
        onShotLogged={onAutoShotLogged}
        personalThresholds={profile.personal_thresholds}
        aiAccuracy={profile.ai_accuracy}
        defaultCameraView={profile.camera_view || 'side'}
      />
      <VideoAnalyzer
        open={videoOpen}
        onClose={() => setVideoOpen(false)}
        session={session}
        batterHand={batterHand}
        onAnalysisComplete={() => { loadOrCreate(); refreshProfile(); }}
        personalThresholds={profile.personal_thresholds}
        userName={user?.name}
        defaultCameraView={profile.camera_view || 'side'}
        minVelocityThreshold={profile.min_velocity_threshold || 0}
      />
    </div>
  );
}
