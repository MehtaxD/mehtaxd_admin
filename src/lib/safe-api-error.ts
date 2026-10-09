export type SafeAdminApiError = {
  code: "VALIDATION_FAILED" | "SESSION_EXPIRED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "RATE_LIMITED" | "SERVICE_UNAVAILABLE" | "INTERNAL_ERROR";
  message: string;
  retryable: boolean;
};

export function safeAdminApiError(
  status: number,
  fallback = "We couldn’t complete this Admin request. Try again.",
): SafeAdminApiError {
  if (status === 400 || status === 413 || status === 415 || status === 422)
    return { code: "VALIDATION_FAILED", message: "Review the submitted information and try again.", retryable: false };
  if (status === 401)
    return { code: "SESSION_EXPIRED", message: "Your Admin session expired. Log in again to continue.", retryable: false };
  if (status === 403)
    return { code: "FORBIDDEN", message: "Your Admin account cannot complete this action.", retryable: false };
  if (status === 404)
    return { code: "NOT_FOUND", message: fallback, retryable: false };
  if (status === 409)
    return { code: "CONFLICT", message: "This record changed while you were working. Refresh it and try again.", retryable: true };
  if (status === 429)
    return { code: "RATE_LIMITED", message: "Too many requests were made. Wait a moment, then try again.", retryable: true };
  if (status >= 500)
    return { code: "SERVICE_UNAVAILABLE", message: "The Admin service is temporarily unavailable. Try again in a moment.", retryable: true };
  return { code: "INTERNAL_ERROR", message: fallback, retryable: false };
}

export function safeAdminErrorFromPayload(
  status: number,
  payload: unknown,
  fallback?: string,
): SafeAdminApiError {
  if (typeof payload === "object" && payload !== null) {
    const code = Reflect.get(payload, "code");
    const message = Reflect.get(payload, "message");
    const retryable = Reflect.get(payload, "retryable");
    if (
      typeof code === "string" &&
      typeof message === "string" &&
      typeof retryable === "boolean" &&
      /^[A-Z][A-Z0-9_]{2,48}$/.test(code)
    ) {
      return { ...safeAdminApiError(status, fallback), message, retryable };
    }
  }
  return safeAdminApiError(status, fallback);
}

const gameFieldLabels: Record<string, string> = {
  name: "Name", slug: "Slug", shortDescription: "Short description",
  description: "Description", heroEyebrow: "Hero eyebrow", heroTitle: "Hero title",
  heroBody: "Hero intro", mark: "Game mark", tone: "Visual tone",
  guide: "Before-you-buy guide", highlights: "Highlights", faqs: "FAQs",
  iconUrl: "Icon URL", bannerUrl: "Banner URL", ogImageUrl: "OG image URL",
  featured: "Featured", seoTitle: "SEO title", seoDescription: "Meta description",
  seoKeywords: "SEO keywords", canonicalUrl: "Canonical URL", status: "Status",
};

/** Show only known Game fields, never arbitrary upstream exception text. */
export function safeGameValidationMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const messages = Reflect.get(payload, "message");
  if (!Array.isArray(messages)) return null;
  for (const item of messages) {
    if (typeof item !== "string") continue;
    const field = item.match(/^([a-zA-Z]+)(?:\.|\s)/)?.[1];
    if (!field || !gameFieldLabels[field]) continue;
    return /must be a URL address/i.test(item)
      ? `${gameFieldLabels[field]} must be a valid full URL (https://…).`
      : `Check ${gameFieldLabels[field]} and try again.`;
  }
  return null;
}

const productFieldLabels: Record<string, string> = {
  gameId: "Game", categoryId: "Category", productType: "Product type",
  name: "Name", slug: "Slug", price: "Price", compareAtPrice: "Compare-at price",
  currency: "Currency", status: "Status", isActive: "Active", featured: "Featured",
  shortDescription: "Short description", description: "Description",
  requirements: "Requirements", deliveryInformation: "Delivery information",
  seoTitle: "SEO title", seoDescription: "Meta description", seoKeywords: "SEO keywords",
  ogImageUrl: "OG image URL", canonicalUrl: "Canonical URL",
  variants: "Variants", images: "Product images",
};

/** Only expose recognized Product field names, not arbitrary upstream text. */
export function safeProductValidationFields(payload: unknown): Record<string, string> {
  if (!payload || typeof payload !== "object") return {};
  const messages = Reflect.get(payload, "message");
  if (!Array.isArray(messages)) return {};
  const fields: Record<string, string> = {};
  for (const item of messages) {
    if (typeof item !== "string") continue;
    const field = item.match(/^([a-zA-Z]+)(?:\.\d+\.[a-zA-Z]+)?(?:\.|\s)/)?.[1];
    if (!field || !productFieldLabels[field]) continue;
    const path = item.match(/^([a-zA-Z]+\.\d+\.[a-zA-Z]+)(?:\.|\s)/)?.[1] ?? field;
    fields[path] = /must be a URL address/i.test(item)
      ? `${productFieldLabels[field]} needs a valid full HTTPS URL.`
      : `Check ${productFieldLabels[field]}.`;
  }
  return fields;
}

const safeGameUploadMessages = new Set([
  "Choose an image to upload.",
  "Image must be 5 MB or smaller.",
  "Use a valid PNG, JPEG, or WebP image.",
  "Unsupported Game image placement.",
  "Image uploads are unavailable. Try again later.",
  "Image upload could not be completed. Try again.",
  "Image upload returned an invalid response.",
  "Image upload returned an invalid URL.",
  "Image upload returned an invalid image.",
]);

export function safeGameUploadMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const message = Reflect.get(payload, "message");
  return typeof message === "string" && safeGameUploadMessages.has(message) ? message : null;
}

