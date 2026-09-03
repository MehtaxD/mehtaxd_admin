"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, Edit3, Trash2, Filter } from "@/components/icons";
import { nestjsApi, Category, Game } from "@/lib/nestjs-api";

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedGameId, setSelectedGameId] = useState<string>("");

  useEffect(() => {
    loadGames();
    loadCategories();
  }, [selectedGameId]);

  async function loadGames() {
    try {
      const response = await nestjsApi.games.list({ limit: 100, status: "published" });
      setGames(response);
    } catch (err) {
      console.error("Failed to load games:", err);
    }
  }

  async function loadCategories() {
    try {
      setLoading(true);
      const response = await nestjsApi.categories.list({
        limit: 100,
        gameId: selectedGameId || undefined,
      });
      setCategories(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load categories");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this category? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      await nestjsApi.categories.delete(id);
      setCategories(categories.filter((c) => c.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete category");
    } finally {
      setDeletingId(null);
    }
  }

  const statusBadge = (status: string) => (
    <span className={`adminBadge ${status}`}>{status}</span>
  );

  const gameName = (gameId: string) => {
    const game = games.find((g) => g.id === gameId);
    return game?.name || "Unknown game";
  };

  return (
    <>
      <div className="adminPageHead">
        <div>
          <div className="adminEyebrow">Catalog</div>
          <h1>Categories</h1>
          <p>Manage product categories per game. Categories organize products and appear in game navigation.</p>
        </div>
        <Link className="adminButton primary" href="/admin/categories/new">
          <Plus size={16} /> Add category
        </Link>
      </div>

      <div className="adminPanel" style={{ marginBottom: 18, padding: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: "#333" }}>
            <Filter size={15} /> Filter by game:
            <select
              value={selectedGameId}
              onChange={(e) => setSelectedGameId(e.target.value)}
              className="adminSelect"
              style={{ minWidth: 200, padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}
            >
              <option value="">All games</option>
              {games.map((game) => (
                <option key={game.id} value={game.id}>{game.name}</option>
              ))}
            </select>
          </label>
          {selectedGameId && (
            <Link className="adminButton" href="/admin/categories/new" style={{ marginLeft: "auto" }}>
              <Plus size={14} /> Add category to this game
            </Link>
          )}
        </div>
      </div>

      {error && <div className="adminNotice" style={{ marginBottom: 18 }}>{error}</div>}

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#777" }}>Loading categories…</div>
      ) : categories.length === 0 ? (
        <div className="adminPanel" style={{ textAlign: "center", padding: 60 }}>
          <p style={{ color: "#777", marginBottom: 16 }}>
            {selectedGameId ? "No categories for this game yet." : "No categories yet."}
          </p>
          <Link className="adminButton primary" href="/admin/categories/new">
            <Plus size={16} /> Create your first category
          </Link>
        </div>
      ) : (
        <div className="adminCardGrid">
          {categories.map((category) => (
            <article className="adminGameCard" key={category.id}>
              <div className="adminEyebrow">{gameName(category.gameId)} · {statusBadge(category.status)}</div>
              <h3>{category.name}</h3>
              <p>{category.description || "No description"}</p>
              <p style={{ fontSize: 12, color: "#777", marginTop: 8 }}>Sort order: {category.sortOrder}</p>
              <div className="actions">
                <a className="adminButton" href={`/admin/categories/${category.id}`}><Edit3 size={14} /> Edit</a>
                <button className="adminButton" style={{ color: "#e6002d", borderColor: "#e6002d" }} onClick={() => handleDelete(category.id)} disabled={deletingId === category.id}>
                  {deletingId === category.id ? "Deleting…" : <Trash2 size={14} />}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
