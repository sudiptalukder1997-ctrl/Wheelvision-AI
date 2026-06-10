import React from 'react';
import '@/App.css';
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { Toaster } from '@/components/ui/sonner';
import Header from '@/components/Header';
import TestModeBanner from '@/components/TestModeBanner';
import AuthCallback from '@/components/AuthCallback';
import Landing from '@/pages/Landing';
import Dashboard from '@/pages/Dashboard';
import History from '@/pages/History';
import Coach from '@/pages/Coach';
import Pricing from '@/pages/Pricing';
import PaymentReturn from '@/pages/PaymentReturn';
import AdminPage from '@/pages/AdminPage';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-[40vh] flex items-center justify-center text-xs uppercase tracking-widest text-muted-foreground">
      Loading…
    </div>
  );
  if (!user) return <Navigate to="/" replace />;
  return children;
}

function OwnerRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/" replace />;
  if (user.role !== 'owner') return <Navigate to="/dashboard" replace />;
  return children;
}

function AppRouter() {
  const location = useLocation();
  if (location.hash?.includes('session_id=')) {
    return <AuthCallback />;
  }
  return (
    <>
      <TestModeBanner />
      <Header />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
        <Route path="/coach" element={<ProtectedRoute><Coach /></ProtectedRoute>} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/payment-return" element={<ProtectedRoute><PaymentReturn /></ProtectedRoute>} />
        <Route path="/admin" element={<OwnerRoute><AdminPage /></OwnerRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <div className="App min-h-screen">
      <BrowserRouter>
        <AuthProvider>
          <AppRouter />
          <Toaster position="top-center" theme="dark" />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}
