import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Ordningen är kritisk: waitlist-låset måste avgöras och eventuellt returnera
 * redirect INNAN Supabase initieras. Annars körs createServerClient och
 * auth.getUser() även för blockade requests, vilket vi inte vill när hela
 * appen är låst. Därför: först path-check + redirect eller next(), först
 * därefter (endast när låset är av) Supabase.
 */
export async function middleware(request: NextRequest) {
  const waitlistOnly = process.env.NEXT_PUBLIC_WAITLIST_ONLY === 'true'

  if (waitlistOnly) {
    const p = request.nextUrl.pathname
    const isWaitlist = p === '/waitlist' || p.startsWith('/waitlist/')
    const isApiWaitlist = p === '/api/waitlist' || p.startsWith('/api/waitlist/')
    const isNext = p.startsWith('/_next/')
    const isKnownRoot = ['/favicon.ico', '/favicon.svg', '/robots.txt'].includes(p)
    const isRootAssetWithExt = /^\/[^/]+\.[a-z0-9]+$/i.test(p)

    const allowed = isWaitlist || isApiWaitlist || isNext || isKnownRoot || isRootAssetWithExt
    if (!allowed) {
      const url = request.nextUrl.clone()
      url.pathname = '/waitlist'
      return NextResponse.redirect(url, 307)
    }
    // Tillåten path när låset är på: returnera next direkt. Supabase ska aldrig köras här.
    return NextResponse.next()
  }

  // -------------------------------------------------------------------------
  // När waitlist-låset är av: Supabase auth (session/cookies) som vanligt.
  // -------------------------------------------------------------------------
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // -------------------------------------------------------------------------
  // Route protection: /writer/* and /reader/* require authentication
  // (excluding auth pages and public landing pages)
  // -------------------------------------------------------------------------
  const pathname = request.nextUrl.pathname

  // Writer routes that don't require auth
  const isWriterPublic = pathname === '/writer' || // public landing page
                         pathname.startsWith('/writer/signin') || 
                         pathname.startsWith('/writer/signup') || 
                         pathname.startsWith('/writer/forgot-password')
  
  // Reader routes that don't require auth
  const isReaderPublic = pathname === '/reader' || // public landing page
                         pathname === '/reader/app' || 
                         pathname === '/reader/faq' || 
                         pathname === '/reader/how-it-works' || 
                         pathname === '/reader/membership' || 
                         pathname.startsWith('/reader/signin') || 
                         pathname.startsWith('/reader/signup') || 
                         pathname.startsWith('/reader/forgot-password')

  // Protect all /writer/* routes except public ones
  if (pathname.startsWith('/writer') && !isWriterPublic && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/writer/signin'
    return NextResponse.redirect(url)
  }

  // Protect all /reader/* routes except public ones
  if (pathname.startsWith('/reader') && !isReaderPublic && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/reader/signin'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

// Kör middleware på alla paths utom _next/static och _next/image
export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
