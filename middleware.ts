import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (pathname.startsWith('/login') || pathname.startsWith('/api/login')) {
    return NextResponse.next()
  }
  const session = request.cookies.get('session')?.value
  if (session !== process.env.PASSWORD) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
