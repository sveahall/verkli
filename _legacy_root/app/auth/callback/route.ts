import { createClient } from '../../../lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      // Get user to check their role
      const { data: { user } } = await supabase.auth.getUser()
      const role = user?.user_metadata?.role || 'reader'
      
      // Redirect based on role
      const redirectPath = role === 'writer' ? '/writer' : '/reader'
      return NextResponse.redirect(`${origin}${redirectPath}`)
    }
  }

  // Return to home if something went wrong
  return NextResponse.redirect(`${origin}/?error=auth`)
}
