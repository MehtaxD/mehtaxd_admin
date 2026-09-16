"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, Edit3, Trash2, Filter, Search } from "@/components/icons";
import { nestjsApi, Product, Game, Category } from "@/lib/nestjs-api";

const PRODUCT_TYPES = [
  "currency", "account", "item", "boosting", "unlock", "bundle", "gift_card", "subscription"
] as const;

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [gamesError, setGamesError] = useState(false);
  const [categoriesError, setCategoriesError] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [filters, setFilters] = useState({
    gameId: "",
    categoryId: "",
    status: "",
    search: "",
  });

  useEffect(() => {
    loadGames();
    loadProducts();
  }, [filters.gameId, filters.categoryId, filters.status, filters.search]);

  useEffect(() => {
    if (filters.gameId) {
      loadCategories();
    } else {
      setCategories([]);
    }
  }, [filters.gameId]);

  async function loadGames() {
    setGamesError(false);
    try {
      const response = await nestjsApi.games.list({ limit: 100, status: "published" });
      setGames(response);
    } catch {
      setGames([]);
      setGamesError(true);
    }
  }

  async function loadCategories() {
    setCategoriesError(false);
    try {
      const response = await nestjsApi.categories.list({ limit: 100, gameId: filters.gameId });
      setCategories(response);
    } catch {
      setCategories([]);
      setCategoriesError(true);
    }
  }

  async function loadProducts() {
    try {
      setLoading(true);
      setError("");
      const response = await nestjsApi.products.list({
        limit: 50,
        gameId: filters.gameId || undefined,
        categoryId: filters.categoryId || undefined,
        status: filters.status || undefined,
        search: filters.search || undefined,
      });
      setProducts(response);
      setLoadFailed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Products couldn’t load. Check the connection and try again.");
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this product? This cannot be undone.")) return;
    setDeletingId(id);
    setError("");
    try {
      await nestjsApi.products.delete(id);
      setProducts(products.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The product couldn’t be deleted. Refresh and try again.");
    } finally {
      setDeletingId(null);
    }
  }

  const statusBadge = (status: string) => (
    <span className={`adminBadge ${status}`}>{status}</span>
  );

  const gameName = (gameId: string) => games.find((g) => g.id === gameId)?.name || "Unknown";
  const categoryName = (categoryId: string) => categories.find((c) => c.id === categoryId)?.name || "Unknown";

  return (
    <>
      <div className="adminPageHead">
        <div>
          <div className="adminEyebrow">Catalog</div>
          <h1>Products</h1>
          <p>Manage products across games and categories. Use filters to find specific products.</p>
        </div>
        <Link className="adminButton primary" href="/admin/products/new">
          <Plus size={16} /> Add product
        </Link>
      </div>

      <div className="adminPanel" style={{ marginBottom: 18, padding: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Search size={15} style={{ color: "#777" }} />
            <input
              type="text"
              placeholder="Search products…"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              style={{ padding: "8px 12px", border: "1px solid #ddd", borderRadius: 8, minWidth: 250 }}
            />
          </div>

          <select
            value={filters.gameId}
            onChange={(e) => setFilters({ ...filters, gameId: e.target.value, categoryId: "" })}
            className="adminSelect"
            style={{ minWidth: 180, padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}
          >
            <option value="">All games</option>
            {games.map((game) => (
              <option key={game.id} value={game.id}>{game.name}</option>
            ))}
          </select>

          <select
            value={filters.categoryId}
            onChange={(e) => setFilters({ ...filters, categoryId: e.target.value })}
            className="adminSelect"
            style={{ minWidth: 180, padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}
            disabled={!filters.gameId}
          >
            <option value="">All categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>

          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="adminSelect"
            style={{ minWidth: 140, padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      {gamesError ? <div className="adminNotice adminInlineFeedback" role="alert"><span>Game filters couldn’t load. Products are still shown without that filter.</span><button type="button" className="adminButton" onClick={() => void loadGames()}>Try again</button></div> : null}
      {categoriesError ? <div className="adminNotice adminInlineFeedback" role="alert"><span>Category filters couldn’t load for this game.</span><button type="button" className="adminButton" onClick={() => void loadCategories()}>Try again</button></div> : null}

      {error && <div className="adminNotice adminInlineFeedback" role="alert"><span>{error}</span>{loadFailed ? <button type="button" className="adminButton" onClick={() => void loadProducts()}>Try again</button> : null}</div>}

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#777" }}>Loading products…</div>
      ) : loadFailed ? null : products.length === 0 ? (
        <div className="adminPanel" style={{ textAlign: "center", padding: 60 }}>
          <p style={{ color: "#777", marginBottom: 16 }}>No products found.</p>
          <Link className="adminButton primary" href="/admin/products/new">
            <Plus size={16} /> Create your first product
          </Link>
        </div>
      ) : (
        <div className="adminCardGrid">
          {products.map((product) => (
            <article className="adminGameCard" key={product.id}>
              <div className="adminEyebrow">{gameName(product.gameId)} · {categoryName(product.categoryId)} · {statusBadge(product.status)}</div>
              <h3>{product.name}</h3>
              <p>{product.shortDescription || "No description"}</p>
              <p style={{ fontSize: 12, color: "#777", marginTop: 8 }}>
                {product.price} {product.currency} · Type: {product.productType} · Sort: {product.sortOrder}
              </p>
              <div className="actions">
                <a className="adminButton" href={`/admin/products/${product.id}/edit`}><Edit3 size={14} /> Edit</a>
                <button className="adminButton" style={{ color: "#e6002d", borderColor: "#e6002d" }} onClick={() => handleDelete(product.id)} disabled={deletingId === product.id}>
                  {deletingId === product.id ? "Deleting…" : <Trash2 size={14} />}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
