import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Password gate for the deployed demo (HTTP Basic). Set STEWARD_PASSWORD to turn
 * it on; unset — as in local dev — and every request passes through.
 *
 * `/api/mcp/<secret>` is exempt: MCP clients can't answer a Basic challenge, and
 * that route already authenticates with the unguessable path secret (PLAN.md §0).
 */
const REALM = 'Basic realm="Steward — any username, password only", charset="UTF-8"';

export function proxy(request: NextRequest) {
  const password = process.env.STEWARD_PASSWORD;
  if (!password) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/mcp/")) return NextResponse.next();

  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ") && matches(header.slice(6), password)) return NextResponse.next();

  return new NextResponse("Authentication required.", { status: 401, headers: { "WWW-Authenticate": REALM } });
}

/**
 * Password only: the username is ignored, since a browser's Basic prompt makes it
 * easy to leave blank and the resulting 401 just re-opens the box. Compared in
 * constant time so the response doesn't leak how much of the password matched.
 */
function matches(encoded: string, password: string): boolean {
  let decoded: string;
  try {
    decoded = atob(encoded);
  } catch {
    return false;
  }
  const given = decoded.slice(decoded.indexOf(":") + 1);
  if (given.length !== password.length) return false;
  let diff = 0;
  for (let i = 0; i < password.length; i++) diff |= given.charCodeAt(i) ^ password.charCodeAt(i);
  return diff === 0;
}

export const config = {
  // Everything except Next's build output and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
