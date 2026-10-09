export function normalizeSlugDraft(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-");
}

export function finalizeSlug(value: string) {
  return normalizeSlugDraft(value).replace(/^-+|-+$/g, "");
}
