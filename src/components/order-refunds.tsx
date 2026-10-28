"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  nestjsApi,
  type AdminRefundSummary,
  type CreateRefundInput,
} from "@/lib/nestjs-api";
import { refundMinor } from "@/lib/refund-form";

type Operation = { orderId?: string; key: string; body: CreateRefundInput };
const money = (value: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    value / 100,
  );
const destinationLabel = (value: string) =>
  value === "store_credit" ? "Store Credit" : "Original payment method";

export function OrderRefunds({
  orderId,
  onChanged,
  children,
}: {
  orderId: string;
  onChanged: () => Promise<void>;
  children?: ReactNode;
}) {
  const [summary, setSummary] = useState<AdminRefundSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState("full");
  const [amount, setAmount] = useState("");
  const [destination, setDestination] =
    useState<CreateRefundInput["destination"]>("store_credit");
  const [reason, setReason] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [reference, setReference] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [recoveryOrder, setRecoveryOrder] = useState<string | null>(null);
  const inFlight = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const storageKey = `mxd_refund:${orderId}`;

  const load = useCallback(async () => {
    const next = await nestjsApi.orders.refunds(orderId);
    setSummary(next);
    return next;
  }, [orderId]);

  useEffect(() => {
    let active = true;
    // Restore protection before any network work; a failed GET must never unlock it.
    void Promise.resolve()
      .then(() => {
        if (!active) return;
        try {
          const raw = window.sessionStorage.getItem(storageKey);
          if (raw) {
            const saved = JSON.parse(raw) as Operation;
            if (
              !saved.key ||
              !saved.body ||
              (saved.orderId && saved.orderId !== orderId) ||
              !Number.isSafeInteger(saved.body.amountMinor) ||
              saved.body.amountMinor <= 0 ||
              !["store_credit", "original_payment_manual"].includes(
                saved.body.destination,
              ) ||
              typeof saved.body.reason !== "string"
            )
              throw new Error("Invalid saved operation");
            setOperation(saved);
            setError(
              "Previous refund outcome is uncertain. Check status before issuing another refund.",
            );
          }
        } catch {
          setError(
            "Saved refund operation cannot be read. Review Order refund history before continuing.",
          );
          setOperation({
            key: "invalid",
            body: { amountMinor: 0, destination: "store_credit", reason: "" },
          });
        }
        setRecoveryOrder(orderId);
        return nestjsApi.orders.refunds(orderId).then((next) => {
          if (active) setSummary(next);
        });
      })
      .catch(() => {
        if (active)
          setError(
            "Refund history could not load. Retry before issuing a refund.",
          );
      });
    return () => {
      active = false;
    };
  }, [orderId, storageKey]);

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
  }, [open]);

  async function checkStatus() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const next = await load();
      const matched =
        operation &&
        next.history.find((r) => r.idempotencyKey === operation.key);
      if (matched?.status === "succeeded" || matched?.status === "failed") {
        window.sessionStorage.removeItem(storageKey);
        setOperation(null);
        setError("");
        setNotice(`Refund ${matched.status}.`);
        await onChanged();
      } else if (operation) {
        setError(
          "Refund outcome is still uncertain. Retry only the original request or contact technical support.",
        );
      } else setError("");
    } catch {
      setError("Refund status is unavailable. Do not submit a second refund.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function send(saved: Operation) {
    if (inFlight.current || saved.key === "invalid") return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      // Storage must succeed before money can move, so refresh retains the exact operation.
      window.sessionStorage.setItem(storageKey, JSON.stringify(saved));
      setOperation(saved);
      const result = await nestjsApi.orders.createRefund(
        orderId,
        saved.body,
        saved.key,
      );
      if (result.status === "failed") {
        window.sessionStorage.removeItem(storageKey);
        setOperation(null);
        setError(
          "Refund failed without a financial effect. Reload the remaining balance before correcting the request.",
        );
        await load().catch(() => setSummary(null));
        return;
      }
      if (result.status !== "succeeded")
        throw new Error("Refund needs reconciliation");
      setSummary(null);
      window.sessionStorage.removeItem(storageKey);
      setOperation(null);
      setOpen(false);
      setReason("");
      setReference("");
      setConfirmed(false);
      setNotice("Refund recorded successfully.");
      await load().catch(() =>
        setError(
          "Refund succeeded. Remaining balance could not load; check status before issuing another refund.",
        ),
      );
      await onChanged().catch(() =>
        setError("Refund succeeded. Reload the Order to refresh its details."),
      );
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        Reflect.get(error, "refundOutcome") === "rejected"
      ) {
        window.sessionStorage.removeItem(storageKey);
        setOperation(null);
        setError(
          "Refund was rejected without a financial effect. Review the amount, destination and remaining balance before trying again.",
        );
        await load().catch(() => setSummary(null));
      } else
        setError(
          "Refund outcome is uncertain. Check status or retry the original request; do not issue another refund.",
        );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current || operation || !summary || recoveryOrder !== orderId)
      return;
    const minor =
      scope === "full" ? summary.remainingRefundableMinor : refundMinor(amount);
    if (!minor || minor > summary.remainingRefundableMinor || !reason.trim()) {
      setError("Enter a valid refund amount and reason.");
      return;
    }
    const body: CreateRefundInput = {
      amountMinor: minor,
      destination,
      reason: reason.trim(),
    };
    if (destination === "store_credit" && !summary.storeCreditAllowed) {
      setError("Store Credit refunds require a USD Order.");
      return;
    }
    if (destination === "original_payment_manual") {
      const source = summary.sourcePayments.find(
        (p) => p.id === paymentId && p.provider !== "wallet",
      );
      if (
        !source ||
        minor > source.availableMinor ||
        !confirmed ||
        !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(reference)
      ) {
        setError(
          "Select the original payment, a valid reference and confirm the external refund. Amount cannot exceed that payment’s remaining balance.",
        );
        return;
      }
      Object.assign(body, {
        paymentId,
        externalReference: reference,
        manualRefundConfirmed: true,
      });
    }
    await send({ orderId, key: crypto.randomUUID(), body });
  }

  return (
    <section
      className="adminPanel adminFinancialSummary adminRefunds"
      aria-labelledby="refund-heading"
    >
      <div className="adminPanelHead">
        <h2 id="refund-heading">Financial summary</h2>
        <button
          className="adminButton"
          type="button"
          onClick={() => {
            setOpen(true);
            setNotice("");
          }}
          disabled={
            busy ||
            recoveryOrder !== orderId ||
            !!operation ||
            !summary ||
            summary.remainingRefundableMinor <= 0 ||
            summary.reconciliationRequired
          }
        >
          Issue refund
        </button>
      </div>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      <button
        className="adminButton"
        type="button"
        disabled={busy}
        onClick={checkStatus}
      >
        {busy ? "Checking…" : "Check refund status"}
      </button>
      {operation && operation.key !== "invalid" && (
        <button
          className="adminButton"
          type="button"
          disabled={busy}
          onClick={() => send(operation)}
        >
          Retry original request
        </button>
      )}
      {summary ? (
        <>
          <dl className="adminRefundTotals">
            <div>
              <dt>Amount paid</dt>
              <dd>{money(summary.paidMinor, summary.currency)}</dd>
            </div>
            <div>
              <dt>Refunded</dt>
              <dd>{money(summary.refundedMinor, summary.currency)}</dd>
            </div>
            <div>
              <dt>Remaining refundable</dt>
              <dd>
                {money(summary.remainingRefundableMinor, summary.currency)}
              </dd>
            </div>
          </dl>
          {summary.refundedMinor > 0 && (
            <p>
              <strong>
                {summary.refundedMinor >= summary.paidMinor
                  ? "Refunded"
                  : "Partially refunded"}
              </strong>{" "}
              · Fulfillment history is unchanged.
            </p>
          )}
          {summary.reconciliationRequired && (
            <p role="alert">
              Existing refund totals require manual review. New refunds are
              blocked.
            </p>
          )}
          {summary.history.length ? (
            <details
              className="adminRefundHistoryDetails"
              open={summary.history.some(
                (refund) =>
                  refund.status === "pending" ||
                  refund.status === "needs_review",
              )}
            >
              <summary>Refund history ({summary.history.length})</summary>
              <ol className="adminRefundHistory">
                {summary.history.map((r) => (
                  <li key={r.id}>
                    <strong>
                      {money(r.amountMinor, r.currency)} ·{" "}
                      {r.scope === "full" ? "Full" : "Partial"} ·{" "}
                      {destinationLabel(r.destination)}
                    </strong>
                    <p>
                      {r.status.replaceAll("_", " ")} ·{" "}
                      {new Date(r.createdAt).toLocaleString()}
                    </p>
                    <p>{r.reason}</p>
                    <small>
                      Admin {r.adminUserId} · Refund {r.id}
                      {r.externalReference
                        ? ` · Reference ${r.externalReference}`
                        : ""}
                    </small>
                  </li>
                ))}
              </ol>
            </details>
          ) : (
            <p className="adminMuted">No refunds recorded.</p>
          )}
        </>
      ) : (
        <p role="status">
          Load authoritative refund history before issuing a refund.
        </p>
      )}
      {children}
      {open && summary && (
        <dialog
          ref={dialog}
          className="adminCustomerModal adminRefundDialog"
          aria-labelledby="issue-refund-title"
          onCancel={(e) => {
            if (busy || operation) e.preventDefault();
            else setOpen(false);
          }}
        >
          <form onSubmit={submit} aria-busy={busy}>
            <h2 id="issue-refund-title">Issue refund</h2>
            <p>
              Remaining refundable:{" "}
              {money(summary.remainingRefundableMinor, summary.currency)}
            </p>
            <fieldset disabled={busy || !!operation}>
              <label htmlFor="refund-scope">Amount</label>
              <select
                id="refund-scope"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
              >
                <option value="full">Full remaining refund</option>
                <option value="partial">Partial refund</option>
              </select>
              {scope === "partial" && (
                <>
                  <label htmlFor="refund-amount">
                    Refund amount ({summary.currency})
                  </label>
                  <input
                    id="refund-amount"
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </>
              )}
              <label htmlFor="refund-destination">Destination</label>
              <select
                id="refund-destination"
                value={destination}
                onChange={(e) =>
                  setDestination(
                    e.target.value as CreateRefundInput["destination"],
                  )
                }
              >
                <option
                  value="store_credit"
                  disabled={!summary.storeCreditAllowed}
                >
                  Store Credit
                </option>
                <option
                  value="original_payment_manual"
                  disabled={
                    !summary.sourcePayments.some(
                      (p) => p.provider !== "wallet" && p.availableMinor > 0,
                    )
                  }
                >
                  Original payment method — manual
                </option>
              </select>
              {!summary.storeCreditAllowed && (
                <p>
                  Store Credit supports USD Orders with a customer wallet only.
                  No currency conversion is performed.
                </p>
              )}
              {destination === "original_payment_manual" && (
                <>
                  <p role="note">
                    You must complete this refund in the payment provider
                    dashboard first. This action only records the refund in
                    mehtaxD and does not send money.
                  </p>
                  <label htmlFor="refund-payment">Original payment</label>
                  <select
                    id="refund-payment"
                    value={paymentId}
                    onChange={(e) => setPaymentId(e.target.value)}
                    required
                  >
                    <option value="">Select payment</option>
                    {summary.sourcePayments
                      .filter(
                        (p) => p.provider !== "wallet" && p.availableMinor > 0,
                      )
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.provider} ·{" "}
                          {money(p.availableMinor, summary.currency)} remaining
                          · {p.id}
                        </option>
                      ))}
                  </select>
                  <label htmlFor="refund-reference">
                    External refund reference
                  </label>
                  <input
                    id="refund-reference"
                    value={reference}
                    maxLength={128}
                    onChange={(e) => setReference(e.target.value)}
                    required
                  />
                  <label className="adminRefundConfirm">
                    <input
                      id="refund-confirmed"
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                      required
                    />
                    I confirm the refund was already completed in the payment
                    provider dashboard.
                  </label>
                </>
              )}
              <label htmlFor="refund-reason">Internal reason</label>
              <textarea
                id="refund-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={1000}
                required
              />
              <small>Not shown to the buyer.</small>
            </fieldset>
            {error && <p role="alert">{error}</p>}
            {operation && (
              <div className="adminCustomerModalActions">
                <button
                  type="button"
                  className="adminButton"
                  disabled={busy}
                  onClick={checkStatus}
                >
                  Check refund status
                </button>
                {operation.key !== "invalid" && (
                  <button
                    type="button"
                    className="adminButton"
                    disabled={busy}
                    onClick={() => send(operation)}
                  >
                    Retry original request
                  </button>
                )}
              </div>
            )}
            <div className="adminCustomerModalActions">
              <button
                type="button"
                className="adminButton"
                disabled={busy || !!operation}
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="adminButton danger"
                disabled={busy || !!operation}
              >
                {busy
                  ? "Recording…"
                  : destination === "store_credit"
                    ? "Confirm Store Credit refund"
                    : "Record completed gateway refund"}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </section>
  );
}
