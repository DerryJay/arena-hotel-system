import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AuthPanel } from './components/AuthPanel';
import { Dashboard } from './components/Dashboard';
import { demoDashboardData } from './lib/mockData';
import { supabase } from './lib/supabase';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setSession(data.session);
        setIsLoadingSession(false);
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsDemo(false);
    });

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    if (isDemo || !supabase) {
      setIsDemo(false);
      return;
    }

    await supabase.auth.signOut();
  }

  if (isLoadingSession) {
    return <main className="loading-screen">Loading Arena Hotel System</main>;
  }

  if (!session && !isDemo) {
    return <AuthPanel onDemo={() => setIsDemo(true)} />;
  }

  return <Dashboard data={demoDashboardData} isDemo={isDemo} onSignOut={handleSignOut} />;
}

