import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSupabaseClient } from './client';

describe('createSupabaseClient fallback mode', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('persists a demo session when Supabase env vars are missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');

    const supabase = createSupabaseClient();
    const signInResult = await supabase.auth.signInWithPassword({
      email: 'demo@example.com',
      password: 'demo1234',
    });
    const { data: sessionData } = await supabase.auth.getSession();

    expect(signInResult.error).toBeNull();
    expect(sessionData.session?.user?.email).toBe('demo@example.com');
  });
});
