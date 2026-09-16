"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowIcon, Gamepad2, Headset, Package, Plus, ShoppingBag } from "@/components/icons";
import { nestjsApi } from "@/lib/nestjs-api";

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    revenue: 0,
    orders: 0,
    activeChats: 0,
    products: null as number | null,
  });
  const [loading, setLoading] = useState(true);
  const [statsError, setStatsError] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    setStatsError(false);
    try {
      const [productsRes] = await Promise.all([
        nestjsApi.products.list({ limit: 1 }),
      ]);
      setStats((prev) => ({
        ...prev,
        products: productsRes.length,
      }));
    } catch {
      setStats((current) => ({ ...current, products: null }));
      setStatsError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="adminPageHead">
        <div>
          <div className="adminEyebrow">Overview</div>
          <h1>Good morning.</h1>
          <p>Run the MehtaXD store from one place. No sellers, no marketplace complexity, no automatic fulfillment.</p>
        </div>
        <Link className="adminButton primary" href="/admin/games/new">
          <Plus size={16} /> Add game
        </Link>
      </div>

      {statsError ? (
        <div className="adminNotice adminInlineFeedback" role="alert">
          <span>Product totals couldn’t load. The catalog was not reported as zero.</span>
          <button type="button" className="adminButton" onClick={() => void loadStats()}>Try again</button>
        </div>
      ) : null}

      <div className="adminGrid">
        <div className="adminStat">
          <small>Revenue</small>
          <strong>{loading ? "—" : `$${stats.revenue.toLocaleString()}`}</strong>
          <span>Connect payments to populate</span>
        </div>
        <div className="adminStat">
          <small>Orders</small>
          <strong>{loading ? "—" : stats.orders}</strong>
          <span>Manual order flow</span>
        </div>
        <div className="adminStat">
          <small>Active chats</small>
          <strong>{loading ? "—" : stats.activeChats}</strong>
          <span>Customer conversations</span>
        </div>
        <div className="adminStat">
          <small>Products</small>
          <strong>{loading ? "—" : stats.products ?? "Unavailable"}</strong>
          <span>Current catalog from NestJS</span>
        </div>
      </div>

      <div className="adminTwo">
        <section className="adminPanel">
          <div className="adminPanelHead"><h2>Store workflow</h2><span className="adminBadge published">Single seller</span></div>
          <div style={{ padding: 18 }}>
            <div className="adminQuickGrid">
              <Link className="adminQuick" href="/admin/games"><Gamepad2 size={17} /> Manage games</Link>
              <Link className="adminQuick" href="/admin/categories"><Package size={17} /> Manage categories</Link>
              <Link className="adminQuick" href="/admin/products"><Package size={17} /> Manage products</Link>
              <Link className="adminQuick" href="/admin/orders"><ShoppingBag size={17} /> View orders</Link>
              <Link className="adminQuick" href="/admin/chats"><Headset size={17} /> Open chats</Link>
              <Link className="adminQuick" href="/admin/content"><ArrowIcon size={17} /> Edit content</Link>
              <Link className="adminQuick" href="/admin/seo"><ArrowIcon size={17} /> SEO controls</Link>
            </div>
          </div>
        </section>
        <section className="adminPanel">
          <div className="adminPanelHead"><h2>Backend status</h2></div>
          <div style={{ padding: 18, fontSize: 13, lineHeight: 1.8, color: "#777" }}>
            <strong style={{ color: "#222" }}>Connected to NestJS API</strong><br />
            Games, Categories, and Products are managed via the NestJS backend at <code style={{ background: "#f5f5f5", padding: "2px 6px", borderRadius: 4 }}>{process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}</code>.
          </div>
        </section>
      </div>
    </>
  );
}
