import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type Profile = Database['public']['Tables']['profiles']['Row'];
type AppRole = Database['public']['Enums']['app_role'];

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: AppRole[];
  isLoading: boolean;
  isAuthenticated: boolean;
  hasRole: (role: AppRole) => boolean;
  hasAnyRole: (roles: AppRole[]) => boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

async function fetchProfile(userId: string): Promise<Profile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  } catch {
    return null;
  }
}

async function fetchRoles(userId: string): Promise<AppRole[]> {
  try {
    // We need to check each role individually since direct table access is blocked
    const roles: AppRole[] = [];
    for (const role of ['owner', 'manager', 'staff'] as AppRole[]) {
      const { data: hasIt } = await supabase.rpc('has_role', { _user_id: userId, _role: role });
      if (hasIt) roles.push(role);
    }
    return roles;
  } catch {
    return [];
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const initHandled = useRef(false);

  const clearAuthState = useCallback(() => {
    setSession(null);
    setUser(null);
    setProfile(null);
    setRoles([]);
  }, []);

  const loadUserData = useCallback(async (currentUser: User) => {
    const [p, r] = await Promise.all([fetchProfile(currentUser.id), fetchRoles(currentUser.id)]);
    setProfile(p);
    setRoles(r);
  }, []);

  const validateSession = useCallback(async (currentSession: Session | null) => {
    if (!currentSession?.access_token) {
      return null;
    }

    const { data: userData, error: userError } = await supabase.auth.getUser(currentSession.access_token);
    if (!userError && userData.user) {
      return currentSession;
    }

    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshed.session?.access_token || !refreshed.session.user) {
      return null;
    }

    const { data: refreshedUser, error: refreshedUserError } = await supabase.auth.getUser(refreshed.session.access_token);
    if (refreshedUserError || !refreshedUser.user) {
      return null;
    }

    return refreshed.session;
  }, []);

  const applySession = useCallback(async (currentSession: Session | null) => {
    const validSession = await validateSession(currentSession);

    if (!validSession?.user) {
      clearAuthState();
      return;
    }

    setSession(validSession);
    setUser(validSession.user);
    await loadUserData(validSession.user);
  }, [clearAuthState, loadUserData, validateSession]);

  useEffect(() => {
    let active = true;

    // 1. Get existing session first
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      if (initHandled.current || !active) return;
      initHandled.current = true;

      await applySession(s);
      if (active) {
        setIsLoading(false);
      }
    }).catch(() => {
      if (!initHandled.current && active) {
        initHandled.current = true;
        clearAuthState();
        setIsLoading(false);
      }
    });

    // 2. Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'INITIAL_SESSION') {
        // Already handled by getSession above
        return;
      }

      if (s?.user) {
        setSession(s);
        setUser(s.user);
        loadUserData(s.user).finally(() => active && setIsLoading(false));
      } else {
        clearAuthState();
        if (active) {
          setIsLoading(false);
        }
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [applySession, clearAuthState, loadUserData]);

  const hasRole = useCallback((role: AppRole) => roles.includes(role), [roles]);
  const hasAnyRole = useCallback((r: AppRole[]) => r.some(role => roles.includes(role)), [roles]);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // force local cleanup
      clearAuthState();
    }
  }, [clearAuthState]);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    await loadUserData(user);
  }, [user, loadUserData]);

  return (
    <AuthContext.Provider value={{
      user, session, profile, roles,
      isLoading,
      isAuthenticated: !!session && !!user,
      hasRole, hasAnyRole, signOut, refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
