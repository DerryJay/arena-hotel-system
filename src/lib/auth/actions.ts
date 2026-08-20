'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../supabase/server';

export interface LoginActionState {
  message: string;
}

export async function loginAction(_previousState: LoginActionState, formData: FormData): Promise<LoginActionState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { message: 'Enter your email and password.' };
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return { message: 'Supabase is not configured for this deployment.' };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { message: 'Invalid email or password.' };
  }

  redirect('/dashboard');
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase?.auth.signOut();
  redirect('/login');
}
