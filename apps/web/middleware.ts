import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isBetaUser } from '@/lib/auth/beta'
import { getPublicEnv } from '@/lib/env'

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

  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getPublicEnv()
  const supabase = createServerClient(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY,
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
  // Beta lock (FAS 5): when BETA_LOCK=true, only /waitlist and /auth allowed
  // unless user has beta_enabled in user_flags.
  // -------------------------------------------------------------------------
  const betaLock = process.env.BETA_LOCK === 'true'
  if (betaLock) {
    const p = request.nextUrl.pathname
    const isWaitlist = p === '/waitlist' || p.startsWith('/waitlist/')
    const isAuth = p === '/auth' || p.startsWith('/auth/')
    const isApiWaitlist = p === '/api/waitlist' || p.startsWith('/api/waitlist/')
    const isApiAuth = p === '/api/auth' || p.startsWith('/api/auth/')
    const isNext = p.startsWith('/_next/')
    const isKnownRoot = ['/favicon.ico', '/favicon.svg', '/robots.txt'].includes(p)
    const isRootAssetWithExt = /^\/[^/]+\.[a-z0-9]+$/i.test(p)

    const allowedPath = isWaitlist || isAuth || isApiWaitlist || isApiAuth || isNext || isKnownRoot || isRootAssetWithExt
    const isBeta = user ? await isBetaUser(supabase, user.id) : false

    if (!allowedPath && !isBeta) {
      if (p.startsWith('/api/')) {
        return new NextResponse(JSON.stringify({ error: 'Beta access required' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      const url = request.nextUrl.clone()
      url.pathname = '/waitlist'
      return NextResponse.redirect(url, 307)
    }
  }

  // -------------------------------------------------------------------------
  // Route protection: /author/* and /reader/* require authentication
  // (excluding auth pages and public landing pages)
  // -------------------------------------------------------------------------
  const pathname = request.nextUrl.pathname

  // author routes that don't require auth
  const isAuthorPublic = pathname === '/author' || // public landing page
                         pathname.startsWith('/author/signin') ||
                         pathname.startsWith('/author/signup') ||
                         pathname.startsWith('/author/forgot-password')

  // Reader routes that don't require auth (MVP: anon browsing for public content)
  const isReaderBrowse = pathname.startsWith('/reader/books/') ||
                         pathname.startsWith('/reader/read/') ||
                         pathname === '/reader/discover' ||
                         pathname.startsWith('/reader/discover') ||
                         pathname.startsWith('/reader/authors/')
  const isReaderPublic = pathname === '/reader' || // public landing page
                         pathname === '/reader/app' ||
                         pathname === '/reader/faq' ||
                         pathname === '/reader/how-it-works' ||
                         pathname === '/reader/membership' ||
                         pathname.startsWith('/reader/signin') ||
                         pathname.startsWith('/reader/signup') ||
                         pathname.startsWith('/reader/forgot-password') ||
                         isReaderBrowse

  // Protect all /author/* routes except public ones
  if (pathname.startsWith('/author') && !isAuthorPublic && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/author/signin'
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
