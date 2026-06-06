import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import type { Database } from '../infrastructure/supabase/types';

type UserProfile = Database['public']['Tables']['users']['Row'];

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  setSession: (session: Session | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  signOut: () => void;
}

// DEV ONLY — flip to true to skip the login screen on the simulator (e.g. when
// VPN blocks Supabase auth). Seeds a fake session + profile; Supabase data calls
// will still fail offline, but the UI renders. MUST be false before committing.
export const DEV_BYPASS_AUTH = __DEV__ && false;

export const DEV_FAKE_USER = {
  id: '00000000-0000-0000-0000-000000000001',
} as unknown as User;

export const DEV_FAKE_PROFILE = {
  id: '00000000-0000-0000-0000-000000000001',
  handle: 'devuser',
  display_name: 'Dev User',
  avatar_url: null,
  created_at: new Date().toISOString(),
  invite_code_used: null,
} as unknown as UserProfile;

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  profile: null,
  isLoading: true,
  setSession: (session) => set({ session, user: session?.user ?? null }),
  setProfile: (profile) => set({ profile }),
  setLoading: (isLoading) => set({ isLoading }),
  signOut: () => set({ session: null, user: null, profile: null }),
}));
