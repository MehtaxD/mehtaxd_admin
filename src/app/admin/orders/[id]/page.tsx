"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Loader2, RotateCcw } from "@/components/icons";
import {
  type AdminOrder,
  type AdminPaymentAttempt,
  type AdminPaymentEvent,
  type ChatMessage,
  type FulfillmentStatus,
  nestjsApi,
  type OrderDelivery,
  type OrderEvent,
  type OrderStatus,
} from "@/lib/nestjs-api";

const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  awaiting_payment: ["cancelled", "expired"],
  confirmed: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  expired: [],
};

const FULFILLMENT_TRANSITIONS: Record<FulfillmentStatus, FulfillmentStatus[]> =
  {
    unfulfilled: ["processing", "cancelled"],
    processing: ["delivered", "cancelled"],
    delivered: ["completed"],
    completed: [],
    cancelled: [],
  };

function label(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).format(value / 100);
}

function date(value: string | null) {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function badge(value: string) {
  return (
    <span className={`adminOrderBadge ${value.replaceAll("_", "-")}`}>
      {label(value)}
    </span>
  );
}

function eventText(event: OrderEvent) {
  if (event.newOrderStatus) return `Order ${label(event.newOrderStatus)}`;
  if (event.newFulfillmentStatus)
    return `Fulfillment ${label(event.newFulfillmentStatus)}`;
  return label(event.eventType);
}

export default function AdminOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mutating, setMutating] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [deliveries, setDeliveries] = useState<OrderDelivery[]>([]);
  const [chatBody, setChatBody] = useState("");
  const [deliveryPayload, setDeliveryPayload] = useState("");
  const [deliverySummary, setDeliverySummary] = useState("");
  const [deliveryType, setDeliveryType] = useState<
    "text" | "code" | "instructions"
  >("instructions");
  const [communicationLoading, setCommunicationLoading] = useState(false);
  const [downloadingEvidenceId, setDownloadingEvidenceId] = useState<
    string | null
  >(null);
  const [payments, setPayments] = useState<AdminPaymentAttempt[]>([]);
  const [paymentEvents, setPaymentEvents] = useState<AdminPaymentEvent[]>([]);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(
    null,
  );
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  const legalOrderTransitions = useMemo(() => {
    if (!order) return [];
    return ORDER_TRANSITIONS[order.orderStatus]
      .filter(
        (next) =>
          next !== "completed" || order.fulfillmentStatus === "completed",
      )
      .filter(
        (next) =>
          next !== "cancelled" ||
          ["unfulfilled", "processing"].includes(order.fulfillmentStatus),
      );
  }, [order]);

  const legalFulfillmentTransitions = useMemo(() => {
    if (!order) return [];
    return FULFILLMENT_TRANSITIONS[order.fulfillmentStatus].filter((next) => {
      if (next === "cancelled") return order.orderStatus === "cancelled";
      return order.orderStatus === "confirmed";
    });
  }, [order]);

  useEffect(() => {
    void loadOrder();
  }, [params.id]);

  async function loadOrder() {
    setLoading(true);
    setError("");
    try {
      setOrder(await nestjsApi.orders.get(params.id));
      void Promise.all([loadCommunication(), loadPayments()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load order.");
    } finally {
      setLoading(false);
    }
  }

  async function loadCommunication() {
    setCommunicationLoading(true);
    try {
      const [chat, deliveryList] = await Promise.all([
        nestjsApi.orders.getChat(params.id),
        nestjsApi.orders.getDeliveries(params.id),
      ]);
      setMessages(chat.messages.items);
      setDeliveries(deliveryList.items);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load order communication.",
      );
    } finally {
      setCommunicationLoading(false);
    }
  }

  async function loadPayments() {
    setPaymentsLoading(true);
    try {
      const attempts = await nestjsApi.orders.getPayments(params.id);
      setPayments(attempts);
      if (attempts.length === 0) {
        setSelectedPaymentId(null);
        setPaymentEvents([]);
      } else {
        await loadPaymentEvents(attempts[0].id);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Payment attempts could not load.",
      );
    } finally {
      setPaymentsLoading(false);
    }
  }

  async function downloadEvidence(deliveryId: string) {
    if (downloadingEvidenceId) return;
    setDownloadingEvidenceId(deliveryId);
    setError("");
    setNotice("");
    try {
      const { blob, filename } =
        await nestjsApi.orders.downloadDeliveryEvidence(params.id, deliveryId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setNotice("Evidence PDF download started.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Evidence PDF could not be downloaded.",
      );
    } finally {
      setDownloadingEvidenceId(null);
    }
  }

  async function loadPaymentEvents(paymentId: string) {
    setSelectedPaymentId(paymentId);
    try {
      setPaymentEvents(await nestjsApi.orders.getPaymentEvents(paymentId));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Payment events could not load.",
      );
    }
  }

  async function transition(
    kind: "order" | "fulfillment",
    status: OrderStatus | FulfillmentStatus,
  ) {
    if (!order) return;
    if (
      ["cancelled", "expired"].includes(status) &&
      !window.confirm(
        `Move this ${kind} to ${label(status)}? This transition cannot be reversed.`,
      )
    )
      return;
    setMutating(`${kind}:${status}`);
    setNotice("");
    setError("");
    try {
      const updated =
        kind === "order"
          ? await nestjsApi.orders.transitionStatus(order.id, {
              status: status as OrderStatus,
              expectedVersion: order.version,
            })
          : await nestjsApi.orders.transitionFulfillment(order.id, {
              status: status as FulfillmentStatus,
              expectedVersion: order.version,
            });
      setOrder(updated);
      void loadCommunication();
      setNotice(
        `${kind === "order" ? "Order" : "Fulfillment"} moved to ${label(status)}.`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Transition failed.";
      setError(
        message.includes("changed by another operation") ||
          message.includes("409")
          ? "This order was updated elsewhere. The latest state has been reloaded; review it before trying again."
          : message,
      );
      try {
        setOrder(await nestjsApi.orders.get(params.id));
      } catch {
        // Keep the original transition error visible if the refresh also fails.
      }
    } finally {
      setMutating("");
    }
  }

  async function sendAdminMessage() {
    const body = chatBody.trim();
    if (!body) return;
    setMutating("chat");
    setError("");
    try {
      const message = await nestjsApi.orders.sendMessage(order!.id, {
        body,
        clientMessageId: `admin-web-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });
      setMessages((current) => [...current, message]);
      setChatBody("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Message could not be sent.",
      );
    } finally {
      setMutating("");
    }
  }

  async function createDelivery() {
    if (!order || !deliveryPayload.trim()) return;
    setMutating("delivery");
    setError("");
    setNotice("");
    try {
      const delivery = await nestjsApi.orders.createDelivery(order.id, {
        deliveryType,
        customerVisibleSummary: deliverySummary.trim() || undefined,
        payload: deliveryPayload.trim(),
        expectedVersion: order.version,
      });
      setDeliveries((current) => [...current, delivery]);
      setDeliveryPayload("");
      setDeliverySummary("");
      setOrder(await nestjsApi.orders.get(params.id));
      setNotice("Delivery posted and fulfillment moved to Delivered.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Delivery could not be created.";
      setError(
        message.includes("changed by another operation") ||
          message.includes("409")
          ? "This order was updated elsewhere. The latest state has been reloaded; review it before creating delivery."
          : message,
      );
      try {
        setOrder(await nestjsApi.orders.get(params.id));
      } catch {
        // Preserve delivery error.
      }
    } finally {
      setMutating("");
    }
  }

  if (loading)
    return (
      <div className="adminOrderState">
        <Loader2 size={28} /> Loading order...
      </div>
    );

  if (error && !order) {
    return (
      <div className="adminOrderState">
        <p>{error}</p>
        <Link className="adminButton" href="/admin/orders">
          Back to orders
        </Link>
      </div>
    );
  }

  if (!order) return null;

  const reconciliationPayments = payments.filter(
    (payment) => payment.reconciliationRequired,
  );

  return (
    <>
      <div className="adminPageHead">
        <div>
          <div className="adminEyebrow">Order Detail</div>
          <h1>{order.orderNumber}</h1>
          <p>
            {order.customerEmail} · Version {order.version} · Internal ID{" "}
            {order.id}
          </p>
        </div>
        <div className="adminOrderActions">
          <button
            className="adminButton"
            onClick={loadOrder}
            disabled={Boolean(mutating)}
          >
            <RotateCcw size={15} /> Refresh
          </button>
          <Link className="adminButton" href="/admin/orders">
            Back
          </Link>
        </div>
      </div>

      {notice ? (
        <div className="adminSuccess" style={{ marginBottom: 18 }}>
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="adminNotice" style={{ marginBottom: 18 }}>
          {error}
        </div>
      ) : null}
      {reconciliationPayments.length ? (
        <div className="adminOrderReconciliationBanner" role="alert">
          <strong>Payment reconciliation required</strong>
          <span>
            {reconciliationPayments[0].reconciliationReason ||
              "Review the payment attempt and Order state before fulfillment."}
          </span>
        </div>
      ) : null}

      <div className="adminOrderDetailGrid">
        <section className="adminPanel adminOrderDetailMain">
          <div className="adminPanelHead">
            <h2>Order</h2>
            <span>Expected version {order.version}</span>
          </div>
          <div className="adminOrderMetrics">
            <div>
              <small>Total</small>
              <strong>{money(order.totalMinor, order.currency)}</strong>
              <span>{order.currency}</span>
            </div>
            <div>
              <small>Order status</small>
              {badge(order.orderStatus)}
            </div>
            <div>
              <small>Fulfillment</small>
              {badge(order.fulfillmentStatus)}
            </div>
            <div>
              <small>Created</small>
              <strong>{date(order.createdAt)}</strong>
            </div>
          </div>

          <div className="adminOrderTransitionPanel">
            <div>
              <h3>Order status</h3>
              {legalOrderTransitions.length === 0 ? (
                <p>No legal order transitions are available.</p>
              ) : (
                legalOrderTransitions.map((status) => (
                  <button
                    className="adminButton primary"
                    key={status}
                    onClick={() => transition("order", status)}
                    disabled={Boolean(mutating)}
                  >
                    {mutating === `order:${status}`
                      ? "Saving..."
                      : `Move to ${label(status)}`}
                  </button>
                ))
              )}
            </div>
            <div>
              <h3>Fulfillment status</h3>
              {legalFulfillmentTransitions.length === 0 ? (
                <p>No legal fulfillment transitions are available.</p>
              ) : (
                legalFulfillmentTransitions.map((status) => (
                  <button
                    className="adminButton primary"
                    key={status}
                    onClick={() => transition("fulfillment", status)}
                    disabled={Boolean(mutating)}
                  >
                    {mutating === `fulfillment:${status}`
                      ? "Saving..."
                      : `Move to ${label(status)}`}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="adminOrderCommunication">
            <div className="adminPanelHead">
              <h2>Payments</h2>
              <button
                className="adminButton"
                onClick={loadPayments}
                disabled={paymentsLoading}
              >
                {paymentsLoading ? "Loading…" : "Refresh payments"}
              </button>
            </div>
            {payments.length === 0 ? (
              <p className="adminMuted">No payment attempts.</p>
            ) : (
              <div className="adminPaymentAttempts">
                {payments.map((payment) => (
                  <article key={payment.id}>
                    <div>
                      <strong>
                        {money(payment.amountMinor, payment.currency)}
                      </strong>
                      {badge(payment.status)}
                    </div>
                    <p>
                      {payment.provider === "wallet"
                        ? "Store Credit"
                        : `${label(payment.provider)} provider`}{" "}
                      · {date(payment.createdAt)}
                    </p>
                    {payment.reconciliationRequired ? (
                      <p role="alert">
                        Reconciliation required:{" "}
                        {payment.reconciliationReason ??
                          "Review this payment and Order."}
                      </p>
                    ) : null}
                    <button
                      className="adminButton"
                      onClick={() => loadPaymentEvents(payment.id)}
                    >
                      {selectedPaymentId === payment.id
                        ? "Events selected"
                        : "View events"}
                    </button>
                  </article>
                ))}
              </div>
            )}
            {selectedPaymentId ? (
              <ol className="adminOrderEvents adminPaymentEvents">
                {paymentEvents.length === 0 ? (
                  <li>No provider events.</li>
                ) : (
                  paymentEvents.map((event) => (
                    <li key={event.id}>
                      <strong>{label(event.eventType)}</strong>
                      <span>{label(event.status)}</span>
                      <small>{date(event.createdAt)}</small>
                    </li>
                  ))
                )}
              </ol>
            ) : null}
          </div>

          <div className="adminOrderCommunication">
            <div className="adminPanelHead">
              <h2>Customer conversation</h2>
              <button
                className="adminButton"
                onClick={loadCommunication}
                disabled={communicationLoading || Boolean(mutating)}
              >
                Refresh chat
              </button>
            </div>
            <div className="adminSensitiveNotice">
              Never ask for passwords, 2FA codes, card details, or account
              credentials in normal chat.
            </div>
            {communicationLoading ? (
              <p className="adminMuted">Loading conversation…</p>
            ) : null}
            <ol className="adminChatMessages">
              {messages.length === 0 ? (
                <li className="empty">No messages yet.</li>
              ) : (
                messages.map((message) => (
                  <li
                    className={
                      message.senderType === "admin" ? "staff" : "customer"
                    }
                    key={message.id}
                  >
                    <div>
                      <strong>
                        {message.senderType === "admin"
                          ? "MehtaXD"
                          : message.senderLabel}
                      </strong>
                      <time>{date(message.createdAt)}</time>
                    </div>
                    <p>{message.body}</p>
                    {message.senderType === "admin" ? (
                      <span
                        className={`adminMessageReceipt ${message.receiptStatus}`}
                        aria-label={message.receiptLabel}
                        title={message.receiptLabel}
                      >
                        {message.receiptStatus === "sent" ? "✓" : "✓✓"}{" "}
                        <span>{message.receiptLabel}</span>
                      </span>
                    ) : null}
                  </li>
                ))
              )}
            </ol>
            <div className="adminChatComposer">
              <label htmlFor="admin-chat-body">Reply to customer</label>
              <textarea
                id="admin-chat-body"
                value={chatBody}
                maxLength={4000}
                onChange={(event) => setChatBody(event.target.value)}
                placeholder="Write a concise order update…"
              />
              <button
                className="adminButton primary"
                onClick={sendAdminMessage}
                disabled={!chatBody.trim() || Boolean(mutating)}
              >
                {mutating === "chat" ? "Sending…" : "Send reply"}
              </button>
            </div>
          </div>

          <div className="adminOrderCommunication">
            <div className="adminPanelHead">
              <h2>Delivery</h2>
              <span>Requires confirmed + processing</span>
            </div>
            <div className="adminDeliveryList">
              {deliveries.length === 0 ? (
                <p className="adminMuted">No delivery records yet.</p>
              ) : (
                deliveries.map((delivery) => (
                  <article key={delivery.id}>
                    <div>
                      <strong>
                        {delivery.customerVisibleSummary ||
                          label(delivery.deliveryType)}
                      </strong>
                      <time>{date(delivery.deliveredAt)}</time>
                    </div>
                    <pre>{delivery.payload || "Redacted"}</pre>
                    <small>
                      {delivery.acknowledgedAt
                        ? `Acknowledged ${date(delivery.acknowledgedAt)}`
                        : "Waiting for customer acknowledgement"}
                    </small>
                    {delivery.acknowledgement ? (
                      <section
                        className="adminDeliveryEvidence"
                        aria-label="Customer delivery acknowledgement"
                      >
                        <div className="adminDeliveryEvidenceHead">
                          <strong>Customer delivery acknowledgement</strong>
                          <span
                            className={delivery.acknowledgement.integrityStatus}
                          >
                            Integrity{" "}
                            {label(delivery.acknowledgement.integrityStatus)}
                          </span>
                        </div>
                        <dl>
                          <div>
                            <dt>Confirmed</dt>
                            <dd>
                              {date(delivery.acknowledgement.acknowledgedAt)}
                            </dd>
                          </div>
                          <div>
                            <dt>Customer</dt>
                            <dd>
                              {delivery.acknowledgement.customerName ||
                                "Not provided"}
                              <br />
                              {delivery.acknowledgement.customerEmail}
                            </dd>
                          </div>
                          <div>
                            <dt>Email verified</dt>
                            <dd>
                              {delivery.acknowledgement.emailVerified
                                ? "Yes"
                                : "No"}
                            </dd>
                          </div>
                          <div>
                            <dt>Source IP</dt>
                            <dd>
                              {delivery.acknowledgement.sourceIp ||
                                "Unavailable"}
                            </dd>
                          </div>
                          <div>
                            <dt>Device</dt>
                            <dd>
                              {delivery.acknowledgement.deviceSummary ||
                                "Unavailable"}
                            </dd>
                          </div>
                          <div>
                            <dt>Payment reference</dt>
                            <dd>
                              {delivery.acknowledgement.paymentReference ||
                                "No provider reference"}
                            </dd>
                          </div>
                        </dl>
                        <p>{delivery.acknowledgement.confirmationText}</p>
                        {delivery.acknowledgement.userAgent ? (
                          <details>
                            <summary>Raw User-Agent</summary>
                            <code>{delivery.acknowledgement.userAgent}</code>
                          </details>
                        ) : null}
                        {delivery.acknowledgement.integrityStatus ===
                        "valid" ? (
                          <button
                            className="adminButton"
                            type="button"
                            disabled={downloadingEvidenceId !== null}
                            onClick={() => void downloadEvidence(delivery.id)}
                          >
                            {downloadingEvidenceId === delivery.id ? (
                              <>
                                <Loader2 className="adminSpinner" size={15} />
                                Downloading…
                              </>
                            ) : (
                              "Download Evidence PDF"
                            )}
                          </button>
                        ) : null}
                      </section>
                    ) : null}
                    {!delivery.acknowledgement &&
                    delivery.acknowledgementIntegrityStatus === "missing" ? (
                      <section
                        className="adminDeliveryEvidence missing"
                        aria-label="Missing customer delivery acknowledgement evidence"
                      >
                        <div className="adminDeliveryEvidenceHead">
                          <strong>Customer delivery acknowledgement</strong>
                          <span className="invalid">Integrity missing</span>
                        </div>
                        <p>
                          This delivery is marked as acknowledged, but its
                          evidence record is unavailable. Investigate before
                          relying on this receipt.
                        </p>
                      </section>
                    ) : null}
                  </article>
                ))
              )}
            </div>
            <div className="adminDeliveryForm">
              <label>
                Delivery type
                <select
                  value={deliveryType}
                  onChange={(event) =>
                    setDeliveryType(event.target.value as typeof deliveryType)
                  }
                >
                  <option value="instructions">Instructions</option>
                  <option value="code">Code</option>
                  <option value="text">Text</option>
                </select>
              </label>
              <label>
                Customer-visible summary
                <input
                  value={deliverySummary}
                  maxLength={220}
                  onChange={(event) => setDeliverySummary(event.target.value)}
                  placeholder="Delivered unlock instructions"
                />
              </label>
              <label>
                Delivery content
                <textarea
                  value={deliveryPayload}
                  maxLength={8000}
                  onChange={(event) => setDeliveryPayload(event.target.value)}
                  placeholder="Paste only safe delivery text/code. Do not store account passwords here."
                />
              </label>
              <button
                className="adminButton primary"
                onClick={createDelivery}
                disabled={!deliveryPayload.trim() || Boolean(mutating)}
              >
                {mutating === "delivery"
                  ? "Posting delivery…"
                  : "Post delivery"}
              </button>
            </div>
          </div>

          <h2 className="adminOrderSubhead">Items</h2>
          <div className="adminOrderItems">
            {order.items.map((item) => (
              <article key={item.id}>
                <div className="adminOrderItemImage">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" />
                  ) : (
                    <span>{item.productName.slice(0, 2).toUpperCase()}</span>
                  )}
                </div>
                <div>
                  <span>
                    {[item.gameName, item.categoryName]
                      .filter(Boolean)
                      .join(" / ") || item.productType}
                  </span>
                  <h3>{item.productName}</h3>
                  <p>
                    {item.deliveryInformation || "No delivery note stored."}
                  </p>
                </div>
                <dl>
                  <div>
                    <dt>Quantity</dt>
                    <dd>{item.quantity}</dd>
                  </div>
                  <div>
                    <dt>Unit</dt>
                    <dd>{money(item.unitPriceMinor, item.currency)}</dd>
                  </div>
                  <div>
                    <dt>Line</dt>
                    <dd>{money(item.lineTotalMinor, item.currency)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </section>

        <aside className="adminOrderSide">
          <section className="adminPanel">
            <div className="adminPanelHead">
              <h2>Customer</h2>
            </div>
            <dl className="adminOrderFacts">
              <div>
                <dt>Email snapshot</dt>
                <dd>{order.customerEmail}</dd>
              </div>
              <div>
                <dt>Name snapshot</dt>
                <dd>{order.customerName || "Not provided"}</dd>
              </div>
              <div>
                <dt>Customer ID</dt>
                <dd>{order.customerId}</dd>
              </div>
              <div>
                <dt>Account status</dt>
                <dd>
                  {order.customerStatus
                    ? label(order.customerStatus)
                    : "Historical/guest snapshot"}
                </dd>
              </div>
            </dl>
            {order.customerId ? (
              <Link
                className="adminTextLink"
                href={`/admin/customers/${order.customerId}`}
              >
                Open customer record →
              </Link>
            ) : null}
          </section>

          <section className="adminPanel">
            <div className="adminPanelHead">
              <h2>Totals</h2>
            </div>
            <dl className="adminOrderFacts">
              <div>
                <dt>Subtotal</dt>
                <dd>{money(order.subtotalMinor, order.currency)}</dd>
              </div>
              <div>
                <dt>Discount</dt>
                <dd>{money(order.discountMinor, order.currency)}</dd>
              </div>
              <div>
                <dt>Tax</dt>
                <dd>{money(order.taxMinor, order.currency)}</dd>
              </div>
              <div>
                <dt>Fee</dt>
                <dd>{money(order.feeMinor, order.currency)}</dd>
              </div>
              <div>
                <dt>Paid</dt>
                <dd>{money(order.paidMinor, order.currency)}</dd>
              </div>
              <div>
                <dt>Refunded</dt>
                <dd>{money(order.refundedMinor, order.currency)}</dd>
              </div>
            </dl>
          </section>

          <section className="adminPanel">
            <div className="adminPanelHead">
              <h2>Lifecycle</h2>
            </div>
            <dl className="adminOrderFacts">
              <div>
                <dt>Expires</dt>
                <dd>{date(order.expiresAt)}</dd>
              </div>
              <div>
                <dt>Paid</dt>
                <dd>{date(order.paidAt)}</dd>
              </div>
              <div>
                <dt>Cancelled</dt>
                <dd>{date(order.cancelledAt)}</dd>
              </div>
              <div>
                <dt>Completed</dt>
                <dd>{date(order.completedAt)}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{date(order.updatedAt)}</dd>
              </div>
            </dl>
          </section>

          <section className="adminPanel">
            <div className="adminPanelHead">
              <h2>Events</h2>
            </div>
            <ol className="adminOrderEvents">
              {(order.events || []).map((event) => (
                <li key={event.id}>
                  <strong>{eventText(event)}</strong>
                  <span>{event.actorType}</span>
                  <small>{date(event.createdAt)}</small>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}
