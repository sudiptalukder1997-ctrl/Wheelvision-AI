import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { TID } from '@/constants/testIds';
import { Button } from '@/components/ui/button';
import { Crown, LogOut, Activity, History, Users, LogIn } from 'lucide-react';

function NavBtn({ to, testid, icon: Icon, active, navigate, children }) {
  return (
    <button
      data-testid={testid}
      onClick={() => navigate(to)}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold tracking-[0.18em] uppercase rounded transition-all border ${
        active
          ? 'text-primary border-primary/40 bg-primary/10 glow-text'
          : 'text-muted-foreground border-transparent hover:border-white/10 hover:text-foreground'
      }`}
    >
      <Icon className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{children}</span>
    </button>
  );
}

export default function Header() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;

  const startLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + '/dashboard';
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-black/80 border-b border-white/10">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 flex items-center gap-2">
        <Link to={user ? '/dashboard' : '/'} className="flex items-center gap-2 mr-auto group">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-primary to-emerald-700 flex items-center justify-center font-display font-black text-black">
            W
          </div>
          <div className="leading-none">
            <div className="font-display font-black text-base tracking-tight text-foreground">
              WHEEL<span className="text-primary">VISION</span>
            </div>
            <div className="text-[9px] text-muted-foreground tracking-[0.3em] uppercase">
              Cricket Shot Analyser
            </div>
          </div>
        </Link>

        {user && (
          <nav className="flex items-center gap-1">
            <NavBtn to="/dashboard" testid={TID.navDashboard} icon={Activity} active={path === '/dashboard'} navigate={navigate}>Live</NavBtn>
            <NavBtn to="/history" testid={TID.navHistory} icon={History} active={path === '/history'} navigate={navigate}>History</NavBtn>
            <NavBtn to="/coach" testid={TID.navCoach} icon={Users} active={path === '/coach'} navigate={navigate}>Coach</NavBtn>
            <NavBtn to="/pricing" testid={TID.navPricing} icon={Crown} active={path === '/pricing'} navigate={navigate}>Tiers</NavBtn>
          </nav>
        )}

        {user ? (
          <div className="flex items-center gap-2 pl-2 ml-1 border-l border-white/10">
            <div className="hidden sm:flex flex-col items-end leading-tight">
              <div className="text-xs font-bold text-foreground">{user.name?.split(' ')[0]}</div>
              <div className="text-[10px] uppercase tracking-widest text-primary">{user.tier || 'free'}</div>
            </div>
            {user.picture ? (
              <img src={user.picture} alt="" className="w-8 h-8 rounded-full border border-primary/40" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-secondary border border-primary/40" />
            )}
            <Button
              data-testid={TID.logoutBtn}
              onClick={logout}
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground"
              aria-label="Logout"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <Button
            data-testid={TID.loginBtn}
            onClick={startLogin}
            className="bg-primary text-black hover:bg-primary/90 font-bold uppercase tracking-widest text-xs"
          >
            <LogIn className="w-4 h-4 mr-1.5" /> Sign in
          </Button>
        )}
      </div>
    </header>
  );
}
