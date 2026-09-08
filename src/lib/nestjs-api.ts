async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`/api/admin/backend${endpoint}`, {
    ...options,
    headers,
    credentials: "same-origin",
  });

  if (response.status === 401 && typeof window !== "undefined")
    window.location.href = "/admin/login";

  if (!response.ok) {
    const errorText = await response.text();
    let errorData;
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { message: errorText };
    }
    throw new Error(
      errorData.message ||
        errorData.error ||
        `Request failed: ${response.status} - ${errorText}`,
    );
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

async function download(endpoint: string, fallbackFilename: string) {
  const response = await fetch(`/api/admin/backend${endpoint}`, {
    credentials: "same-origin",
  });
  if (response.status === 401 && typeof window !== "undefined")
    window.location.href = "/admin/login";
  if (!response.ok) {
    const body = await response.text();
    let message = body;
    try {
      const parsed: unknown = JSON.parse(body);
      if (typeof parsed === "object" && parsed !== null) {
        const candidate =
          (parsed as { message?: unknown; error?: unknown }).message ??
          (parsed as { error?: unknown }).error;
        if (typeof candidate === "string") message = candidate;
      }
    } catch {
      // The upstream error was plain text; use it as-is.
    }
    throw new Error(message || `Download failed (${response.status}).`);
  }
  if (!response.headers.get("content-type")?.includes("application/pdf")) {
    throw new Error("The evidence PDF response was invalid.");
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);
  const candidate = filenameMatch?.[1]?.trim();
  const filename =
    candidate && /^[a-zA-Z0-9._-]+\.pdf$/i.test(candidate)
      ? candidate
      : fallbackFilename;
  return { blob: await response.blob(), filename };
}

export const nestjsApi = {
  auth: {
    login: (email: string, password: string) =>
      fetch("/api/admin/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      }).then(async (response) => {
        const payload = await response.json();
        if (!response.ok)
          throw new Error(payload.message || "Invalid credentials");
        return payload as { user: { id: string; email: string; role: string } };
      }),
    logout: () =>
      fetch("/api/admin/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }).then(() => undefined),
    me: () =>
      fetch("/api/admin/auth/session", {
        cache: "no-store",
        credentials: "same-origin",
      }).then(async (response) => {
        if (!response.ok) throw new Error("Not authenticated");
        return response.json() as Promise<{ id: string; role: string }>;
      }),
  },

  games: {
    list: (params?: {
      page?: number;
      limit?: number;
      search?: string;
      status?: string;
    }) => {
      const searchParams = new URLSearchParams();
      if (params?.page) searchParams.set("page", String(params.page));
      if (params?.limit) searchParams.set("limit", String(params.limit));
      if (params?.search) searchParams.set("search", params.search);
      if (params?.status) searchParams.set("status", params.status);
      const query = searchParams.toString();
      return request<Game[]>(`/admin/games${query ? `?${query}` : ""}`);
    },
    get: (id: string) => request<Game>(`/admin/games/${id}`),
    create: (data: CreateGameDto) =>
      request<Game>("/games", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: UpdateGameDto) =>
      request<Game>(`/games/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    delete: (id: string) => request<void>(`/games/${id}`, { method: "DELETE" }),
  },

  categories: {
    list: (params?: {
      page?: number;
      limit?: number;
      gameId?: string;
      search?: string;
    }) => {
      const searchParams = new URLSearchParams();
      if (params?.page) searchParams.set("page", String(params.page));
      if (params?.limit) searchParams.set("limit", String(params.limit));
      if (params?.gameId) searchParams.set("gameId", params.gameId);
      if (params?.search) searchParams.set("search", params.search);
      const query = searchParams.toString();
      return request<Category[]>(
        `/admin/categories${query ? `?${query}` : ""}`,
      );
    },
    get: (id: string) => request<Category>(`/admin/categories/${id}`),
    create: (data: CreateCategoryDto) =>
      request<Category>("/categories", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: UpdateCategoryDto) =>
      request<Category>(`/categories/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<void>(`/categories/${id}`, { method: "DELETE" }),
    createForGame: (gameId: string, data: CreateCategoryForGameDto) =>
      request<Category>(`/games/${gameId}/categories`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },

  products: {
    list: (params?: {
      page?: number;
      limit?: number;
      gameId?: string;
      categoryId?: string;
      search?: string;
      status?: string;
    }) => {
      const searchParams = new URLSearchParams();
      if (params?.page) searchParams.set("page", String(params.page));
      if (params?.limit) searchParams.set("limit", String(params.limit));
      if (params?.gameId) searchParams.set("gameId", params.gameId);
      if (params?.categoryId) searchParams.set("categoryId", params.categoryId);
      if (params?.search) searchParams.set("search", params.search);
      if (params?.status) searchParams.set("status", params.status);
      const query = searchParams.toString();
      return request<Product[]>(`/admin/products${query ? `?${query}` : ""}`);
    },
    get: (id: string) => request<Product>(`/admin/products/${id}`),
    create: (data: CreateProductDto) =>
      request<Product>("/products", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: UpdateProductDto) =>
      request<Product>(`/products/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<void>(`/products/${id}`, { method: "DELETE" }),
    createForGame: (gameId: string, data: CreateProductForGameDto) =>
      request<Product>(`/games/${gameId}/products`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },

  blogs: {
    list: () => request<Blog[]>("/admin/blogs"),
    get: (id: string) => request<Blog>(`/admin/blogs/${id}`),
    create: (data: CreateBlogDto) =>
      request<Blog>("/admin/blogs", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: UpdateBlogDto) =>
      request<Blog>(`/admin/blogs/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    archive: (id: string) =>
      request<Blog>(`/admin/blogs/${id}/archive`, { method: "PATCH" }),
    delete: (id: string) =>
      request<{ success: true; id: string }>(`/admin/blogs/${id}`, {
        method: "DELETE",
      }),
  },

  legalPages: {
    list: () => request<LegalPage[]>("/admin/legal-pages"),
    get: (pageKey: LegalPageKey) =>
      request<LegalPage>(`/admin/legal-pages/${pageKey}`),
    update: (pageKey: LegalPageKey, data: UpdateLegalPageDto) =>
      request<LegalPage>(`/admin/legal-pages/${pageKey}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
  },

  orders: {
    list: (params?: {
      page?: number;
      limit?: number;
      search?: string;
      orderStatus?: OrderStatus;
      fulfillmentStatus?: FulfillmentStatus;
      paymentStatus?: PaymentAttemptStatus;
      paymentSource?: PaymentSource;
      unread?: boolean;
      reconciliation?: boolean;
      queue?: AdminOrderQueue;
      sort?: "newest" | "oldest";
    }) => {
      const searchParams = new URLSearchParams();
      if (params?.page) searchParams.set("page", String(params.page));
      if (params?.limit) searchParams.set("limit", String(params.limit));
      if (params?.search) searchParams.set("search", params.search);
      if (params?.orderStatus)
        searchParams.set("orderStatus", params.orderStatus);
      if (params?.fulfillmentStatus)
        searchParams.set("fulfillmentStatus", params.fulfillmentStatus);
      if (params?.paymentStatus)
        searchParams.set("paymentStatus", params.paymentStatus);
      if (params?.paymentSource)
        searchParams.set("paymentSource", params.paymentSource);
      if (params?.unread !== undefined)
        searchParams.set("unread", String(params.unread));
      if (params?.reconciliation !== undefined)
        searchParams.set("reconciliation", String(params.reconciliation));
      if (params?.queue) searchParams.set("queue", params.queue);
      if (params?.sort) searchParams.set("sort", params.sort);
      const query = searchParams.toString();
      return request<AdminOrderList>(
        `/admin/orders${query ? `?${query}` : ""}`,
      );
    },
    get: (id: string) => request<AdminOrder>(`/admin/orders/${id}`),
    transitionStatus: (
      id: string,
      data: { status: OrderStatus; expectedVersion: number },
    ) =>
      request<AdminOrder>(`/admin/orders/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    transitionFulfillment: (
      id: string,
      data: { status: FulfillmentStatus; expectedVersion: number },
    ) =>
      request<AdminOrder>(`/admin/orders/${id}/fulfillment-status`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    getChat: (id: string) => request<OrderChat>(`/admin/orders/${id}/chat`),
    sendMessage: (
      id: string,
      data: { body: string; clientMessageId?: string },
    ) =>
      request<ChatMessage>(`/admin/orders/${id}/chat/messages`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    getDeliveries: (id: string) =>
      request<OrderDeliveryList>(`/admin/orders/${id}/deliveries`),
    downloadDeliveryEvidence: (id: string, deliveryId: string) =>
      download(
        `/admin/orders/${id}/deliveries/${deliveryId}/evidence.pdf`,
        `MehtaXD-dispute-evidence-${id}.pdf`,
      ),
    getPayments: (id: string) =>
      request<AdminPaymentAttempt[]>(`/admin/orders/${id}/payments`),
    getPaymentEvents: (paymentId: string) =>
      request<AdminPaymentEvent[]>(`/admin/payments/${paymentId}/events`),
    createDelivery: (id: string, data: CreateDeliveryDto) =>
      request<OrderDelivery>(`/admin/orders/${id}/deliveries`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    chatInbox: () => request<AdminChatInbox>("/admin/order-chats"),
  },

  customers: {
    list: (params?: {
      page?: number;
      limit?: number;
      search?: string;
      status?: CustomerStatus;
    }) => {
      const searchParams = new URLSearchParams();
      if (params?.page) searchParams.set("page", String(params.page));
      if (params?.limit) searchParams.set("limit", String(params.limit));
      if (params?.search) searchParams.set("search", params.search);
      if (params?.status) searchParams.set("status", params.status);
      const query = searchParams.toString();
      return request<AdminCustomerList>(
        `/admin/customers${query ? `?${query}` : ""}`,
      );
    },
    get: (id: string) => request<AdminCustomer>(`/admin/customers/${id}`),
    transitionStatus: (
      id: string,
      data: {
        action: "suspend" | "ban" | "reactivate";
        expectedStatus: CustomerStatus;
        reason: string;
      },
    ) =>
      request<CustomerStatusResult>(`/admin/customers/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    revokeSessions: (id: string, reason: string) =>
      request<{ success: true; revokedSessions: number }>(
        `/admin/customers/${id}/revoke-sessions`,
        { method: "POST", body: JSON.stringify({ reason }) },
      ),
    orders: (id: string, page = 1, limit = 20) =>
      request<AdminCustomerOrderList>(
        `/admin/customers/${id}/orders?page=${page}&limit=${limit}`,
      ),
    notes: (id: string) =>
      request<AdminCustomerNote[]>(`/admin/customers/${id}/notes`),
    createNote: (id: string, body: string) =>
      request<AdminCustomerNote>(`/admin/customers/${id}/notes`, {
        method: "POST",
        body: JSON.stringify({ body }),
      }),
    audit: (id: string) =>
      request<AdminCustomerAudit[]>(`/admin/customers/${id}/audit`),
    wallet: (id: string) =>
      request<AdminWallet>(`/admin/customers/${id}/wallet`),
    addWalletCredit: (
      id: string,
      data: { amountMinor: number; reason: string },
      idempotencyKey: string,
    ) =>
      request<{ balanceMinor: number; currency: string }>(
        `/admin/customers/${id}/wallet/credits`,
        {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey },
          body: JSON.stringify(data),
        },
      ),
  },
};

export interface AdminWalletTransaction {
  id: string;
  type: "admin_credit" | "order_debit";
  amountMinor: number;
  currency: "USD";
  balanceAfterMinor: number;
  orderNumber: string | null;
  reason: string | null;
  createdAt: string;
}

export interface AdminWallet {
  balanceMinor: number;
  currency: "USD";
  transactions: AdminWalletTransaction[];
}

export type CustomerStatus = "active" | "suspended" | "banned";
export type CustomerAuthProvider = "password" | "google" | "discord";

export interface AdminCustomerListItem {
  id: string;
  email: string | null;
  displayName: string | null;
  status: CustomerStatus;
  emailVerified: boolean;
  providers: CustomerAuthProvider[];
  orderCount: number;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCustomerList {
  items: AdminCustomerListItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AdminCustomer extends Omit<
  AdminCustomerListItem,
  "providers" | "orderCount"
> {
  authenticationMethods: Array<{
    provider: CustomerAuthProvider;
    linkedAt: string;
  }>;
  sessions: Array<{
    id: string;
    status: "active" | "revoked" | "expired";
    createdAt: string;
    expiresAt: string;
    revokedAt: string | null;
  }>;
}

export interface CustomerStatusResult {
  status: CustomerStatus;
  updatedAt: string;
  revokedSessions: number;
}

export interface AdminCustomerOrderList {
  items: Array<{
    id: string;
    orderNumber: string;
    orderStatus: OrderStatus;
    fulfillmentStatus: FulfillmentStatus;
    totalMinor: number;
    currency: string;
    createdAt: string;
    chatId: string | null;
  }>;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AdminCustomerNote {
  id: string;
  body: string;
  createdAt: string;
  adminUserId: string | null;
  adminName?: string | null;
  adminEmail?: string | null;
}

export interface AdminCustomerAudit {
  id: string;
  action:
    | "customer_suspended"
    | "customer_banned"
    | "customer_reactivated"
    | "customer_sessions_revoked"
    | "customer_wallet_credit_added";
  previousStatus: CustomerStatus | null;
  newStatus: CustomerStatus | null;
  reason: string | null;
  revokedSessions: number;
  amountMinor: number;
  currency: string | null;
  walletTransactionId: string | null;
  createdAt: string;
  adminUserId: string;
  adminName: string | null;
  adminEmail: string | null;
}

export type OrderStatus =
  "awaiting_payment" | "confirmed" | "completed" | "cancelled" | "expired";
export type FulfillmentStatus =
  "unfulfilled" | "processing" | "delivered" | "completed" | "cancelled";

export type PaymentAttemptStatus =
  | "pending"
  | "requires_action"
  | "processing"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "expired"
  | "paid"
  | "refunded"
  | "partially_refunded";

export type PaymentSource = "test" | "wallet";

export type AdminOrderQueue =
  | "all"
  | "needs_payment"
  | "ready_for_fulfillment"
  | "processing"
  | "delivered"
  | "completed"
  | "cancelled"
  | "unread"
  | "reconciliation";

export interface AdminPaymentAttempt {
  id: string;
  orderId: string;
  customerId: string;
  provider: PaymentSource;
  providerPaymentId: string | null;
  providerCheckoutId: string | null;
  idempotencyKey: string | null;
  status: PaymentAttemptStatus;
  amountMinor: number;
  currency: string;
  expiresAt: string | null;
  paidAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
  expiredAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  reconciliationRequired: boolean;
  reconciliationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPaymentEvent {
  id: string;
  paymentId: string | null;
  provider: PaymentSource;
  providerEventId: string;
  eventType: string;
  status: "received" | "processed" | "ignored" | "failed";
  metadata: Record<string, string | number | boolean | null>;
  errorMessage: string | null;
  processedAt: string | null;
  createdAt: string;
}

export interface OrderItem {
  id: string;
  productId: string | null;
  productName: string;
  productSlug: string;
  gameName: string | null;
  categoryName: string | null;
  productType: string;
  unitPriceMinor: number;
  quantity: number;
  lineTotalMinor: number;
  currency: string;
  deliveryInformation: string | null;
  imageUrl: string | null;
  requirementInformation: unknown;
  selectedOptions: unknown;
  requirementDefinitions: unknown;
  requirementAnswers: unknown;
  createdAt: string;
}

export interface OrderEvent {
  id: string;
  eventType: string;
  actorType: "customer" | "admin" | "system";
  previousOrderStatus: OrderStatus | null;
  newOrderStatus: OrderStatus | null;
  previousFulfillmentStatus: FulfillmentStatus | null;
  newFulfillmentStatus: FulfillmentStatus | null;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  senderType: "customer" | "admin" | "system";
  senderLabel: string;
  messageType: "text" | "system";
  body: string;
  receiptStatus: "sent" | "delivered" | "seen";
  receiptLabel: "Sent" | "Delivered" | "Seen";
  createdAt: string;
}

export interface OrderChat {
  orderNumber: string;
  orderId?: string;
  unreadCount: number;
  messages: {
    items: ChatMessage[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface OrderDelivery {
  id: string;
  orderItemId: string | null;
  deliveryType: "text" | "code" | "instructions";
  customerVisibleSummary: string | null;
  payload: string | null;
  deliveredAt: string;
  acknowledgedAt: string | null;
  createdAt: string;
  acknowledgementIntegrityStatus?:
    "valid" | "invalid" | "missing" | "not_applicable";
  acknowledgement?: AdminDeliveryAcknowledgement | null;
}

export interface AdminDeliveryAcknowledgement {
  evidenceVersion: string;
  orderNumber: string;
  customerName: string | null;
  customerEmail: string;
  customerAccountCreatedAt: string;
  emailVerified: boolean;
  productSnapshot: Array<{
    orderItemId: string;
    productId: string | null;
    productName: string;
    productType: string;
    quantity: number;
    lineTotalMinor: number;
    currency: string;
  }>;
  amountMinor: number;
  currency: string;
  paymentProvider: string | null;
  paymentReference: string | null;
  paymentAmountMinor: number | null;
  paymentCurrency: string | null;
  paymentConfirmedAt: string | null;
  deliveredAt: string;
  acknowledgedAt: string;
  sourceIp: string | null;
  sourceIpSource: "storefront_bff" | "direct";
  userAgent: string | null;
  deviceSummary: string | null;
  confirmationTextVersion: string;
  confirmationText: string;
  integrityStatus: "valid" | "invalid";
}

export interface OrderDeliveryList {
  items: OrderDelivery[];
}

export interface CreateDeliveryDto {
  deliveryType: "text" | "code" | "instructions";
  orderItemId?: string;
  customerVisibleSummary?: string;
  payload: string;
  expectedVersion: number;
}

export interface AdminChatInbox {
  items: Array<{
    orderId: string;
    orderNumber: string;
    customerEmail: string;
    customerName: string | null;
    orderStatus: OrderStatus;
    fulfillmentStatus: FulfillmentStatus;
    latestMessage: ChatMessage | null;
    unreadCount: number;
    updatedAt: string;
  }>;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AdminOrder {
  id: string;
  customerId: string | null;
  customerEmail: string;
  customerName: string | null;
  customerStatus?: string | null;
  orderNumber: string;
  orderStatus: OrderStatus;
  fulfillmentStatus: FulfillmentStatus;
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  feeMinor: number;
  totalMinor: number;
  paidMinor: number;
  refundedMinor: number;
  version: number;
  expiresAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  chatUnreadCount?: number;
  paymentSource?: string | null;
  paymentStatus?: string | null;
  reconciliationRequired?: boolean;
  reconciliationReason?: string | null;
  items: OrderItem[];
  events?: OrderEvent[];
}

export interface AdminOrderList {
  items: AdminOrder[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  queueCounts: Record<AdminOrderQueue, number> & {
    needsPayment?: number;
    readyForFulfillment?: number;
  };
}

export type BlogStatus = "draft" | "published" | "archived";

export interface Blog {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  featuredImageUrl: string | null;
  featuredImageAlt: string | null;
  category: string | null;
  tags: string[];
  authorName: string | null;
  status: BlogStatus;
  featured: boolean;
  publishedAt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  ogImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBlogDto {
  title: string;
  slug: string;
  excerpt?: string;
  content?: string;
  featuredImageUrl?: string;
  featuredImageAlt?: string;
  category?: string;
  tags?: string[];
  authorName?: string;
  status?: BlogStatus;
  featured?: boolean;
  publishedAt?: string | null;
  seoTitle?: string;
  seoDescription?: string;
  canonicalUrl?: string;
  ogImageUrl?: string;
}

export interface UpdateBlogDto extends Partial<CreateBlogDto> {}

export const LEGAL_PAGE_KEYS = [
  "privacy-policy",
  "terms-and-conditions",
  "refund-policy",
  "cookie-policy",
] as const;

export type LegalPageKey = (typeof LEGAL_PAGE_KEYS)[number];
export type LegalPageStatus = "draft" | "published";

export interface LegalPage {
  id: string;
  pageKey: LegalPageKey;
  title: string;
  content: string;
  status: LegalPageStatus;
  publishedAt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateLegalPageDto {
  title?: string;
  content?: string;
  status?: LegalPageStatus;
  publishedAt?: string | null;
  seoTitle?: string;
  seoDescription?: string;
}

export interface Game {
  id: string;
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  heroEyebrow: string;
  heroTitle: string;
  heroBody: string;
  mark: string;
  tone: string;
  guide: string;
  highlights: string[];
  iconUrl: string;
  bannerUrl: string;
  featured: boolean;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
  ogImageUrl: string;
  canonicalUrl: string;
  status: "draft" | "published" | "archived";
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGameDto {
  name: string;
  slug?: string;
  shortDescription: string;
  description?: string;
  heroEyebrow?: string;
  heroTitle?: string;
  heroBody?: string;
  mark?: string;
  tone?: string;
  guide?: string;
  highlights?: string[];
  iconUrl?: string;
  bannerUrl?: string;
  featured?: boolean;
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string;
  ogImageUrl?: string;
  canonicalUrl?: string;
  status?: "draft" | "published" | "archived";
}

export interface UpdateGameDto extends Partial<CreateGameDto> {}

export interface Category {
  id: string;
  gameId: string;
  name: string;
  slug: string;
  description: string;
  status: "draft" | "published" | "archived";
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryDto {
  name: string;
  slug?: string;
  description?: string;
  status?: "draft" | "published" | "archived";
  sortOrder?: number;
}

export interface CreateCategoryForGameDto extends CreateCategoryDto {}

export interface UpdateCategoryDto extends Partial<CreateCategoryDto> {}

export interface Product {
  id: string;
  gameId: string;
  categoryId: string;
  name: string;
  slug: string;
  productType:
    | "currency"
    | "account"
    | "item"
    | "boosting"
    | "service"
    | "subscription"
    | "other";
  price: string;
  compareAtPrice: string | null;
  currency: string;
  status: "draft" | "published" | "archived";
  isActive: boolean;
  featured: boolean;
  sortOrder: number;
  shortDescription: string | null;
  description: string | null;
  requirements: string | null;
  deliveryInformation: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string | null;
  ogImageUrl: string | null;
  canonicalUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductDto {
  gameId: string;
  categoryId: string;
  name: string;
  slug?: string;
  productType:
    | "currency"
    | "account"
    | "item"
    | "boosting"
    | "service"
    | "subscription"
    | "other";
  price: number;
  compareAtPrice?: number;
  currency?: string;
  status?: "draft" | "published" | "archived";
  isActive?: boolean;
  featured?: boolean;
  sortOrder?: number;
  shortDescription: string;
  description: string;
  requirements?: string;
  deliveryInformation?: string;
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string;
  ogImageUrl?: string;
  canonicalUrl?: string;
}

export interface CreateProductForGameDto extends Omit<
  CreateProductDto,
  "gameId"
> {}

export interface UpdateProductDto extends Partial<CreateProductDto> {}
