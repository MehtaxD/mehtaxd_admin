"use client";

import { useEffect, useState } from "react";
import { redirect, usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  FileText,
  Gamepad2,
  Headset,
  LayoutDashboard,
  Package,
  Search,
  Settings,
  ShoppingBag,
  Tags,
  Users,
  LogOut,
} from "@/components/icons";
import { isAdminRequestAuthorized, logoutAdmin } from "@/lib/admin-auth";
import "./globals.css";

const nav = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/games", label: "Games", icon: Gamepad2 },
  { href: "/admin/categories", label: "Categories", icon: Tags },
  { href: "/admin/products", label: "Products", icon: Package },
  { href: "/admin/blogs", label: "Blog", icon: BookOpen },
  { href: "/admin/legal-pages", label: "Legal Pages", icon: FileText },
  { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { href: "/admin/chats", label: "Chats", icon: Headset },
  { href: "/admin/content", label: "Content", icon: FileText },
  { href: "/admin/seo", label: "SEO", icon: Search },
  { href: "/admin/customers", label: "Customers", icon: Users },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/settings", label: "Settings", icon: Settings },
] as const;

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/admin/login";

  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    localStorage.removeItem("mehtaxd_admin_tokens");
    sessionStorage.removeItem("mehtaxd_admin_tokens");
    if (isLoginPage) {
      setChecking(false);
      return;
    }
    const checkAuth = async () => {
      const authenticated = await isAdminRequestAuthorized();
      setAuthed(authenticated);
      setChecking(false);
      if (!authenticated) {
        redirect("/admin/login");
      }
    };
    checkAuth();
  }, [isLoginPage]);

  const handleLogout = async () => {
    await logoutAdmin();
    redirect("/admin/login");
  };

  if (checking) {
    return (
      <html lang="en" suppressHydrationWarning>
        <head />
        <body>
          <div className="adminApp">
            <div className="adminMain">
              <main
                className="adminContent"
                style={{
                  display: "grid",
                  placeItems: "center",
                  minHeight: "60vh",
                }}
              >
                <div style={{ textAlign: "center" }}>
                  <div
                    className="adminSpinner"
                    style={{
                      width: 32,
                      height: 32,
                      border: "3px solid #e8e8e8",
                      borderTopColor: "#e6002d",
                      borderRadius: "50%",
                      animation: "spin 1s linear infinite",
                      margin: "0 auto 16px",
                    }}
                  />
                  <p style={{ color: "#777" }}>Verifying session…</p>
                </div>
              </main>
            </div>
          </div>
        </body>
      </html>
    );
  }

  if (!authed && !isLoginPage) return null;

  if (isLoginPage) {
    return (
      <html lang="en" suppressHydrationWarning>
        <head />
        <body>{children}</body>
      </html>
    );
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body>
        <div className="adminApp">
          <aside className="adminSidebar">
            <a href="/admin" className="adminBrand">
              <img src="/mehtaxd-ninja.jpg" alt="" />
              <span>
                Mehta<span>XD</span>
              </span>
            </a>
            <div className="adminStoreLabel">
              <span className="adminDot" /> Single-store admin
            </div>
            <nav className="adminNav" aria-label="Admin navigation">
              {nav.map(({ href, label, icon: Icon }) => (
                <a href={href} key={href} className="adminNavLink">
                  <Icon size={17} />
                  {label}
                </a>
              ))}
            </nav>
            <div className="adminSidebarBottom">
              <a
                href="http://localhost:3000"
                target="_blank"
                rel="noopener noreferrer"
              >
                <BookOpen size={16} /> View storefront
              </a>
              <button
                onClick={handleLogout}
                className="adminButton"
                style={{
                  width: "100%",
                  justifyContent: "center",
                  background: "transparent",
                  border: "none",
                  color: "#e6002d",
                  cursor: "pointer",
                }}
              >
                <LogOut size={16} /> Sign out
              </button>
              <span>MehtaXD Admin · 2026</span>
            </div>
          </aside>
          <div className="adminMain">
            <header className="adminTopbar">
              <div>
                <span className="adminTopEyebrow">CONTROL CENTER</span>
                <strong>MehtaXD</strong>
              </div>
              <div className="adminTopActions">
                <span className="adminStatus">
                  <span className="adminDot" /> Store online
                </span>
                <a
                  href="http://localhost:3000"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open store ↗
                </a>
              </div>
            </header>
            <main className="adminContent">{children}</main>
          </div>
          <style jsx>{`
            @keyframes spin {
              to {
                transform: rotate(360deg);
              }
            }
            .adminNavLink {
              text-decoration: none;
            }
          `}</style>
        </div>
      </body>
    </html>
  );
}
