import { adminBackend } from "@/lib/admin-api-route";
export async function GET() { return adminBackend("/auth/me"); }
