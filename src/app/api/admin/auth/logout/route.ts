import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { clearAdminCookies, validateAdminOrigin } from "@/lib/admin-api-route";

const API_URL = process.env.NESTJS_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";

export async function POST(request: Request) {
  const originError = validateAdminOrigin(request);
  if (originError) return originError;
  const refreshToken = (await cookies()).get("mxd_admin_refresh")?.value;
  if (refreshToken) {
    await fetch(`${API_URL}/auth/logout`, {
      method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken }),
    }).catch(() => null);
  }
  const response = NextResponse.json({ success: true });
  clearAdminCookies(response);
  return response;
}
