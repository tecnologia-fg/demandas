import { NextResponse, type NextRequest } from "next/server";

// Checagem otimista: sem cookie de sessão, manda para o login.
// A autorização real acontece no servidor (requireUser/assertUser) em cada página e ação.
const PUBLIC = ["/login", "/icon", "/favicon.ico", "/manifest.webmanifest", "/compartilhado", "/aprovar", "/api/aprovar"];
const COOKIE = process.env.NODE_ENV === "production" ? "__Host-demanda_session" : "demanda_session";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "."));
  if (!isPublic && !req.cookies.has(COOKIE)) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname + req.nextUrl.search)}` : "";
    return NextResponse.redirect(url);
  }
  const res = NextResponse.next();
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (process.env.NODE_ENV === "production") res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
