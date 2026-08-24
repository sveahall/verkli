'use client'

import { createClient } from './client'

const supabase = createClient()

export async function signUp(email: string, password: string, role: 'author' | 'reader') {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        role,
      },
      // Without this, Supabase builds the confirmation link from its configured
      // Site URL (the app root), so the link never visits /auth/callback — the
      // only place that consumes and clears the `verkli_next` cookie. The
      // destination a buyer signed up to reach was therefore always dropped on
      // the email path, even though the cookie was written correctly.
      // signInWithGoogle below already does this for the OAuth path.
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  })
  return { data, error }
}

export async function signIn(email: string, password: string, _persistSession: boolean = true) {
  void _persistSession;
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  return { data, error }
}

export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  })
  return { data, error }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  return { error }
}

export async function getUser() {
  const { data: { user }, error } = await supabase.auth.getUser()
  return { user, error }
}

export async function resetPassword(email: string) {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset-password`,
  })
  return { data, error }
}
