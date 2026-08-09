import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/** Path prefixes that make up the internal admin area. */
function isAdminPath(p: string): boolean {
  return p === '/admin' || p.startsWith('/admin/') || p.startsWith('/api/admin/')
}

/**
 * Constant-time string comparison. `crypto.timingSafeEqual` is Node-only and
 * middleware runs on the Edge runtime, so this is done by hand. The loop always
 * runs over the longer of the two strings so its length leaks nothing about
 * where the first mismatch is.
 */
function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return diff === 0
}

/**
 * HTTP Basic auth for the admin review area. Returns a response when the
 * request should be blocked, or null when it may continue.
 *
 * Fails closed: with no credentials configured the area is unreachable rather
 * than open. Credentials must be ASCII — atob decodes latin1.
 */
function guardAdmin(request: NextRequest): NextResponse | null {
  const expectedUser = process.env.ADMIN_BASIC_AUTH_USER
  const expectedPassword = process.env.ADMIN_BASIC_AUTH_PASSWORD

  if (!expectedUser || !expectedPassword) {
    return new NextResponse('Admin access is not configured.', { status: 503 })
  }

  const header = request.headers.get('authorization') ?? ''
  const [scheme, encoded] = header.split(' ')

  if (scheme === 'Basic' && encoded) {
    try {
      const decoded = atob(encoded)
      const separator = decoded.indexOf(':')
      if (separator !== -1) {
        const user = decoded.slice(0, separator)
        const password = decoded.slice(separator + 1)
        if (safeEqual(user, expectedUser) && safeEqual(password, expectedPassword)) {
          return null
        }
      }
    } catch {
      // Malformed credentials fall through to the challenge below.
    }
  }

  return new NextResponse('Authentication required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Verkli admin", charset="UTF-8"',
    },
  })
}

/**
 * Ordningen är kritisk: waitlist-låset måste avgöras och eventuellt returnera
 * redirect INNAN Supabase initieras. Annars körs createServerClient och
 * auth.getUser() även för blockade requests, vilket vi inte vill när hela
 * appen är låst. Därför: först path-check + redirect eller next(), först
 * därefter (endast när låset är av) Supabase.
 */
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname

  // Admin-området skyddas oavsett om waitlist-låset är på eller av.
  if (isAdminPath(path)) {
    const blocked = guardAdmin(request)
    if (blocked) return blocked
  }

  const waitlistOnly = process.env.NEXT_PUBLIC_WAITLIST_ONLY === 'true'

  if (waitlistOnly) {
    const p = path
    const isWaitlist = p === '/waitlist' || p.startsWith('/waitlist/')
    const isApiWaitlist = p === '/api/waitlist' || p.startsWith('/api/waitlist/')
    // Book pre-order ("Ta för er!") lives on the waitlist page: allow its API
    // and the Stripe success-return page through the waitlist lock.
    const isOrder = p.startsWith('/api/order/') || p.startsWith('/order/')
    // Round-one beta application: the invitation email links straight here, so
    // it must survive the lock or every recipient lands back on the waitlist.
    const isApply = p === '/apply' || p.startsWith('/apply/')
    const isApiApply = p === '/api/apply' || p.startsWith('/api/apply/')
    const isNext = p.startsWith('/_next/')
    const isKnownRoot = ['/favicon.ico', '/favicon.svg', '/robots.txt'].includes(p)
    const isRootAssetWithExt = /^\/[^/]+\.[a-z0-9]+$/i.test(p)

    const allowed =
      isWaitlist ||
      isApiWaitlist ||
      isOrder ||
      isApply ||
      isApiApply ||
      isAdminPath(p) ||
      isNext ||
      isKnownRoot ||
      isRootAssetWithExt
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

  await supabase.auth.getUser()

  return supabaseResponse
}

// Kör middleware på alla paths utom _next/static och _next/image
export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
