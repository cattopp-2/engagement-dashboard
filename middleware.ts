import { NextRequest, NextResponse } from 'next/server'

// Everything is behind the password except the login page and the login call.
const OPEN_PATHS = ['/login', '/api/login']

export function middleware(req: NextRequest) {
  const password = process.env.PASSWORD
  if (!password) return NextResponse.next()

  const { pathname } = req.nextUrl
  if (OPEN_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next()
  }

  if (req.cookies.get('session')?.value === password) {
    return NextResponse.next()
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const url = req.nextUrl.clone()
  url.pathname = '/login'
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
