"use client";

import type { Route } from "next";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Loader2 } from "@/components/icons";
import {
  type AdminCustomer,
  type AdminCustomerAudit,
  type AdminCustomerNote,
  type AdminCustomerOrderList,
  type AdminWallet,
  type CustomerAuthProvider,
  nestjsApi,
} from "@/lib/nestjs-api";

type SecurityAction = "suspend" | "ban" | "reactivate" | "revoke";
type MutationTarget = "security" | "note" | "credit";

function label(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function date(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).format(value / 100);
}

function providerLabel(provider: CustomerAuthProvider) {
  return provider === "password" ? "Email & password" : label(provider);
}

function parseUsdMinor(value: string) {
  if (!/^\d{1,5}(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [major, cents = ""] = value.trim().split(".");
  const amount = Number(major) * 100 + Number(cents.padEnd(2, "0"));
  return amount >= 1 && amount <= 1_000_000 ? amount : null;
}

export default function AdminCustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<AdminCustomer | null>(null);
  const [orders, setOrders] = useState<AdminCustomerOrderList | null>(null);
  const [notes, setNotes] = useState<AdminCustomerNote[]>([]);
  const [audit, setAudit] = useState<AdminCustomerAudit[]>([]);
  const [wallet, setWallet] = useState<AdminWallet | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [error, setError] = useState("");
  const [action, setAction] = useState<SecurityAction | null>(null);
  const [reason, setReason] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditReason, setCreditReason] = useState("");
  const inFlight = useRef(false);
  const creditAttempt = useRef<{ signature: string; key: string } | null>(null);
  const [feedback, setFeedback] = useState<{
    target: MutationTarget; message: string; failed: boolean;
  } | null>(null);

  const refreshCustomer = useCallback(async () => {
    const [customerResponse, notesResponse, auditResponse, walletResponse] =
      await Promise.all([
        nestjsApi.customers.get(params.id),
        nestjsApi.customers.notes(params.id),
        nestjsApi.customers.audit(params.id),
        nestjsApi.customers.wallet(params.id),
      ]);
    setCustomer(customerResponse);
    setNotes(notesResponse);
    setAudit(auditResponse);
    setWallet(walletResponse);
  }, [params.id]);

  const loadCustomer = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await refreshCustomer();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Failed to load customer.",
      );
    } finally {
      setLoading(false);
    }
  }, [refreshCustomer]);

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      setOrders(await nestjsApi.customers.orders(params.id, page));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Failed to load orders.",
      );
    } finally {
      setOrdersLoading(false);
    }
  }, [page, params.id]);

  useEffect(() => void loadCustomer(), [loadCustomer]);
  useEffect(() => void loadOrders(), [loadOrders]);

  async function mutate(target: MutationTarget, save: () => Promise<string>) {
    // State alone does not block a second submit before React renders.
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setFeedback({ target, message: "Saving…", failed: false });
    try {
      const message = await save();
      setFeedback({ target, message, failed: false });
      try {
        await refreshCustomer();
      } catch {
        setFeedback({ target, failed: true, message: `${message} Latest data could not be loaded. Refresh the page; do not repeat the action.` });
      }
    } catch (caught) {
      setFeedback({ target, failed: true, message: caught instanceof Error ? caught.message : "The action could not be completed." });
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  function mutationNotice(target: MutationTarget) {
    return feedback?.target === target ? (
      <p className="adminNotice" role={feedback.failed ? "alert" : "status"}>
        {feedback.message}
      </p>
    ) : null;
  }

  async function submitSecurityAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customer || !action) return;
    await mutate("security", async () => {
      if (action === "revoke") {
        await nestjsApi.customers.revokeSessions(params.id, reason);
      } else {
        await nestjsApi.customers.transitionStatus(params.id, {
          action,
          expectedStatus: customer.status,
          reason,
        });
      }
      setAction(null);
      setReason("");
      return action === "revoke" ? "Refresh sessions revoked. Existing access may continue until token expiry (up to 15 minutes)." : `Customer ${action === "reactivate" ? "reactivated" : action === "ban" ? "banned" : "suspended"}.`;
    });
  }

  async function submitNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await mutate("note", async () => {
      await nestjsApi.customers.createNote(params.id, noteBody);
      setNoteBody("");
      return "Internal note added.";
    });
  }

  async function submitCredit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountMinor = parseUsdMinor(creditAmount);
    if (!amountMinor) {
      setFeedback({ target: "credit", failed: true, message: "Enter a USD amount from $0.01 to $10,000.00." });
      return;
    }
    await mutate("credit", async () => {
      const payload = { amountMinor, reason: creditReason.trim() };
      const signature = JSON.stringify([params.id, payload]);
      // Retain the same key after an ambiguous response, including dialog close/reopen.
      if (creditAttempt.current?.signature !== signature) {
        creditAttempt.current = { signature, key: `admin-wallet-${crypto.randomUUID()}` };
      }
      await nestjsApi.customers.addWalletCredit(
        params.id,
        payload,
        creditAttempt.current.key,
      );
      creditAttempt.current = null;
      setCreditOpen(false);
      setCreditAmount("");
      setCreditReason("");
      return "USD store credit added.";
    });
  }

  function availableActions() {
    if (!customer) return [];
    if (customer.status === "active") return ["suspend", "ban"] as const;
    if (customer.status === "suspended") return ["reactivate", "ban"] as const;
    return ["reactivate"] as const;
  }

  if (loading && !customer) {
    return (
      <div className="adminOrderState">
        <Loader2 size={28} /> Loading customer...
      </div>
    );
  }
  if (!customer) {
    return (
      <div className="adminCustomerError">
        <div className="adminEyebrow">Customer directory</div>
        <h1>Customer unavailable</h1>
        <p>{error || "Customer not found."}</p>
        <Link className="adminButton" href="/admin/customers">
          Back to customers
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="adminPageHead adminCustomerDetailHead">
        <div>
          <div className="adminEyebrow">Customer profile</div>
          <h1>{customer.displayName || "Unnamed customer"}</h1>
          <p>
            {customer.email || "No email"} ·{" "}
            <span className={`adminCustomerStatus ${customer.status}`}>
              {label(customer.status)}
            </span>
          </p>
        </div>
        <Link className="adminButton" href="/admin/customers">
          Back to customers
        </Link>
      </div>

      {error ? (
        <div className="adminNotice adminCustomerNotice">{error}</div>
      ) : null}

      <div className="adminCustomerDetailGrid">
        <section
          className="adminPanel"
          aria-labelledby="customer-overview-heading"
        >
          <div className="adminPanelHead">
            <h2 id="customer-overview-heading">Customer overview</h2>
            <span>Read-only identity</span>
          </div>
          <dl className="adminCustomerFacts">
            <div>
              <dt>Name</dt>
              <dd>{customer.displayName || "Not provided"}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{customer.email || "Not provided"}</dd>
            </div>
            <div>
              <dt>Customer ID</dt>
              <dd>{customer.id}</dd>
            </div>
            <div>
              <dt>Email verification</dt>
              <dd>{customer.emailVerified ? "Verified" : "Not verified"}</dd>
            </div>
            <div>
              <dt>Last login</dt>
              <dd>{date(customer.lastLoginAt)}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{date(customer.createdAt)}</dd>
            </div>
          </dl>
        </section>

        <section
          className="adminPanel adminCustomerSecurity"
          aria-labelledby="customer-security-heading"
        >
          <div className="adminPanelHead">
            <h2 id="customer-security-heading">Account status</h2>
            <span className={`adminCustomerStatus ${customer.status}`}>
              {label(customer.status)}
            </span>
          </div>
          <p>
            Status changes revoke active sessions when access is restricted.
          </p>
          <div className="adminCustomerActions">
            {availableActions().map((item) => (
              <button
                className={`adminButton ${item === "ban" ? "danger" : ""}`}
                key={item}
                disabled={submitting}
                onClick={() => { setFeedback(null); setAction(item); }}
              >
                {label(item)}
              </button>
            ))}
            <button className="adminButton" disabled={submitting} onClick={() => { setFeedback(null); setAction("revoke"); }}>
              Revoke all sessions
            </button>
          </div>
          {!action && mutationNotice("security")}
        </section>
      </div>

      <section
        className="adminPanel adminCustomerSection adminWalletPanel"
        aria-labelledby="customer-wallet-heading"
      >
        <div className="adminPanelHead">
          <div>
            <h2 id="customer-wallet-heading">Wallet / Store Credit</h2>
            <p>Append-only USD credit. Balance cannot be edited directly.</p>
          </div>
          <button className="adminButton" disabled={submitting} onClick={() => { setFeedback(null); setCreditOpen(true); }}>
            Add credit
          </button>
        </div>
        {!creditOpen && mutationNotice("credit")}
        {customer.status !== "active" ? (
          <div className="adminNotice">
            This customer is {customer.status}. Credit may be added for an operational reason, but it cannot be spent until the account is active.
          </div>
        ) : null}
        <div className="adminWalletBalance">
          <span>Available store credit</span>
          <strong>{money(wallet?.balanceMinor ?? 0, wallet?.currency ?? "USD")}</strong>
          <small>USD</small>
        </div>
        {wallet?.transactions.length ? (
          <div className="adminOrderTableShell adminCustomerNestedTable">
            <table className="adminOrderTable">
              <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Balance</th><th>Reference</th></tr></thead>
              <tbody>{wallet.transactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td data-label="Date">{date(transaction.createdAt)}</td>
                  <td data-label="Type">{label(transaction.type)}</td>
                  <td data-label="Amount" className={transaction.type === "admin_credit" ? "walletCredit" : "walletDebit"}>
                    {transaction.type === "admin_credit" ? "+" : "−"}{money(transaction.amountMinor, transaction.currency)}
                  </td>
                  <td data-label="Balance">{money(transaction.balanceAfterMinor, transaction.currency)}</td>
                  <td data-label="Reference">{transaction.orderNumber || transaction.reason || "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="adminCustomerEmpty">No wallet transactions yet.</p>}
      </section>

      <section
        className="adminPanel adminCustomerSection"
        aria-labelledby="customer-auth-heading"
      >
        <div className="adminPanelHead">
          <h2 id="customer-auth-heading">Authentication methods</h2>
          <span>{customer.authenticationMethods.length} linked</span>
        </div>
        {customer.authenticationMethods.length ? (
          <ul className="adminCustomerMethods">
            {customer.authenticationMethods.map((method) => (
              <li key={method.provider}>
                <span className="adminCustomerProvider">
                  {providerLabel(method.provider)}
                </span>
                <small>Linked {date(method.linkedAt)}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="adminCustomerEmpty">
            No authentication method is linked.
          </p>
        )}
      </section>

      <section
        className="adminPanel adminCustomerSection"
        aria-labelledby="customer-sessions-heading"
      >
        <div className="adminPanelHead">
          <div>
            <h2 id="customer-sessions-heading">Sessions</h2>
            <p>Safe lifecycle metadata only. Tokens are never displayed.</p>
          </div>
          <span>Latest 20</span>
        </div>
        {customer.sessions.length ? (
          <div className="adminOrderTableShell adminCustomerNestedTable">
            <table className="adminOrderTable adminCustomerSessionTable">
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Expires</th>
                  <th>Revoked</th>
                </tr>
              </thead>
              <tbody>
                {customer.sessions.map((session) => (
                  <tr key={session.id}>
                    <td data-label="Session">
                      <code>{session.id}</code>
                    </td>
                    <td data-label="Status">
                      <span
                        className={`adminCustomerSession ${session.status}`}
                      >
                        {label(session.status)}
                      </span>
                    </td>
                    <td data-label="Created">{date(session.createdAt)}</td>
                    <td data-label="Expires">{date(session.expiresAt)}</td>
                    <td data-label="Revoked">{date(session.revokedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="adminCustomerEmpty">
            No sessions recorded for this customer.
          </p>
        )}
      </section>

      <section
        className="adminPanel adminCustomerSection"
        aria-labelledby="customer-orders-heading"
      >
        <div className="adminPanelHead">
          <div>
            <h2 id="customer-orders-heading">Order history</h2>
            <p>Historical totals come from authoritative Order snapshots.</p>
          </div>
          <span>{orders?.total ?? 0} total</span>
        </div>
        {ordersLoading ? (
          <p className="adminCustomerEmpty">Loading orders...</p>
        ) : orders?.items.length ? (
          <>
            <div className="adminOrderTableShell adminCustomerNestedTable">
              <table className="adminOrderTable adminCustomerOrdersTable">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Fulfillment</th>
                    <th>Created</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {orders.items.map((order) => (
                    <tr key={order.id}>
                      <td data-label="Order">
                        <strong>{order.orderNumber}</strong>
                      </td>
                      <td data-label="Total">
                        {money(order.totalMinor, order.currency)}{" "}
                        <small>{order.currency}</small>
                      </td>
                      <td data-label="Status">
                        <span
                          className={`adminOrderBadge ${order.orderStatus.replaceAll("_", "-")}`}
                        >
                          {label(order.orderStatus)}
                        </span>
                      </td>
                      <td data-label="Fulfillment">
                        <span
                          className={`adminOrderBadge ${order.fulfillmentStatus.replaceAll("_", "-")}`}
                        >
                          {label(order.fulfillmentStatus)}
                        </span>
                      </td>
                      <td data-label="Created">{date(order.createdAt)}</td>
                      <td data-label="Actions">
                        <Link
                          className="adminIconButton"
                          href={`/admin/orders/${order.id}` as Route}
                          aria-label={`Open order ${order.orderNumber}`}
                        >
                          <ArrowUpRight size={16} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="adminOrderPager">
              <button
                className="adminButton"
                disabled={page <= 1 || ordersLoading}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous
              </button>
              <span>
                Page {orders.page} of {Math.max(orders.totalPages, 1)}
              </span>
              <button
                className="adminButton"
                disabled={page >= orders.totalPages || ordersLoading}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </button>
            </div>
          </>
        ) : (
          <p className="adminCustomerEmpty">This customer has no orders.</p>
        )}
      </section>

      <section
        className="adminPanel adminCustomerSection"
        aria-labelledby="customer-notes-heading"
      >
        <div className="adminPanelHead">
          <h2 id="customer-notes-heading">Internal notes</h2>
          <span>Admin only</span>
        </div>
        <form className="adminCustomerNoteForm" onSubmit={submitNote} aria-busy={submitting}>
          {mutationNotice("note")}
          <label htmlFor="customer-note">Add operational context</label>
          <textarea
            id="customer-note"
            value={noteBody}
            onChange={(event) => setNoteBody(event.target.value)}
            maxLength={4000}
            required
            disabled={submitting}
            placeholder="Add a private support or customer note"
          />
          <div>
            <small>{noteBody.length}/4000</small>
            <button
              className="adminButton"
              disabled={submitting || !noteBody.trim()}
              type="submit"
            >
              {submitting && feedback?.target === "note" ? "Saving…" : "Add note"}
            </button>
          </div>
        </form>
        {notes.length ? (
          <ul className="adminCustomerTimeline">
            {notes.map((note) => (
              <li key={note.id}>
                <p>{note.body}</p>
                <small>
                  {note.adminName || note.adminEmail || "Former admin"} ·{" "}
                  {date(note.createdAt)}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="adminCustomerEmpty">No internal notes yet.</p>
        )}
      </section>

      <section
        className="adminPanel adminCustomerSection"
        aria-labelledby="customer-audit-heading"
      >
        <div className="adminPanelHead">
          <h2 id="customer-audit-heading">Security history</h2>
          <span>Immutable audit</span>
        </div>
        {audit.length ? (
          <ul className="adminCustomerTimeline">
            {audit.map((entry) => (
              <li key={entry.id}>
                <strong>{label(entry.action)}</strong>
                <p>{entry.reason}</p>
                {entry.action === "customer_wallet_credit_added" ? (
                  <p>Added {money(entry.amountMinor, entry.currency || "USD")} store credit.</p>
                ) : null}
                <small>
                  {entry.adminName || entry.adminEmail} ·{" "}
                  {date(entry.createdAt)}
                  {entry.revokedSessions
                    ? ` · ${entry.revokedSessions} session${entry.revokedSessions === 1 ? "" : "s"} revoked`
                    : ""}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="adminCustomerEmpty">
            No customer security actions recorded.
          </p>
        )}
      </section>

      {action ? (
        <div className="adminCustomerModalBackdrop" role="presentation">
          <form
            className="adminCustomerModal adminPanel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="customer-action-heading"
            onSubmit={submitSecurityAction}
            aria-busy={submitting}
          >
            <div className="adminEyebrow">Confirm security action</div>
            <h2 id="customer-action-heading">
              {action === "revoke" ? "Revoke all sessions" : label(action)}
            </h2>
            <p>
              {action === "revoke"
                ? "This action is audited and prevents session refresh. Existing access may continue for up to 15 minutes. Suspend the customer if immediate access restriction is required."
                : "This action is audited. Restricted accounts immediately lose customer API access."}
            </p>
            {mutationNotice("security")}
            <label htmlFor="customer-action-reason">Reason</label>
            <textarea
              id="customer-action-reason"
              autoFocus
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              minLength={10}
              maxLength={1000}
              required
              disabled={submitting}
              placeholder="Enter a clear operational reason"
            />
            <small>Reason must contain 10–1000 characters.</small>
            <div className="adminCustomerModalActions">
              <button
                className="adminButton"
                type="button"
                onClick={() => {
                  setAction(null);
                  setReason("");
                }}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                className={`adminButton ${action === "ban" ? "danger" : ""}`}
                type="submit"
                disabled={submitting || reason.trim().length < 10}
              >
                {submitting ? "Saving..." : "Confirm"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {creditOpen ? (
        <div className="adminCustomerModalBackdrop" role="presentation">
          <form
            className="adminCustomerModal adminPanel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wallet-credit-heading"
            onSubmit={submitCredit}
            aria-busy={submitting}
          >
            <div className="adminEyebrow">Store credit</div>
            <h2 id="wallet-credit-heading">Add wallet credit</h2>
            <p>This adds an immutable USD ledger entry. It does not mark any order paid.</p>
            {mutationNotice("credit")}
            <label htmlFor="wallet-credit-amount">Amount (USD)</label>
            <input
              id="wallet-credit-amount"
              autoFocus
              inputMode="decimal"
              value={creditAmount}
              onChange={(event) => setCreditAmount(event.target.value)}
              placeholder="10.00"
              required
              disabled={submitting}
            />
            <label htmlFor="wallet-credit-reason">Reason</label>
            <textarea
              id="wallet-credit-reason"
              value={creditReason}
              onChange={(event) => setCreditReason(event.target.value)}
              minLength={10}
              maxLength={1000}
              required
              disabled={submitting}
              placeholder="Explain why this store credit is being added"
            />
            <small>Enter $0.01–$10,000.00 USD and a reason of 10–1000 characters.</small>
            <div className="adminCustomerModalActions">
              <button className="adminButton" type="button" onClick={() => setCreditOpen(false)} disabled={submitting}>Cancel</button>
              <button className="adminButton" type="submit" disabled={submitting || !parseUsdMinor(creditAmount) || creditReason.trim().length < 10}>
                {submitting ? "Adding…" : "Confirm credit"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
