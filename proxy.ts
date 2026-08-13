import { NextResponse, type NextRequest } from "next/server"

import {
  isAuthEnabled,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/auth/core"

const LOGIN_PATH = "/login"

export async function proxy(request: NextRequest) {
  if (!isAuthEnabled()) return NextResponse.next()

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
  const authed = await verifySessionToken(token)
  const isLoginRoute = request.nextUrl.pathname === LOGIN_PATH

  if (authed) {
    if (isLoginRoute) {
      const url = request.nextUrl.clone()
      url.pathname = "/"
      return NextResponse.redirect(url)
    }
    return NextResponse.next()
  }

  if (isLoginRoute) return NextResponse.next()

  const url = request.nextUrl.clone()
  url.pathname = LOGIN_PATH
  return NextResponse.redirect(url)
}

export const config = {
  matcher: [
    // `api/upload` is deliberately excluded: matching a path makes Next clone
    // the request body for middleware and truncate it at 10MB, which fails
    // every larger upload. That route calls `isRequestAuthorized` itself.
    "/((?!_next/static|_next/image|api/upload$|favicon.ico|icon.svg|icon.png|apple-icon.png|site.webmanifest|opengraph-image.png|robots.txt|sitemap.xml).*)",
  ],
}
