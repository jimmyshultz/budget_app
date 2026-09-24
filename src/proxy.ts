import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@/lib/config";

// The server only listens on 127.0.0.1, but a malicious website could still try
// DNS rebinding (pointing its own hostname at 127.0.0.1) to read your data.
// Rejecting any Host that isn't literally localhost closes that hole.
const ALLOWED_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

// In the desktop app, every request must also carry the per-launch token the app's window
// holds as a cookie, so other programs and websites on the machine can't use the server.
export const APP_TOKEN_COOKIE = "budget_token";

function tokenMatches(presented: string | undefined, expected: string): boolean {
  if (!presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function proxy(request: NextRequest) {
  const hostname = (request.headers.get("host") ?? "").replace(/:\d+$/, "");
  if (!ALLOWED_HOSTNAMES.has(hostname)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const { appToken } = getConfig();
  if (appToken && !tokenMatches(request.cookies.get(APP_TOKEN_COOKIE)?.value, appToken)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
