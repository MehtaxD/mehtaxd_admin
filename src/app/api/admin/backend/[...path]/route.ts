import { NextResponse } from "next/server";
import { proxyAdminRequest } from "@/lib/admin-api-route";

const uuid = "[0-9a-fA-F-]{36}";
const customerUuid =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const legalPage =
  "(privacy-policy|terms-and-conditions|refund-policy|cookie-policy)";
const allowed: Record<string, RegExp[]> = {
  GET: [
    /^admin\/(games|categories|products|blogs|legal-pages|orders|order-chats|customers)(\?.*)?$/,
    new RegExp(`^admin/legal-pages/${legalPage}(\\?.*)?$`),
    new RegExp(
      `^admin/(games|categories|products|blogs|orders)/${uuid}(\\?.*)?$`,
    ),
    new RegExp(
      `^admin/customers/${customerUuid}(/(orders|notes|audit|wallet))?(\\?.*)?$`,
    ),
    new RegExp(`^admin/orders/${uuid}/(chat|deliveries)(\\?.*)?$`),
    new RegExp(
      `^admin/orders/${customerUuid}/deliveries/${customerUuid}/evidence\\.pdf$`,
    ),
    new RegExp(`^admin/orders/${uuid}/payments(\\?.*)?$`),
    new RegExp(`^admin/payments/${uuid}/events(\\?.*)?$`),
  ],
  POST: [
    /^games$/,
    new RegExp(`^games/${uuid}/(categories|products)$`),
    /^admin\/blogs$/,
    new RegExp(
      `^admin/customers/${customerUuid}/(revoke-sessions|notes|wallet/credits)$`,
    ),
    new RegExp(`^admin/orders/${uuid}/(chat/messages|deliveries)$`),
  ],
  PATCH: [
    new RegExp(`^(games|categories|products)/${uuid}$`),
    new RegExp(`^admin/blogs/${uuid}(/archive)?$`),
    new RegExp(`^admin/legal-pages/${legalPage}$`),
    new RegExp(`^admin/customers/${customerUuid}/status$`),
    new RegExp(`^admin/orders/${uuid}/(status|fulfillment-status)$`),
  ],
  DELETE: [
    new RegExp(`^(games|categories|products)/${uuid}$`),
    new RegExp(`^admin/blogs/${uuid}$`),
  ],
};

async function handle(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const segments = (await context.params).path;
  const path = segments.join("/");
  const query = new URL(request.url).search;
  const candidate = `${path}${query}`;
  if (
    segments.some(
      (segment) =>
        !/^[a-zA-Z0-9-]+$/.test(segment) && segment !== "evidence.pdf",
    ) ||
    !allowed[request.method]?.some((pattern) => pattern.test(candidate))
  ) {
    return NextResponse.json(
      { message: "Admin API route not allowed." },
      { status: 404 },
    );
  }
  try {
    return await proxyAdminRequest(request, `/${candidate}`);
  } catch (error) {
    if (error instanceof Response)
      return NextResponse.json(
        { message: await error.text() },
        { status: error.status },
      );
    return NextResponse.json(
      { message: "Admin API unavailable." },
      { status: 503 },
    );
  }
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
