import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { safeAdminApiError } from "@/lib/safe-api-error";

const API_URL = process.env.NESTJS_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";
const ACCESS_COOKIE = "mxd_admin_access";
const REFRESH_COOKIE = "mxd_admin_refresh";
const AUTH_BODY_LIMIT = 8 * 1024;
const API_BODY_LIMIT = 2 * 1024 * 1024;
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/api/admin",
};

interface TokenPayload {
  accessToken: string;
  refreshToken: string;
  user?: { id: string; email: string; displayName?: string | null; role: string };
}

const refreshes = new Map<string, Promise<TokenPayload | null>>();

export function validateAdminOrigin(request: Request): NextResponse | null {
  const expected = new URL(process.env.ADMIN_URL || "http://localhost:3001").origin;
  const allowed = new Set([expected]);
  if (process.env.NODE_ENV === "development") {
    allowed.add("http://192.168.1.69:3001");
  }
  return allowed.has(request.headers.get("origin") || "")
    ? null
    : NextResponse.json({ message: "Invalid request origin." }, { status: 403 });
}

export async function readJsonBody(request: Request, limit = AUTH_BODY_LIMIT): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new Response("Unsupported content type", { status: 415 });
  }
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > limit) throw new Response("Request body is too large", { status: 413 });
  const reader = request.body?.getReader();
  if (!reader) throw new Response("Invalid request body", { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) throw new Response("Request body is too large", { status: 413 });
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new Response("Invalid JSON", { status: 400 }); }
}

export function setAdminCookies(response: NextResponse, payload: TokenPayload) {
  response.cookies.set(ACCESS_COOKIE, payload.accessToken, { ...cookieOptions, maxAge: 15 * 60 });
  response.cookies.set(REFRESH_COOKIE, payload.refreshToken, { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 });
}

export function clearAdminCookies(response: NextResponse) {
  response.cookies.set(ACCESS_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  response.cookies.set(REFRESH_COOKIE, "", { ...cookieOptions, maxAge: 0 });
}

async function refresh(refreshToken: string): Promise<TokenPayload | null> {
  const active = refreshes.get(refreshToken);
  if (active) return active;
  const pending = fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  }).then(async (response) => response.ok ? response.json() as Promise<TokenPayload> : null)
    .catch(() => null)
    .finally(() => refreshes.delete(refreshToken));
  refreshes.set(refreshToken, pending);
  return pending;
}

const evidencePdfPath =
  /^\/admin\/orders\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\/deliveries\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\/evidence\.pdf$/;

export async function adminBackend(path: string, init: RequestInit = {}, binary = false) {
  const jar = await cookies();
  let accessToken = jar.get(ACCESS_COOKIE)?.value;
  const refreshToken = jar.get(REFRESH_COOKIE)?.value;
  const send = () => fetch(`${API_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: { ...init.headers, ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
  });
  let upstream = accessToken ? await send() : new Response(null, { status: 401 });
  let rotated: TokenPayload | null = null;
  if (upstream.status === 401 && refreshToken) {
    rotated = await refresh(refreshToken);
    if (rotated) { accessToken = rotated.accessToken; upstream = await send(); }
  }
  const body = binary ? await upstream.arrayBuffer() : await upstream.text();
  if (!upstream.ok) {
    const normalized = binary && upstream.status === 422
      ? { code: "VALIDATION_FAILED" as const, message: "Evidence integrity verification failed. The download was blocked.", retryable: false }
      : safeAdminApiError(
      upstream.status,
      binary && upstream.status === 404
        ? "Delivery evidence was not found for this Order."
        : upstream.status === 404
        ? "The requested Admin record was not found. Refresh the page and try again."
        : undefined,
    );
    const response = NextResponse.json(normalized, { status: upstream.status });
    if (rotated) setAdminCookies(response, rotated);
    if (upstream.status === 401) clearAdminCookies(response);
    return response;
  }
  const headers = new Headers({
    "Content-Type": upstream.headers.get("content-type") || "application/json",
  });
  if (binary) {
    const disposition = upstream.headers.get("content-disposition");
    if (disposition) headers.set("Content-Disposition", disposition);
    headers.set("Cache-Control", upstream.headers.get("cache-control") || "private, no-store");
    headers.set("X-Content-Type-Options", "nosniff");
  }
  const response = new NextResponse(body || null, {
    status: upstream.status,
    headers,
  });
  if (rotated) setAdminCookies(response, rotated);
  if (upstream.status === 401) clearAdminCookies(response);
  return response;
}

export async function proxyAdminRequest(request: Request, backendPath: string) {
  const method = request.method.toUpperCase();
  const originError = method === "GET" ? null : validateAdminOrigin(request);
  if (originError) return originError;
  let body: string | undefined;
  if (method !== "GET" && method !== "HEAD" && method !== "DELETE") {
    const parsed = await readJsonBody(request, API_BODY_LIMIT);
    body = JSON.stringify(parsed);
  }
  const headers: Record<string, string> = {};
  if (body) headers["Content-Type"] = "application/json";
  // This existing customer action requires a caller key, never caller auth headers.
  if (method === "POST" && /^\/admin\/customers\/[0-9a-fA-F-]{36}\/wallet\/credits$/.test(backendPath)) {
    const key = request.headers.get("idempotency-key");
    if (key !== null) headers["Idempotency-Key"] = key;
  }
  return adminBackend(backendPath, {
    method,
    headers,
    ...(body ? { body } : {}),
  }, evidencePdfPath.test(backendPath));
}
