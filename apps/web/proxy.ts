import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Password gate for the deployed demo (HTTP Basic). Set STEWARD_PASSWORD to turn
 * it on; unset — as in local dev — and every request passes through.
 *
 * `/api/mcp/<secret>` is exempt: MCP clients can't answer a Basic challenge, and
 * that route already authenticates with the unguessable path secret (PLAN.md §0).
 */
const REALM = 'Basic realm="Steward", charset="UTF-8"';
const USER = "steward";

export function proxy(request: NextRequest) {
  const password = process.env.STEWARD_PASSWORD;
  if (!password) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/mcp/")) return NextResponse.next();

  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ") && matches(header.slice(6), password)) return NextResponse.next();

  return new NextResponse("Authentication required.", { status: 401, headers: { "WWW-Authenticate": REALM } });
}

/** Compares in constant time so the response time doesn't leak how much of the password matched. */
function matches(encoded: string, password: string): boolean {
  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    return false;
  }
  const expected = `${USER}:${password}`;
  if (decoded.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= decoded.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export const config = {
  // Everything except Next's build output and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
