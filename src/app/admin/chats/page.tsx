"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Route } from "next";
import { Loader2 } from "@/components/icons";
import { type AdminChatInbox, nestjsApi } from "@/lib/nestjs-api";

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
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

export default function AdminChatsPage() {
  const [inbox, setInbox] = useState<AdminChatInbox | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadInbox() {
    setLoading(true);
    setError("");
    try {
      setInbox(await nestjsApi.orders.chatInbox());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load order chats.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInbox();
  }, []);

  return (
    <div className="adminOperationalPage adminChatsInboxPage">
      <div className="adminPageHead">
        <div>
          <div className="adminEyebrow">Customer communication</div>
          <h1>Order chats</h1>
          <p>One conversation per order. Open the order to reply, deliver, and review full context.</p>
        </div>
        <button className="adminButton" onClick={loadInbox}>Refresh</button>
      </div>

      {error ? <div className="adminNotice" style={{ marginBottom: 18 }}>{error}</div> : null}
      {loading ? (
        <div className="adminOrderState"><Loader2 size={28} /> Loading chats...</div>
      ) : !inbox?.items.length ? (
        <div className="adminPanel adminOrderState">No order conversations yet.</div>
      ) : (
        <div className="adminOrderTableShell">
          <table className="adminOrderTable adminOperationalTable adminChatsInboxTable">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Latest message</th>
                <th>Status</th>
                <th>Unread</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {inbox.items.map((item) => (
                <tr className={item.unreadCount ? "adminInboxUnread" : undefined} key={item.orderId}>
                  <td className="adminOperationalIdentity" data-label="Order"><strong>{item.orderNumber}</strong><small>{date(item.updatedAt)}</small></td>
                  <td className="adminOperationalCustomer" data-label="Customer"><strong>{item.customerEmail}</strong><small>{item.customerName || "No name"}</small></td>
                  <td className="adminOperationalPreview" data-label="Latest">{item.latestMessage ? <><strong>{item.latestMessage.senderType === "admin" ? "MehtaXD" : "Customer"}</strong><small>{item.latestMessage.body.slice(0, 90)}</small></> : <small>No messages</small>}</td>
                  <td className="adminOperationalOrderStatus" data-label="Status"><span className={`adminOrderBadge ${item.orderStatus.replaceAll("_", "-")}`}>{label(item.orderStatus)}</span><span className={`adminOrderBadge ${item.fulfillmentStatus.replaceAll("_", "-")}`}>{label(item.fulfillmentStatus)}</span></td>
                  <td className="adminOperationalUnread" data-label="Unread">{item.unreadCount ? <span className="adminOrderBadge confirmed">{item.unreadCount} new</span> : <small>Clear</small>}</td>
                  <td className="adminOperationalAction" data-label="Action"><Link className="adminIconButton" href={`/admin/orders/${item.orderId}` as Route}>Open chat</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
