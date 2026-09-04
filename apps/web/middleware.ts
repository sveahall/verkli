import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isBetaUser, BetaCheckTransientError } from '@/lib/auth/beta'
import { getAuthorApplicationStatus } from '@/lib/auth/author-approval'
import { ACTIVE_ROLE_COOKIE } from '@/lib/active-role'
import { TA_FOR_ER_ORDER } from '@/lib/orders/ta-for-er'

// ---------------------------------------------------------------------------
// In-memory cache of `profiles.role` keyed by user id. Middleware otherwise
// fires a Supabase profile lookup on *every* request matched by the config
// (and `/author/*` triggers the fetch unconditionally). TTL is short enough
// that a role change propagates within a minute, long enough to absorb the
// prefetch storms a navigation produces.
// ---------------------------------------------------------------------------
/**
 * Sign-in has to stay reachable under BETA_LOCK, or the lock is a dead end: a
 * beta tester who is not already carrying a session gets bounced to /waitlist,
 * and every page that could log them in sits behind the same bounce. The `/auth`
 * prefix the lock already allows covers only the OAuth callback and the
 * reset-password screen — the actual forms live at these nine paths.
 *
 * Sign-up is open here on purpose. An account on its own grants nothing; the
 * `beta_enabled` flag in user_flags does. So people can register and be let in
 * afterwards, which is how you run a beta without handing out a shared password.
 *
 * Exact matches rather than a prefix test, so this cannot widen by accident.
 */
const BETA_LOCK_AUTH_PATHS: ReadonlySet<string> = new Set([
  '/signin',
  '/signup',
  '/forgot-password',
  '/reader/signin',
  '/reader/signup',
  '/reader/forgot-password',
  '/author/signin',
  '/author/signup',
  '/author/forgot-password',
])

/**
 * Products whose order routes are public by design and must survive BOTH site
 * locks. The book sale is the point of the waitlist page and is deliberately
 * open to anyone with the link — beta cohort or not.
 *
 * Read by both locks so they cannot drift apart. They already did once: the
 * waitlist lock was taught about `/order` on a side branch that never reached
 * `platform`, the beta lock was never taught at all, and the result was a page
 * that rendered fine with a buy button that silently failed.
 *
 * Membership is per *product*, not per path, so a new sub-page of an approved
 * product just works while an unregistered product stays locked. Registering
 * one is a deliberate act — see the `slug` field on the order constant.
 */
const PUBLIC_ORDER_SLUGS: ReadonlySet<string> = new Set([TA_FOR_ER_ORDER.slug])

const ORDER_PATH_PATTERN = /^\/(?:api\/)?order\/([^/]+)/

function isPublicOrderPath(pathname: string): boolean {
  const slug = ORDER_PATH_PATTERN.exec(pathname)?.[1]
  return slug !== undefined && PUBLIC_ORDER_SLUGS.has(slug)
}

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
  // CSRF protection: verify Origin / Sec-Fetch-Site on state-changing requests.
  //
  // Layered checks (any one of these must hold):
  //   (a) Sec-Fetch-Site is present and equals "same-origin" or "none"
  //       — this is browser-vouched and not forgeable from a cross-site form.
  //   (b) Origin header is present and matches NEXT_PUBLIC_SITE_URL.
  //
  // Fail-closed semantics: in production we require NEXT_PUBLIC_SITE_URL to be
  // set; if it isn't we reject with 500 rather than silently disabling CSRF.
  // -------------------------------------------------------------------------
  const method = request.method
  const isStateChanging = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE'
  if (isStateChanging) {
    const pathname = request.nextUrl.pathname
    // Stripe webhook has its own HMAC signature verification.
    const isStripeWebhook = pathname === '/api/stripe/webhook'
    if (!isStripeWebhook) {
      const secFetchSite = request.headers.get('sec-fetch-site')
      const origin = request.headers.get('origin')
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
      const isProduction = process.env.NODE_ENV === 'production'

      if (!siteUrl) {
        if (isProduction) {
          console.error('[csrf] NEXT_PUBLIC_SITE_URL is unset in production — refusing state-changing request')
          return new NextResponse(JSON.stringify({ error: 'ServerMisconfiguration' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        // In dev / test we allow the request through to keep local DX painless,
        // but Sec-Fetch-Site still gives us a layer of protection if present.
      }

      let expectedOrigin: string | null = null
      if (siteUrl) {
        try {
          expectedOrigin = new URL(siteUrl).origin
        } catch {
          if (isProduction) {
            console.error('[csrf] NEXT_PUBLIC_SITE_URL is malformed — refusing state-changing request')
            return new NextResponse(JSON.stringify({ error: 'ServerMisconfiguration' }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            })
          }
        }
      }

      // Sec-Fetch-Site is the strongest signal because the browser sets it
      // and it isn't sent on cross-site form submissions. Trust it when present.
      const sameOriginByFetchMetadata =
        secFetchSite === 'same-origin' || secFetchSite === 'none'
      const sameOriginByOrigin =
        !!(origin && expectedOrigin && origin === expectedOrigin)

      // If neither signal vouches for same-origin, reject. We only allow the
      // "no signal at all" case (no Sec-Fetch-Site, no Origin) when a non-browser
      // client is plausibly hitting the API outside production.
      const noBrowserSignals = !secFetchSite && !origin
      const allowed =
        sameOriginByFetchMetadata ||
        sameOriginByOrigin ||
        (!isProduction && noBrowserSignals)

      if (!allowed) {
        return new NextResponse(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }
  }

  const waitlistOnly = process.env.NEXT_PUBLIC_WAITLIST_ONLY === 'true'

  if (waitlistOnly) {
    // CAUTION: this allowlist is the ONLY gate for whatever it admits. An allowed
    // path returns NextResponse.next() at the bottom of this block without ever
    // initialising Supabase, so it never reaches the /author role check or the
    // /reader auth check further down the file. Every entry must therefore be
    // anchored and scoped to its own first path segment. isPublicOrderPath is
    // safe here only because ORDER_PATH_PATTERN is anchored at ^/ and requires
    // `order/` or `api/order/` as the first segment, so it cannot match an
    // /author or /reader path. A looser entry would serve those unauthenticated.
    const p = request.nextUrl.pathname
    const isWaitlist = p === '/waitlist' || p.startsWith('/waitlist/')
    const isApiWaitlist = p === '/api/waitlist' || p.startsWith('/api/waitlist/')
    // The book pre-order form lives ON the waitlist page, so its API and Stripe
    // return page have to come through the lock or the buy button dies silently.
    const isOrder = isPublicOrderPath(p)
    const isNext = p.startsWith('/_next/')
    const isKnownRoot = ['/favicon.ico', '/favicon.svg', '/robots.txt'].includes(p)
    const isRootAssetWithExt = /^\/[^/]+\.[a-z0-9]+$/i.test(p)

    const allowed =
      isWaitlist || isApiWaitlist || isOrder || isNext || isKnownRoot || isRootAssetWithExt
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

    const isAuthEntry = BETA_LOCK_AUTH_PATHS.has(p)

    // BETA_LOCK restricts the *platform* to invited users; the book sale is not
    // part of the platform. Without this an order POST 403s the moment the lock
    // goes on for the cohort — see PUBLIC_ORDER_SLUGS.
    const isOrderPath = isPublicOrderPath(p)

    const allowedPath = isWaitlist || isAuth || isAuthEntry || isApiWaitlist || isApiAuth || isOrderPath || isNext || isKnownRoot || isRootAssetWithExt
    // Only look up cohort membership when it can change the outcome. `isBeta` is
    // read once, in `!allowedPath && !isBeta` below, so on an allowed path the
    // result is discarded — and a transient failure of that lookup would 503 a
    // path we just decided is public, before `allowedPath` is ever consulted.
    // That would take the buy button down on a beta-locked site for any buyer
    // carrying a session, and dead-end the sign-in pages the auth allowlist
    // exists to keep reachable.
    let isBeta = false
    if (user && !allowedPath) {
      try {
        isBeta = await isBetaUser(supabase, user.id)
      } catch (err) {
        if (err instanceof BetaCheckTransientError) {
          console.error('[middleware] beta check transient error', {
            path: p,
            userId: user.id,
            error: err.message,
            cause: err.cause,
          })
          if (p.startsWith('/api/')) {
            return new NextResponse(
              JSON.stringify({ error: 'ServiceTemporarilyUnavailable' }),
              {
                status: 503,
                headers: {
                  'Content-Type': 'application/json',
                  'Retry-After': '15',
                },
              },
            )
          }
          return new NextResponse(
            'Service temporarily unavailable. Please try again in a moment.',
            {
              status: 503,
              headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Retry-After': '15',
              },
            },
          )
        }
        throw err
      }
    }

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
          secure: process.env.NODE_ENV === 'production',
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
