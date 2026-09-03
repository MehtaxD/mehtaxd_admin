"use client";

import type { Route } from "next";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Loader2, RotateCcw, Search } from "@/components/icons";
import {
  type AdminCustomerListItem,
  type CustomerAuthProvider,
  type CustomerStatus,
  nestjsApi,
} from "@/lib/nestjs-api";

const STATUSES: CustomerStatus[] = ["active", "suspended", "banned"];

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

function providerLabel(provider: CustomerAuthProvider) {
  return provider === "password" ? "Email" : label(provider);
}

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<AdminCustomerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CustomerStatus | "">("");

  const params = useMemo(
    () => ({
      page,
      limit: 20,
      search: search || undefined,
      status: status || undefined,
    }),
    [page, search, status],
  );

  useEffect(() => {
    void loadCustomers();
  }, [params]);

  async function loadCustomers() {
    setLoading(true);
    setError("");
    try {
      const response = await nestjsApi.customers.list(params);
      setCustomers(response.items);
      setTotal(response.total);
      setTotalPages(Math.max(response.totalPages, 1));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Failed to load customers.",
      );
    } finally {
      setLoading(false);
    }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(draftSearch.trim());
  }

  function updateStatus(value: string) {
    setPage(1);
    setStatus(value as CustomerStatus | "");
  }

  return (
    <>
      <div className="adminPageHead">
        <div>
          <div className="adminEyebrow">Customer directory</div>
          <h1>Customers</h1>
          <p>
            Review customer identity, authentication methods, sessions, and
            order history.
          </p>
        </div>
        <button
          className="adminButton"
          onClick={loadCustomers}
          disabled={loading}
        >
          {loading ? <Loader2 size={15} /> : <RotateCcw size={15} />} Refresh
        </button>
      </div>

      <div className="adminPanel adminCustomerFilters">
        <form onSubmit={submitSearch} role="search">
          <label htmlFor="customer-search">Search name or email</label>
          <div>
            <Search size={16} />
            <input
              id="customer-search"
              value={draftSearch}
              onChange={(event) => setDraftSearch(event.target.value)}
              placeholder="Search customers"
              maxLength={200}
            />
            <button className="adminButton" type="submit">
              Search
            </button>
          </div>
        </form>
        <label>
          <span>Status</span>
          <select
            className="adminSelect"
            value={status}
            onChange={(event) => updateStatus(event.target.value)}
          >
            <option value="">All statuses</option>
            {STATUSES.map((item) => (
              <option key={item} value={item}>
                {label(item)}
              </option>
            ))}
          </select>
        </label>
        <div className="adminCustomerTotal">
          <strong>{total}</strong>
          <span>customers</span>
        </div>
      </div>

      {error ? (
        <div className="adminNotice adminCustomerNotice">{error}</div>
      ) : null}

      {loading ? (
        <div className="adminOrderState">
          <Loader2 size={28} /> Loading customers...
        </div>
      ) : customers.length === 0 ? (
        <div className="adminPanel adminOrderState">
          No customers match these filters.
        </div>
      ) : (
        <div className="adminOrderTableShell">
          <table className="adminOrderTable adminCustomerTable">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Providers</th>
                <th>Status</th>
                <th>Verified</th>
                <th>Orders</th>
                <th>Last login</th>
                <th>Created</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <td data-label="Customer">
                    <strong>
                      {customer.displayName || "Unnamed customer"}
                    </strong>
                    <small>{customer.email || "No email"}</small>
                  </td>
                  <td data-label="Providers">
                    <div className="adminCustomerBadges">
                      {customer.providers.length ? (
                        customer.providers.map((provider) => (
                          <span
                            className="adminCustomerProvider"
                            key={provider}
                          >
                            {providerLabel(provider)}
                          </span>
                        ))
                      ) : (
                        <small>None linked</small>
                      )}
                    </div>
                  </td>
                  <td data-label="Status">
                    <span className={`adminCustomerStatus ${customer.status}`}>
                      {label(customer.status)}
                    </span>
                  </td>
                  <td data-label="Verified">
                    {customer.emailVerified ? "Verified" : "Not verified"}
                  </td>
                  <td data-label="Orders">
                    <strong>{customer.orderCount}</strong>
                  </td>
                  <td data-label="Last login">{date(customer.lastLoginAt)}</td>
                  <td data-label="Created">{date(customer.createdAt)}</td>
                  <td data-label="Actions">
                    <Link
                      className="adminIconButton"
                      href={`/admin/customers/${customer.id}` as Route}
                      aria-label={`Open customer ${customer.displayName || customer.email || customer.id}`}
                    >
                      <ArrowUpRight size={16} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="adminOrderPager" aria-label="Customer pagination">
        <button
          className="adminButton"
          onClick={() => setPage((value) => Math.max(1, value - 1))}
          disabled={page <= 1 || loading}
        >
          Previous
        </button>
        <span>
          Page {page} of {totalPages}
        </span>
        <button
          className="adminButton"
          onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
          disabled={page >= totalPages || loading}
        >
          Next
        </button>
      </div>
    </>
  );
}
