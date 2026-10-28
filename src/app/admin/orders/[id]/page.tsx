"use client";

import Link from "next/link";
import { OrderRefunds } from '@/components/order-refunds';
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowIcon, ChevronDown, Loader2, RotateCcw } from "@/components/icons";
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
  type CreateDeliveryDto,
  type DeliveryAttachment,
} from "@/lib/nestjs-api";
import {
  applyReceipt,
  mergeChatMessage,
  useAdminOrderChatRealtime,
} from "@/lib/order-chat-realtime";

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

function optionEntries(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
}

function mediaUrl(value: string) {
  try {
    if (/^https?:\/\//i.test(value)) return value;
    const configured = new URL(
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000",
    );
    return new URL(value, `${configured.origin}/`).toString();
  } catch {
    return value;
  }
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

export function isNearChatBottom(element: HTMLElement, threshold = 72) {
  return (
    element.scrollHeight - element.scrollTop - element.clientHeight <= threshold
  );
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
  const [deliveryFormOpen,setDeliveryFormOpen]=useState(false);
  const [deliveryImages,setDeliveryImages]=useState<DeliveryAttachment[]>([]);
  const [deliveryUncertain,setDeliveryUncertain]=useState(false);
  const deliveryOperation=useRef<{key:string;data:CreateDeliveryDto}|null>(null);
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
  const [showNewest, setShowNewest] = useState(false);
  const [connectionRestored, setConnectionRestored] = useState(false);
  const chatViewportRef = useRef<HTMLOListElement>(null);
  const followNewestRef = useRef(true);
  const previousConnectionRef = useRef<
    "connecting" | "connected" | "reconnecting" | "unauthorized" | "unavailable"
  >("connecting");

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
    if (order.paidMinor > 0 && order.refundedMinor >= order.paidMinor && order.fulfillmentStatus !== 'completed') return [];
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

  const loadCommunication = useCallback(async () => {
    setCommunicationLoading(true);
    try {
      const [chat, deliveryList] = await Promise.all([
        nestjsApi.orders.getChat(params.id),
        nestjsApi.orders.getDeliveries(params.id),
      ]);
      setMessages((current) =>
        chat.messages.items.reduce(
          (items, message) => mergeChatMessage(items, message),
          current,
        ),
      );
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
  }, [params.id]);

  function scrollToNewest(behavior: ScrollBehavior = "smooth") {
    const viewport = chatViewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior });
    followNewestRef.current = true;
    setShowNewest(false);
  }

  const connectionState = useAdminOrderChatRealtime({
    orderId: params.id,
    enabled: Boolean(order),
    onMessage: (message) => {
      const shouldFollow = followNewestRef.current;
      setMessages((current) => mergeChatMessage(current, message));
      if (shouldFollow) {
        window.requestAnimationFrame(() => scrollToNewest("smooth"));
      } else {
        setShowNewest(true);
      }
    },
    onReceipt: (update) =>
      setMessages((current) => applyReceipt(current, update)),
    onSync: () => void loadCommunication(),
  });

  useEffect(() => {
    const previous = previousConnectionRef.current;
    previousConnectionRef.current = connectionState;
    if (connectionState !== "connected" || previous !== "reconnecting") return;
    setConnectionRestored(true);
    const timeout = window.setTimeout(() => setConnectionRestored(false), 2400);
    return () => window.clearTimeout(timeout);
  }, [connectionState]);

  useEffect(() => {
    if (!followNewestRef.current) return;
    window.requestAnimationFrame(() => scrollToNewest("auto"));
  }, [messages.length]);

  function handleChatScroll() {
    const viewport = chatViewportRef.current;
    if (!viewport) return;
    const nearBottom = isNearChatBottom(viewport);
    followNewestRef.current = nearBottom;
    if (nearBottom) setShowNewest(false);
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
    if(kind==="fulfillment" && status==="delivered") {setDeliveryFormOpen(true);return;}
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
    const clientMessageId = `admin-web-${Date.now()}-${crypto.randomUUID()}`;
    const optimisticId = `optimistic:${clientMessageId}`;
    setMessages((current) => [
      ...current,
      {
        id: optimisticId,
        clientMessageId,
        senderType: "admin",
        senderLabel: "MehtaXD",
        messageType: "text",
        body,
        receiptStatus: "sent",
        receiptLabel: "Sent",
        createdAt: new Date().toISOString(),
        pending: true,
      },
    ]);
    followNewestRef.current = true;
    setChatBody("");
    setMutating("chat");
    setError("");
    try {
      const message = await nestjsApi.orders.sendMessage(order!.id, {
        body,
        clientMessageId,
      });
      setMessages((current) => mergeChatMessage(current, message));
    } catch (err) {
      setMessages((current) =>
        current.filter((message) => message.id !== optimisticId),
      );
      setChatBody(body);
      setError(
        err instanceof Error ? err.message : "Message could not be sent.",
      );
    } finally {
      setMutating("");
    }
  }

  async function createDelivery() {
    if (!order || mutating) return;
    setMutating("delivery");
    setError("");
    setNotice("");
    try {
      const operation=deliveryOperation.current ?? {key:`delivery-${crypto.randomUUID()}`,data:{
        deliveryType,
        customerVisibleSummary: deliverySummary.trim() || undefined,
        payload: deliveryPayload.trim(),
        attachmentIds:deliveryImages.map(image=>image.id),
        recoverMissing:order.fulfillmentStatus==="delivered" && deliveries.length===0,
        expectedVersion: order.version,
      }};
      deliveryOperation.current=operation;
      const delivery = await nestjsApi.orders.createDelivery(order.id,operation.data,operation.key);
      setDeliveries((current) => [...current.filter(item=>item.id!==delivery.id), delivery]);
      deliveryOperation.current=null;
      setDeliveryUncertain(false);setDeliveryImages([]);setDeliveryFormOpen(false);
      setDeliveryPayload("");
      setDeliverySummary("");
      setNotice("Delivery posted and fulfillment moved to Delivered.");
      try {setOrder(await nestjsApi.orders.get(params.id));await loadCommunication();}
      catch {setNotice("Delivery saved. Refresh this Order to load its latest details.");}
    } catch (err) {
      const definitive=err && typeof err==='object' && 'status' in err && [400,409,422].includes(Number(err.status));
      if(definitive) {deliveryOperation.current=null;setDeliveryUncertain(false);} else setDeliveryUncertain(true);
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

  async function uploadDeliveryImages(files:FileList|null) {
    if(!order || !files || mutating || deliveryUncertain)return;
    if(deliveryImages.length+files.length>5){setError("Choose at most 5 delivery images.");return;}
    setMutating("delivery-images");setError("");
    try {
      for(const file of Array.from(files)) {
        if(file.size>5*1024*1024 || !["image/png","image/jpeg","image/webp"].includes(file.type))throw new Error("Use PNG, JPEG or WebP images up to 5 MB each.");
        const image=await nestjsApi.orders.uploadDeliveryImage(order.id,file);
        setDeliveryImages(current=>[...current,image]);
      }
    } catch(err){setError(err instanceof Error?err.message:"Image upload failed. Uploaded images are preserved.");}
    finally{setMutating("");}
  }

  async function retryEvidence(deliveryId:string) {
    if(mutating)return;setMutating("evidence-retry");setError("");
    try{await nestjsApi.orders.retryDeliveryEvidence(params.id,deliveryId);await loadCommunication();setNotice("Evidence PDF retry requested. Refresh to check its status.");}
    catch(err){setError(err instanceof Error?err.message:"Evidence retry could not be requested.");}
    finally{setMutating("");}
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
  const latestPayment = payments[0] ?? null;
  const financialState = order.refundedMinor > 0
    ? order.refundedMinor >= order.paidMinor ? "refunded" : "partially_refunded"
    : latestPayment?.status || order.financialStatus || "unpaid";
  const canMarkDelivery=order.orderStatus==="confirmed" && order.paidMinor>order.refundedMinor && order.fulfillmentStatus==="processing";
  const canRecoverDelivery=order.orderStatus==="confirmed" && order.paidMinor>order.refundedMinor && order.fulfillmentStatus==="delivered" && deliveries.length===0 && !communicationLoading;

  return (
    <>
      <div className="adminPageHead adminOrderSummary">
        <div>
          <h1>{order.orderNumber}</h1>
          <p>{order.customerName || "Name not provided"}</p>
          <div className="adminOrderSummaryStatuses">
            {badge(order.orderStatus)}
            {badge(financialState)}
            {badge(order.fulfillmentStatus)}
          </div>
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

      <div className="adminOrderNextActions">
        <div className="adminOrderTransitionPanel">
          {legalOrderTransitions.length > 0 && (
            <div>
              <h3>Order status</h3>
              {legalOrderTransitions.map((status) => (
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
                ))}
            </div>
          )}
          {legalFulfillmentTransitions.length > 0 && (
            <div>
              <h3>Fulfillment status</h3>
              {legalFulfillmentTransitions.map((status) => (
                  <button
                    className="adminButton primary"
                    key={status}
                    onClick={() => transition("fulfillment", status)}
                    disabled={Boolean(mutating)}
                  >
                    {mutating === `fulfillment:${status}`
                      ? "Saving..."
                      : status==="delivered" ? "Mark Delivered" : `Move to ${label(status)}`}
                  </button>
                ))}
            </div>
          )}
          {!legalOrderTransitions.length &&
            !legalFulfillmentTransitions.length && (
              <p className="adminMuted">
                {order.orderStatus === "completed"
                  ? "Completed — no further actions required."
                  : "No status actions available."}
              </p>
            )}
        </div>
        {canRecoverDelivery ? <button className="adminButton" onClick={()=>setDeliveryFormOpen(true)} disabled={Boolean(mutating)}>Create missing delivery record</button>:null}
      </div>
      <div className="adminOrderDetailGrid adminOrderLayout">
        <section className="adminPanel adminOrderDetailMain adminOrderWork">
          <section className="adminOrderItemsSection">
            <h2 className="adminOrderSubhead">Items</h2>
            <div className="adminOrderItems">
              {order.items.map((item) => (
                <article key={item.id}>
                  <div className="adminOrderItemImage">
                    <span>{item.productName.slice(0, 2).toUpperCase()}</span>
                    {item.imageUrl ? (
                      <img
                        src={mediaUrl(item.imageUrl)}
                        alt=""
                        onError={(event) => {
                          event.currentTarget.hidden = true;
                        }}
                      />
                    ) : null}
                  </div>
                  <div>
                    <span>
                      {[item.gameName, item.categoryName]
                        .filter(Boolean)
                        .join(" / ") || item.productType}
                    </span>
                    <h3>{item.productName}</h3>
                    {item.variantLabel && item.variantLabel !== "Default" ? (
                      <p>
                        <strong>Variant:</strong> {item.variantLabel}
                      </p>
                    ) : null}
                    {optionEntries(item.selectedOptions).length ? (
                      <dl className="adminOrderItemOptions">
                        {optionEntries(item.selectedOptions).map(
                          ([name, value]) => (
                            <div key={name}>
                              <dt>{name}</dt>
                              <dd>{value}</dd>
                            </div>
                          ),
                        )}
                      </dl>
                    ) : null}
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
          <div className="adminOrderCommunication">
            <div className="adminPanelHead">
              <h2>Delivery</h2>
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
                    {delivery.payload ? <pre>{delivery.payload}</pre> : delivery.payload===null ? <p className="adminMuted">Delivery content was redacted.</p>:null}
                    {/* eslint-disable-next-line @next/next/no-img-element -- Authenticated evidence must bypass the public image optimizer. */}
                    {delivery.attachments?.length ? <div className="adminDeliveryAttachments">{delivery.attachments.map((image,index)=><a key={image.id} href={`/api/admin/backend/admin/orders/${order.id}/deliveries/${delivery.id}/attachments/${image.id}`} target="_blank" rel="noreferrer"><img src={`/api/admin/backend/admin/orders/${order.id}/deliveries/${delivery.id}/attachments/${image.id}`} alt={`Delivery screenshot ${index+1}`} loading="lazy" /></a>)}</div>:null}
                    <small>
                      {delivery.acknowledgedAt
                        ? `Acknowledged ${date(delivery.acknowledgedAt)}`
                        : "Delivered · Awaiting buyer confirmation"}
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
                        "valid" && (delivery.evidencePdf?.status==="ready" || delivery.acknowledgement.evidenceVersion==="1") ? (
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
                        ) : delivery.acknowledgement.integrityStatus==="valid" ? <div className="adminEvidencePending" role="status"><span>Evidence PDF pending</span><button className="adminButton" type="button" disabled={Boolean(mutating)} onClick={()=>void retryEvidence(delivery.id)}>Retry evidence PDF</button></div> : null}
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
            {(canMarkDelivery || canRecoverDelivery || deliveryUncertain) ? (
            <details id="delivery-entry" className="adminOrderDeliveryEntry" open={deliveryFormOpen} onToggle={event=>setDeliveryFormOpen(event.currentTarget.open)}>
              <summary>Delivery details (optional)</summary>
              <p className="adminMuted">{canRecoverDelivery ? "Creates the missing delivery record now. No historical content or buyer confirmation will be invented." : "Note, content and screenshots are optional."}</p>
              {deliveryUncertain ? <p role="alert">Delivery result is uncertain. Retry the original request below; its operation key and content are preserved.</p>:null}
              <div className="adminDeliveryForm">
                <label>Delivery type
                  <select value={deliveryType} disabled={deliveryUncertain || Boolean(mutating)} onChange={event=>setDeliveryType(event.target.value as typeof deliveryType)}>
                    <option value="instructions">Instructions</option><option value="code">Code</option><option value="text">Text</option>
                  </select>
                </label>
                <label>Customer-visible note (optional)
                  <input value={deliverySummary} maxLength={220} disabled={deliveryUncertain || Boolean(mutating)} onChange={event=>setDeliverySummary(event.target.value)} />
                </label>
                <label>Delivery content (optional)
                  <textarea value={deliveryPayload} maxLength={8000} disabled={deliveryUncertain || Boolean(mutating)} onChange={event=>setDeliveryPayload(event.target.value)} placeholder="Safe delivery instructions or code. Do not include passwords." />
                </label>
                <label>Screenshots (optional)
                  <input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={deliveryUncertain || Boolean(mutating) || deliveryImages.length>=5} onChange={event=>{void uploadDeliveryImages(event.target.files);event.target.value="";}} />
                  <small>Up to 5 images, 5 MB each. Stored encrypted.</small>
                </label>
                {deliveryImages.length ? <ul className="adminDeliveryUploads">{deliveryImages.map((image,index)=><li key={image.id}>Image {index+1} · {Math.ceil(image.sizeBytes/1024)} KB <button type="button" className="adminButton" disabled={deliveryUncertain || Boolean(mutating)} onClick={()=>setDeliveryImages(current=>current.filter(item=>item.id!==image.id))}>Remove image {index+1}</button></li>)}</ul>:null}
                <button className="adminButton primary" onClick={createDelivery} disabled={Boolean(mutating)}>
                  {mutating==="delivery" ? "Marking delivered…" : deliveryUncertain ? "Retry original delivery request" : canRecoverDelivery ? "Create delivery record now" : "Confirm & Mark Delivered"}
                </button>
              </div>
            </details>
            ):null}
          </div>
          <section
            className="adminOrderChatWorkspace"
            aria-labelledby="admin-order-chat-heading"
          >
            <div className="adminOrderChatPanel">
              <div className="adminOrderChatHead">
                <div>
                  <h2 id="admin-order-chat-heading">Customer conversation</h2>
                </div>
                <div className="adminChatHeadActions">
                  {connectionState === "connecting" ? (
                    <span className="adminChatConnection" role="status">
                      Connecting…
                    </span>
                  ) : connectionState === "reconnecting" ? (
                    <span
                      className="adminChatConnection reconnecting"
                      role="status"
                    >
                      Reconnecting…
                    </span>
                  ) : connectionState === "unauthorized" ? (
                    <span
                      className="adminChatConnection unavailable"
                      role="alert"
                    >
                      Chat authorization expired. Refresh this Order.
                    </span>
                  ) : connectionState === "unavailable" ? (
                    <span
                      className="adminChatConnection unavailable"
                      role="alert"
                    >
                      Order Chat is unavailable. Refresh this Order to retry.
                    </span>
                  ) : connectionRestored ? (
                    <span
                      className="adminChatConnection restored"
                      role="status"
                    >
                      Connection restored
                    </span>
                  ) : null}
                  <button
                    className="adminButton adminChatRefresh"
                    onClick={loadCommunication}
                    disabled={communicationLoading || Boolean(mutating)}
                  >
                    <RotateCcw size={14} />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>

              <div className="adminSensitiveNotice adminChatSafety">
                Never request passwords, 2FA codes, card details, or account
                credentials.
              </div>

              <div className="adminChatViewportShell">
                {communicationLoading && messages.length === 0 ? (
                  <div className="adminChatLoading" role="status">
                    <Loader2 className="adminSpinner" size={18} /> Loading
                    conversation…
                  </div>
                ) : null}
                <ol
                  className="adminChatMessages adminChatViewport"
                  ref={chatViewportRef}
                  onScroll={handleChatScroll}
                >
                  {messages.length === 0 && !communicationLoading ? (
                    <li className="empty">
                      No messages yet. Start with a clear order update.
                    </li>
                  ) : (
                    messages.map((message) => (
                      <li
                        className={
                          message.senderType === "admin" ? "staff" : "customer"
                        }
                        key={message.id}
                      >
                        <div className="adminMessageMeta">
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
                            <span
                              className="adminReceiptTicks"
                              aria-hidden="true"
                            >
                              {message.pending
                                ? "…"
                                : message.receiptStatus === "sent"
                                  ? "✓"
                                  : "✓✓"}
                            </span>
                            <span>
                              {message.pending
                                ? "Sending"
                                : message.receiptLabel}
                            </span>
                          </span>
                        ) : null}
                      </li>
                    ))
                  )}
                </ol>
                {showNewest ? (
                  <button
                    className="adminChatJump"
                    type="button"
                    onClick={() => scrollToNewest()}
                  >
                    <ChevronDown size={15} /> Jump to newest
                  </button>
                ) : null}
              </div>

              <div className="adminChatComposer">
                <label className="srOnly" htmlFor="admin-chat-body">
                  Reply to customer
                </label>
                <textarea
                  id="admin-chat-body"
                  value={chatBody}
                  rows={1}
                  maxLength={4000}
                  onChange={(event) => setChatBody(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      if (chatBody.trim() && !mutating) void sendAdminMessage();
                    }
                  }}
                  placeholder="Write an order update…"
                />
                <button
                  className="adminButton primary adminChatSend"
                  onClick={sendAdminMessage}
                  disabled={!chatBody.trim() || Boolean(mutating)}
                >
                  <span>{mutating === "chat" ? "Sending…" : "Send"}</span>
                  <ArrowIcon size={16} />
                </button>
              </div>
            </div>
          </section>
        </section>
        <aside className="adminOrderSide">
          <section className="adminPanel adminOrderCustomer">
            <h2>Customer</h2>
            <a href={`mailto:${order.customerEmail}`}>{order.customerEmail}</a>
            {order.customerId ? (
              <Link
                className="adminTextLink"
                href={`/admin/customers/${order.customerId}`}
              >
                Open customer record →
              </Link>
            ) : null}
          </section>
          <OrderRefunds orderId={order.id} onChanged={loadOrder}>
            <p className="adminOrderFinancialState">
              Financial status: {badge(financialState)}
            </p>
            <details
              className="adminOrderPaymentHistory"
              open={reconciliationPayments.length > 0}
            >
              <summary>Payment history</summary>
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
            </details>
            <details className="adminOrderTotalsDetails">
              <summary>Order totals</summary>
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
                  <dt>Order total</dt>
                  <dd>{money(order.totalMinor, order.currency)}</dd>
                </div>
              </dl>
            </details>
          </OrderRefunds>
          <details className="adminOrderActivity adminPanel">
            <summary>Activity &amp; technical details</summary>
            <section>
              <div className="adminPanelHead">
                <h2>Lifecycle</h2>
              </div>
              <dl className="adminOrderFacts">
                <div>
                  <dt>Created</dt>
                  <dd>{date(order.createdAt)}</dd>
                </div>
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

            <section>
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

            <dl className="adminOrderFacts">
              <div>
                <dt>Internal ID</dt>
                <dd>{order.id}</dd>
              </div>
              <div>
                <dt>Version</dt>
                <dd>{order.version}</dd>
              </div>
            </dl>
          </details>
        </aside>
      </div>
    </>
  );
}
