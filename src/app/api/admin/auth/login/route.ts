import { NextResponse } from "next/server";
import { z } from "zod";
import { clearAdminCookies, readJsonBody, setAdminCookies, validateAdminOrigin } from "@/lib/admin-api-route";

const schema = z.object({ email: z.email().max(320), password: z.string().min(1).max(128) }).strict();
const API_URL = process.env.NESTJS_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";

export async function POST(request: Request) {
  const originError = validateAdminOrigin(request);
  if (originError) return originError;
  try {
    const result = schema.safeParse(await readJsonBody(request));
    if (!result.success) return NextResponse.json({ message: "Invalid login details." }, { status: 400 });
    const upstream = await fetch(`${API_URL}/auth/login`, {
      method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(result.data),
    });
    const payload: unknown = await upstream.json().catch(() => null);
    if (!upstream.ok) return NextResponse.json({ message: "Invalid credentials" }, { status: upstream.status });
    const auth = payload as { accessToken: string; refreshToken: string; user: { id: string; email: string; role: string } };
    const response = NextResponse.json({ user: auth.user });
    setAdminCookies(response, auth);
    return response;
  } catch (error) {
    if (error instanceof Response) return NextResponse.json({ message: await error.text() }, { status: error.status });
    const response = NextResponse.json({ message: "Authentication service unavailable." }, { status: 503 });
    clearAdminCookies(response);
    return response;
  }
}
