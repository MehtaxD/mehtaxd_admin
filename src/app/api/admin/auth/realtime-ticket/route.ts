import { adminBackend, validateAdminOrigin } from "@/lib/admin-api-route";

export async function POST(request: Request) {
  const originError = validateAdminOrigin(request);
  if (originError) return originError;
  return adminBackend("/auth/realtime-ticket", { method: "POST" });
}
