"use client";

import Link from "next/link";
import type { Route } from "next";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Loader2, RotateCcw } from "@/components/icons";
import {
  type AdminOrder,
  type AdminOrderQueue,
  type FulfillmentStatus,
  nestjsApi,
  type OrderStatus,
  type PaymentAttemptStatus,
  type PaymentSource,
} from "@/lib/nestjs-api";

const ORDER_STATUSES: OrderStatus[] = ["awaiting_payment", "confirmed", "completed", "cancelled", "expired"];
const FULFILLMENT_STATUSES: FulfillmentStatus[] = ["unfulfilled", "processing", "delivered", "completed", "cancelled"];
const PAYMENT_STATUSES: PaymentAttemptStatus[] = ["pending", "requires_action", "processing", "succeeded", "failed", "cancelled", "expired", "paid", "refunded", "partially_refunded"];
const QUEUES: Array<{ value: AdminOrderQueue; label: string; countKey: string }> = [
  { value: "all", label: "All", countKey: "all" },
  { value: "needs_payment", label: "Needs payment", countKey: "needsPayment" },
  { value: "ready_for_fulfillment", label: "Ready to fulfill", countKey: "readyForFulfillment" },
  { value: "processing", label: "Processing", countKey: "processing" },
  { value: "delivered", label: "Delivered", countKey: "delivered" },
  { value: "completed", label: "Completed", countKey: "completed" },
  { value: "cancelled", label: "Cancelled", countKey: "cancelled" },
  { value: "unread", label: "Unread", countKey: "unread" },
  { value: "reconciliation", label: "Reconciliation", countKey: "reconciliation" },
];

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(value / 100);
}

function date(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function summary(order: AdminOrder) {
  const first = order.items[0]?.productName || "No items";
  return order.items.length > 1 ? `${first} + ${order.items.length - 1} more` : first;
}

function badge(value: string) {
  return <span className={`adminOrderBadge ${value.replaceAll("_", "-")}`}>{label(value)}</span>;
}

function paymentSourceLabel(source: string | null | undefined) {
  if (source === "wallet") return "Store Credit";
  if (source === "test") return "Test Provider";
  return "No attempt";
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [orderStatus, setOrderStatus] = useState<OrderStatus | "">("");
  const [fulfillmentStatus, setFulfillmentStatus] = useState<FulfillmentStatus | "">("");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<PaymentAttemptStatus | "">("");
  const [paymentSource, setPaymentSource] = useState<PaymentSource | "">("");
  const [queue, setQueue] = useState<AdminOrderQueue>("all");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [unread, setUnread] = useState<"" | "true" | "false">("");
  const [reconciliation, setReconciliation] = useState<"" | "true" | "false">("");
  const [queueCounts, setQueueCounts] = useState<Record<string, number>>({});

  const params = useMemo(
    () => ({
      page,
      limit: 20,
      search: search || undefined,
      orderStatus: orderStatus || undefined,
      fulfillmentStatus: fulfillmentStatus || undefined,
      paymentStatus: paymentStatus || undefined,
      paymentSource: paymentSource || undefined,
      unread: unread ? unread === "true" : undefined,
      reconciliation: reconciliation ? reconciliation === "true" : undefined,
      queue,
      sort,
    }),
    [page, search, orderStatus, fulfillmentStatus, paymentStatus, paymentSource, unread, reconciliation, queue, sort],
  );

  useEffect(() => {
    void loadOrders();
  }, [params]);

  async function loadOrders() {
    setLoading(true);
    setError("");
    try {
      const response = await nestjsApi.orders.list(params);
      setOrders(response.items);
      setTotalPages(Math.max(response.totalPages, 1));
      setTotal(response.total);
      setQueueCounts(response.queueCounts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load orders.");
    } finally {
      setLoading(false);
    }
  }

  function updateOrderStatus(value: string) {
    setOrderStatus(value as OrderStatus | "");
    setPage(1);
  }

  function updateFulfillmentStatus(value: string) {
    setFulfillmentStatus(value as FulfillmentStatus | "");
    setPage(1);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchDraft.trim());
    setPage(1);
  }

  function resetFilters() {
    setSearchDraft("");
    setSearch("");
    setOrderStatus("");
    setFulfillmentStatus("");
    setPaymentStatus("");
    setPaymentSource("");
    setUnread("");
    setReconciliation("");
    setQueue("all");
    setSort("newest");
    setPage(1);
  }

  return (
    <>
      <div className="adminPageHead">
        <div>
          <div className="adminEyebrow">Commerce</div>
          <h1>Orders</h1>
          <p>Find orders, resolve payment exceptions, and move valid fulfillment work forward.</p>
        </div>
        <button className="adminButton" onClick={loadOrders} disabled={loading}>
          {loading ? <Loader2 size={15} /> : <RotateCcw size={15} />} Refresh
        </button>
      </div>

      <nav className="adminOrderQueues" aria-label="Order work queues">
        {QUEUES.map((item) => (
          <button key={item.value} className={queue === item.value ? "active" : ""} onClick={() => { setQueue(item.value); if (item.value === "unread") setUnread(""); if (item.value === "reconciliation") setReconciliation(""); setPage(1); }}>
            {item.label}<span>{queueCounts[item.countKey] ?? 0}</span>
          </button>
        ))}
      </nav>

      <div className="adminPanel adminOrderFilters">
        <form className="adminOrderSearch" onSubmit={submitSearch}>
          <label htmlFor="order-search">Search</label>
          <div><input id="order-search" value={searchDraft} maxLength={160} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Order number, email, or customer" /><button className="adminButton primary" type="submit">Search</button></div>
        </form>
        <label>
          <span>Order status</span>
          <select className="adminSelect" value={orderStatus} onChange={(event) => updateOrderStatus(event.target.value)}>
            <option value="">All order statuses</option>
            {ORDER_STATUSES.map((status) => <option key={status} value={status}>{label(status)}</option>)}
          </select>
        </label>
        <label>
          <span>Fulfillment</span>
          <select className="adminSelect" value={fulfillmentStatus} onChange={(event) => updateFulfillmentStatus(event.target.value)}>
            <option value="">All fulfillment statuses</option>
            {FULFILLMENT_STATUSES.map((status) => <option key={status} value={status}>{label(status)}</option>)}
          </select>
        </label>
        <label>
          <span>Payment status</span>
          <select className="adminSelect" value={paymentStatus} onChange={(event) => { setPaymentStatus(event.target.value as PaymentAttemptStatus | ""); setPage(1); }}>
            <option value="">All payment statuses</option>
            {PAYMENT_STATUSES.map((status) => <option key={status} value={status}>{label(status)}</option>)}
          </select>
        </label>
        <label>
          <span>Payment source</span>
          <select className="adminSelect" value={paymentSource} onChange={(event) => { setPaymentSource(event.target.value as PaymentSource | ""); setPage(1); }}>
            <option value="">All payment sources</option>
            <option value="wallet">Store Credit</option>
            <option value="test">Test Provider</option>
          </select>
        </label>
        <label>
          <span>Sort</span>
          <select className="adminSelect" value={sort} onChange={(event) => { setSort(event.target.value as "newest" | "oldest"); setPage(1); }}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>
        <label>
          <span>Customer chat</span>
          <select className="adminSelect" value={unread} onChange={(event) => { setUnread(event.target.value as typeof unread); setPage(1); }}>
            <option value="">All messages</option>
            <option value="true">Unread only</option>
            <option value="false">No unread</option>
          </select>
        </label>
        <label>
          <span>Reconciliation</span>
          <select className="adminSelect" value={reconciliation} onChange={(event) => { setReconciliation(event.target.value as typeof reconciliation); setPage(1); }}>
            <option value="">All payments</option>
            <option value="true">Review required</option>
            <option value="false">No review flag</option>
          </select>
        </label>
        <div>
          <strong>{total}</strong>
          <span>orders</span>
        </div>
        <button className="adminButton" type="button" onClick={resetFilters}>Clear filters</button>
      </div>

      {error ? <div className="adminNotice" style={{ marginBottom: 18 }}>{error}</div> : null}

      {loading ? (
        <div className="adminOrderState"><Loader2 size={28} /> Loading orders...</div>
      ) : orders.length === 0 ? (
        <div className="adminPanel adminOrderState">No orders match these filters.</div>
      ) : (
        <div className="adminOrderTableShell">
          <table className="adminOrderTable">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Fulfillment</th>
                <th>Chat</th>
                <th>Created</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td data-label="Order">
                    <strong>{order.orderNumber}</strong>
                    <small>{summary(order)}</small>
                  </td>
                  <td data-label="Customer">
                    <span>{order.customerEmail}</span>
                    <small>{order.customerName || "No customer name"}</small>
                  </td>
                  <td data-label="Total">{money(order.totalMinor, order.currency)} <small>{order.currency}</small></td>
                  <td data-label="Payment">
                    <strong>{paymentSourceLabel(order.paymentSource)}</strong>
                    <small>{order.paymentStatus ? label(order.paymentStatus) : "Awaiting attempt"}</small>
                    {order.reconciliationRequired ? <span className="adminOrderReconciliation">Review</span> : null}
                  </td>
                  <td data-label="Status">{badge(order.orderStatus)}</td>
                  <td data-label="Fulfillment">{badge(order.fulfillmentStatus)}</td>
                  <td data-label="Chat">{order.chatUnreadCount ? <span className="adminOrderBadge confirmed">{order.chatUnreadCount} new</span> : <small>Clear</small>}</td>
                  <td data-label="Created">{date(order.createdAt)}</td>
                  <td data-label="Actions">
                    <Link className="adminIconButton" href={`/admin/orders/${order.id}` as Route} aria-label={`Open order ${order.orderNumber}`}>
                      <ArrowUpRight size={16} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="adminOrderPager" aria-label="Order pagination">
        <button className="adminButton" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || loading}>
          Previous
        </button>
        <span>Page {page} of {totalPages}</span>
        <button className="adminButton" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages || loading}>
          Next
        </button>
      </div>
    </>
  );
}
