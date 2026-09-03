export async function isAdminRequestAuthorized(): Promise<boolean> {
  try {
    const response = await fetch("/api/admin/auth/session", { cache: "no-store", credentials: "same-origin" });
    return response.ok;
  } catch { return false; }
}

export async function logoutAdmin() {
  await fetch("/api/admin/auth/logout", {
    method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}",
  }).catch(() => null);
}
