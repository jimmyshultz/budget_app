import { NextResponse, type NextRequest } from "next/server";

// The server only listens on 127.0.0.1, but a malicious website could still try
// DNS rebinding (pointing its own hostname at 127.0.0.1) to read your data.
// Rejecting any Host that isn't literally localhost closes that hole.
const ALLOWED_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function proxy(request: NextRequest) {
  const hostname = (request.headers.get("host") ?? "").replace(/:\d+$/, "");
  if (!ALLOWED_HOSTNAMES.has(hostname)) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
