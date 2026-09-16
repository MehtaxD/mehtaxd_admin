"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
  Menu,
  X,
} from "@/components/icons";
import { isAdminRequestAuthorized, logoutAdmin } from "@/lib/admin-auth";
import { isAdminRouteActive } from "@/lib/admin-navigation";
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
  const activeSection = nav.find(({ href }) =>
    isAdminRouteActive(pathname, href),
  );

  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const drawerRef = useRef<HTMLDialogElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 901px)");
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (!event.matches || !drawerRef.current?.open) return;
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      drawerRef.current.close();
      setDrawerOpen(false);
      setDrawerClosing(false);
      document.documentElement.classList.remove("adminNavOpen");
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => {
      desktop.removeEventListener("change", closeOnDesktop);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      document.documentElement.classList.remove("adminNavOpen");
    };
  }, []);

  const handleLogout = async () => {
    await logoutAdmin();
    redirect("/admin/login");
  };

  const openDrawer = () => {
    const drawer = drawerRef.current;
    if (!drawer || drawer.open) return;
    setDrawerClosing(false);
    setDrawerOpen(true);
    document.documentElement.classList.add("adminNavOpen");
    drawer.showModal();
  };

  const closeDrawer = (restoreFocus = true) => {
    const drawer = drawerRef.current;
    if (!drawer?.open || drawerClosing) return;
    setDrawerClosing(true);
    closeTimerRef.current = setTimeout(() => {
      drawer.close();
      setDrawerOpen(false);
      setDrawerClosing(false);
      document.documentElement.classList.remove("adminNavOpen");
      if (restoreFocus) menuButtonRef.current?.focus();
    }, 160);
  };

  const renderNavigation = (mobile = false) => (
    <>
      <Link
        href="/admin"
        className="adminBrand"
        onClick={mobile ? () => closeDrawer(false) : undefined}
      >
        <img src="/mehtaxd-ninja.jpg" alt="" />
        <span>
          Mehta<span>XD</span>
        </span>
      </Link>
      <div className="adminStoreLabel">
        <span className="adminDot" /> Single-store admin
      </div>
      <nav className="adminNav" aria-label="Admin navigation">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = isAdminRouteActive(pathname, href);
          return (
            <Link
              href={href}
              key={href}
              className="adminNavLink"
              aria-current={active ? "page" : undefined}
              onClick={mobile ? () => closeDrawer(false) : undefined}
            >
              <Icon size={17} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="adminSidebarBottom">
        <a
          href="http://localhost:3000"
          target="_blank"
          rel="noopener noreferrer"
        >
          <BookOpen size={16} /> View storefront
        </a>
        <button onClick={handleLogout} className="adminSignOut">
          <LogOut size={16} /> Sign out
        </button>
        <span>MehtaXD Admin · 2026</span>
      </div>
    </>
  );

  if (checking) {
    return (
      <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
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
      <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
        <head />
        <body>{children}</body>
      </html>
    );
  }

  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <head />
      <body>
        <div className="adminApp">
          <aside className="adminSidebar">
            {renderNavigation()}
          </aside>
          <div className="adminMain">
            <header className="adminTopbar">
              <button
                ref={menuButtonRef}
                type="button"
                className="adminMenuButton"
                aria-label="Open admin navigation"
                aria-haspopup="dialog"
                aria-expanded={drawerOpen}
                aria-controls="admin-mobile-navigation"
                onClick={openDrawer}
              >
                <Menu size={21} />
              </button>
              <div className="adminTopIdentity">
                <span className="adminTopEyebrow">CONTROL CENTER</span>
                <strong>{activeSection?.label ?? "MehtaXD"}</strong>
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
          <dialog
            ref={drawerRef}
            id="admin-mobile-navigation"
            className="adminMobileNav"
            data-closing={drawerClosing ? "true" : "false"}
            aria-label="Admin navigation"
            onCancel={(event) => {
              event.preventDefault();
              closeDrawer();
            }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeDrawer();
            }}
            onClose={() => {
              setDrawerOpen(false);
              setDrawerClosing(false);
              document.documentElement.classList.remove("adminNavOpen");
            }}
          >
            <aside className="adminMobileDrawer">
              <button
                type="button"
                className="adminDrawerClose"
                aria-label="Close admin navigation"
                onClick={() => closeDrawer()}
              >
                <X size={21} />
              </button>
              {renderNavigation(true)}
            </aside>
          </dialog>
          <style jsx>{`
            @keyframes spin {
              to {
                transform: rotate(360deg);
              }
            }
            .adminNavLink { text-decoration: none; }
          `}</style>
        </div>
      </body>
    </html>
  );
}
