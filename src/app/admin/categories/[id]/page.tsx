"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "@/components/icons";
import { nestjsApi, Category, Game, CreateCategoryForGameDto } from "@/lib/nestjs-api";

type CategoryFormData = {
  gameId: string;
  name: string;
  slug: string;
  description: string;
  status: "draft" | "published" | "archived";
  sortOrder: number;
};

const empty: CategoryFormData = {
  gameId: "",
  name: "",
  slug: "",
  description: "",
  status: "published",
  sortOrder: 0,
};

export default function CategoryEditorPage() {
  const params = useParams();
  const router = useRouter();
  const categoryId = params.id as string;
  const isEditing = categoryId !== "new";

  const [form, setForm] = useState<CategoryFormData>(empty);
  const [games, setGames] = useState<Game[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEditing);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");

  useEffect(() => {
    loadGames();
    if (isEditing) {
      loadCategory();
    }
  }, [categoryId]);

  async function loadGames() {
    try {
      const response = await nestjsApi.games.list({ limit: 100, status: "published" });
      setGames(response);
    } catch (err) {
      console.error("Failed to load games:", err);
    }
  }

  async function loadCategory() {
    try {
      const category = await nestjsApi.categories.get(categoryId);
      setForm({
        gameId: category.gameId,
        name: category.name,
        slug: category.slug,
        description: category.description,
        status: category.status,
        sortOrder: category.sortOrder,
      });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load category");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }

  function set<K extends keyof CategoryFormData>(key: K, value: CategoryFormData[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function slugify(value: string) {
    return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const payload: CreateCategoryForGameDto = {
        name: form.name,
        slug: form.slug || slugify(form.name),
        description: form.description,
        status: form.status,
        sortOrder: form.sortOrder,
      };

      let result: Category;
      if (isEditing) {
        result = await nestjsApi.categories.update(categoryId, payload);
      } else {
        result = await nestjsApi.categories.createForGame(form.gameId, payload);
      }

      setMessage(`Saved category "${result.name}"`);
      setMessageType("success");
      router.push("/admin/categories");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save category");
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="adminForm" style={{ minHeight: 300, display: "grid", placeItems: "center" }}>
        <Loader2 className="adminSpinner" size={32} />
      </div>
    );
  }

  return (
    <form className="adminForm" onSubmit={submit}>
      <div className="adminPageHead">
        <div>
          <div className="adminEyebrow">Catalog · Categories</div>
          <h1>{isEditing ? "Edit category" : "Create new category"}</h1>
          <p>Categories organize products within a game. Select the game first, then define the category details.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="adminButton" href="/admin/categories">Cancel</Link>
          <button className="adminButton primary" disabled={saving} type="submit">
            {saving ? <Loader2 size={16} /> : "Save category"}
          </button>
        </div>
      </div>

      {message && <div className={messageType === "success" ? "adminSuccess" : "adminNotice"}>{message}</div>}

      <section className="adminSection">
        <h2>Category details</h2>
        <div className="adminFormGrid">
          <div className="adminField">
            <label>Game <span style={{ color: "#e6002d" }}>*</span></label>
            <select
              value={form.gameId}
              onChange={(e) => set("gameId", e.target.value)}
              required
              disabled={isEditing}
            >
              <option value="">Select a game</option>
              {games.map((game) => (
                <option key={game.id} value={game.id}>{game.name}</option>
              ))}
            </select>
            {isEditing && <span className="adminHint">Game cannot be changed after creation.</span>}
          </div>

          <div className="adminField">
            <label>Name <span style={{ color: "#e6002d" }}>*</span></label>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Currency" required />
          </div>

          <div className="adminField">
            <label>Slug</label>
            <input value={form.slug} onChange={(e) => set("slug", slugify(e.target.value))} placeholder="currency" />
            <span className="adminHint">Leave blank to generate from name.</span>
          </div>

          <div className="adminField full">
            <label>Description</label>
            <textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Coins, cash and balance packages..." rows={3} />
          </div>

          <div className="adminField">
            <label>Status</label>
            <select value={form.status} onChange={(e) => set("status", e.target.value as CategoryFormData["status"])}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div className="adminField">
            <label>Sort order</label>
            <input type="number" value={form.sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value))} min="0" />
          </div>
        </div>
      </section>
    </form>
  );
}
