import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isBetaUser } from '@/lib/auth/beta'
import { getAuthorApplicationStatus } from '@/lib/auth/author-approval'
import { ACTIVE_ROLE_COOKIE } from '@/lib/active-role'

// ---------------------------------------------------------------------------
// In-memory cache of `profiles.role` keyed by user id. Middleware otherwise
// fires a Supabase profile lookup on *every* request matched by the config
// (and `/author/*` triggers the fetch unconditionally). TTL is short enough
// that a role change propagates within a minute, long enough to absorb the
// prefetch storms a navigation produces.
// ---------------------------------------------------------------------------
const AUTHOR_ROLE_CACHE_TTL_MS = 60_000
const AUTHOR_ROLE_CACHE_MAX = 512
type CachedRoleEntry = { role: string; expiresAt: number }
const authorRoleCache = new Map<string, CachedRoleEntry>()

function readCachedAuthorRole(userId: string): string | null {
  const entry = authorRoleCache.get(userId)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    authorRoleCache.delete(userId)
    return null
  }
  return entry.role
}

function writeCachedAuthorRole(userId: string, role: string): void {
  if (authorRoleCache.size >= AUTHOR_ROLE_CACHE_MAX) {
    const first = authorRoleCache.keys().next().value
    if (first) authorRoleCache.delete(first)
  }
  authorRoleCache.set(userId, { role, expiresAt: Date.now() + AUTHOR_ROLE_CACHE_TTL_MS })
}

/**
 * Ordningen är kritisk: waitlist-låset måste avgöras och eventuellt returnera
 * redirect INNAN Supabase initieras. Annars körs createServerClient och
 * auth.getUser() även för blockade requests, vilket vi inte vill när hela
 * appen är låst. Därför: först path-check + redirect eller next(), först
 * därefter (endast när låset är av) Supabase.
 */
export async function middleware(request: NextRequest) {
  // -------------------------------------------------------------------------
  // CSRF protection: verify Origin header on state-changing requests.
  // -------------------------------------------------------------------------
  const method = request.method
  const isStateChanging = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE'
  if (isStateChanging) {
    const origin = request.headers.get('origin')
    const pathname = request.nextUrl.pathname
    // Skip Stripe webhook — it uses its own signature verification.
    // Strict equality: no sub-route should auto-inherit the CSRF exemption.
    const isStripeWebhook = pathname === '/api/stripe/webhook'
    // Only enforce when Origin header is present (same-origin requests may omit it)
    if (origin && !isStripeWebhook) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
      if (siteUrl) {
        let allowed = false
        try {
          const expectedOrigin = new URL(siteUrl).origin
          allowed = origin === expectedOrigin
        } catch {
          // If NEXT_PUBLIC_SITE_URL is malformed, reject for safety
          allowed = false
        }
        if (!allowed) {
          return new NextResponse(JSON.stringify({ error: 'Forbidden' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      }
    }
  }

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
  // Author routes additionally require author role
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
  if (pathname.startsWith('/author') && !isAuthorPublic) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/author/signin'
      return NextResponse.redirect(url)
    }

    // SECURITY: Only trust profiles.role from DB — user_metadata is client-writable.
    // Use a short-lived process-local cache to avoid a DB round-trip on every
    // request (prefetches, RSC payloads, API calls under /author). TTL is tight
    // enough that flipping a role propagates within a minute.
    let profileRole = readCachedAuthorRole(user.id)
    if (profileRole == null) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle()
      profileRole = String(profile?.role ?? '').trim().toLowerCase()
      writeCachedAuthorRole(user.id, profileRole)
    }
    const isAuthorOrAdmin = profileRole === 'author' || profileRole === 'admin'

    if (!isAuthorOrAdmin) {
      const status = await getAuthorApplicationStatus(supabase, user.id)
      const shouldRedirect = status !== 'approved'
      if (shouldRedirect) {
        const url = request.nextUrl.clone()
        url.pathname = '/reader/home'
        url.searchParams.set('error', 'author_required')
        const response = NextResponse.redirect(url)
        response.cookies.set(ACTIVE_ROLE_COOKIE, 'reader', {
          path: '/',
          sameSite: 'lax',
          maxAge: 31536000,
        })
        return response
      }
    }
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
