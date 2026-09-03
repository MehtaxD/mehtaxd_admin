"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "@/components/icons";
import { nestjsApi, Product, Game, Category, CreateProductDto, UpdateProductDto, CreateProductForGameDto } from "@/lib/nestjs-api";

type ProductFormData = {
  gameId: string;
  categoryId: string;
  name: string;
  slug: string;
  productType: "currency" | "account" | "item" | "boosting" | "service" | "subscription" | "other";
  price: number;
  compareAtPrice: number;
  currency: string;
  status: "draft" | "published" | "archived";
  isActive: boolean;
  featured: boolean;
  sortOrder: number;
  shortDescription: string;
  description: string;
  requirements: string;
  deliveryInformation: string;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
  ogImageUrl: string;
  canonicalUrl: string;
};

const empty: ProductFormData = {
  gameId: "",
  categoryId: "",
  name: "",
  slug: "",
  productType: "currency",
  price: 0,
  compareAtPrice: 0,
  currency: "USD",
  status: "draft",
  isActive: false,
  featured: false,
  sortOrder: 0,
  shortDescription: "",
  description: "",
  requirements: "",
  deliveryInformation: "",
  seoTitle: "",
  seoDescription: "",
  seoKeywords: "",
  ogImageUrl: "",
  canonicalUrl: "",
};

const PRODUCT_TYPES = [
  { value: "currency", label: "Currency" },
  { value: "account", label: "Account" },
  { value: "item", label: "Item" },
  { value: "boosting", label: "Boosting" },
  { value: "service", label: "Service" },
  { value: "subscription", label: "Subscription" },
  { value: "other", label: "Other" },
] as const;

export default function ProductEditorPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params.id as string;
  const isEditing = productId !== "new";

  const [form, setForm] = useState<ProductFormData>(empty);
  const [games, setGames] = useState<Game[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEditing);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");

  useEffect(() => {
    loadGames();
    if (isEditing) {
      loadProduct();
    }
  }, [productId]);

  useEffect(() => {
    if (form.gameId) {
      loadCategories();
    } else {
      setCategories([]);
      setForm((prev) => ({ ...prev, categoryId: "" }));
    }
  }, [form.gameId]);

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
      const response = await nestjsApi.categories.list({ limit: 100, gameId: form.gameId });
      setCategories(response);
    } catch (err) {
      console.error("Failed to load categories:", err);
    }
  }

  async function loadProduct() {
    try {
      const product: Product = await nestjsApi.products.get(productId);
      const productData: ProductFormData = {
        gameId: product.gameId,
        categoryId: product.categoryId,
        name: product.name,
        slug: product.slug,
        productType: product.productType,
        price: Number(product.price),
        compareAtPrice: product.compareAtPrice ? Number(product.compareAtPrice) : 0,
        currency: product.currency,
        status: product.status as ProductFormData["status"],
        isActive: product.isActive,
        featured: product.featured,
        sortOrder: product.sortOrder,
        shortDescription: product.shortDescription ?? "",
        description: product.description ?? "",
        requirements: product.requirements ?? "",
        deliveryInformation: product.deliveryInformation ?? "",
        seoTitle: product.seoTitle ?? "",
        seoDescription: product.seoDescription ?? "",
        seoKeywords: product.seoKeywords ?? "",
        ogImageUrl: product.ogImageUrl ?? "",
        canonicalUrl: product.canonicalUrl ?? "",
      };
      setForm(productData);
      await loadCategories();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load product");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }

  function set<K extends keyof ProductFormData>(key: K, value: ProductFormData[K]) {
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
      const { gameId, ...formFields } = form;
      const payload = {
        ...formFields,
        slug: form.slug || slugify(form.name),
        compareAtPrice: form.compareAtPrice || undefined,
        currency: "USD",
      };

      let result: Product;
      if (isEditing) {
        result = await nestjsApi.products.update(productId, payload as UpdateProductDto);
      } else {
        result = await nestjsApi.products.createForGame(form.gameId, payload as CreateProductForGameDto);
      }

      setMessage(`Saved product "${result.name}"`);
      setMessageType("success");
      router.push("/admin/products");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save product");
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
          <div className="adminEyebrow">Catalog · Products</div>
          <h1>{isEditing ? "Edit product" : "Create new product"}</h1>
          <p>Select a game first, then its category. Fill in all product details including pricing, SEO, and delivery information.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="adminButton" href="/admin/products">Cancel</Link>
          <button className="adminButton primary" disabled={saving} type="submit">
            {saving ? <Loader2 size={16} /> : "Save product"}
          </button>
        </div>
      </div>

      {message && <div className={messageType === "success" ? "adminSuccess" : "adminNotice"}>{message}</div>}

      <section className="adminSection">
        <h2>Basic information</h2>
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
            <label>Category <span style={{ color: "#e6002d" }}>*</span></label>
            <select
              value={form.categoryId}
              onChange={(e) => set("categoryId", e.target.value)}
              required
              disabled={!form.gameId}
            >
              <option value="">Select a category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
            {!form.gameId && <span className="adminHint">Select a game first.</span>}
          </div>

          <div className="adminField">
            <label>Product type <span style={{ color: "#e6002d" }}>*</span></label>
            <select value={form.productType} onChange={(e) => set("productType", e.target.value as ProductFormData["productType"])} required>
              {PRODUCT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="adminField">
            <label>Name <span style={{ color: "#e6002d" }}>*</span></label>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="100M FC 25 Coins" required />
          </div>

          <div className="adminField">
            <label>Slug</label>
            <input value={form.slug} onChange={(e) => set("slug", slugify(e.target.value))} placeholder="fc-25-coins-100m" />
            <span className="adminHint">Leave blank to generate from name.</span>
          </div>

          <div className="adminField full">
            <label>Short description</label>
            <textarea value={form.shortDescription} onChange={(e) => set("shortDescription", e.target.value)} placeholder="Quick summary for listings" rows={2} />
          </div>
        </div>
      </section>

      <section className="adminSection">
        <h2>Pricing & Availability</h2>
        <div className="adminFormGrid">
          <div className="adminField">
            <label>Price <span style={{ color: "#e6002d" }}>*</span></label>
            <input type="number" step="0.01" min="0" value={form.price} onChange={(e) => set("price", Number(e.target.value))} required />
          </div>

          <div className="adminField">
            <label>Compare-at price</label>
            <input type="number" step="0.01" min="0" value={form.compareAtPrice} onChange={(e) => set("compareAtPrice", Number(e.target.value))} />
          </div>

          <div className="adminField">
            <label>Currency</label>
            <input value="USD" readOnly aria-readonly="true" />
            <span className="adminHint">The storefront currently supports USD only.</span>
          </div>

          <div className="adminField">
            <label>Status</label>
            <select value={form.status} onChange={(e) => set("status", e.target.value as ProductFormData["status"])}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div className="adminField">
            <label>
              <input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} /> Active
            </label>
          </div>

          <div className="adminField">
            <label>
              <input type="checkbox" checked={form.featured} onChange={(e) => set("featured", e.target.checked)} /> Featured
            </label>
          </div>

          <div className="adminField">
            <label>Sort order</label>
            <input type="number" min="0" value={form.sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value))} />
          </div>
        </div>
      </section>

      <section className="adminSection">
        <h2>Description & Delivery</h2>
        <div className="adminFormGrid">
          <div className="adminField full">
            <label>Full description</label>
            <textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Detailed product description" rows={6} />
          </div>

          <div className="adminField full">
            <label>Requirements</label>
            <textarea value={form.requirements} onChange={(e) => set("requirements", e.target.value)} placeholder="Describe what the customer needs before delivery." rows={4} />
          </div>

          <div className="adminField full">
            <label>Delivery information</label>
            <textarea value={form.deliveryInformation} onChange={(e) => set("deliveryInformation", e.target.value)} placeholder="Describe the actual delivery process and timing." rows={3} />
          </div>
        </div>
      </section>

      <section className="adminSection">
        <h2>SEO</h2>
        <div className="adminFormGrid">
          <div className="adminField full">
            <label>SEO title</label>
            <input value={form.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} placeholder="Optional search title" />
          </div>

          <div className="adminField full">
            <label>Meta description</label>
            <textarea value={form.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} placeholder="Optional search description" rows={3} />
          </div>

          <div className="adminField full">
            <label>Meta keywords (comma-separated)</label>
            <input value={form.seoKeywords} onChange={(e) => set("seoKeywords", e.target.value)} placeholder="Optional keywords" />
          </div>

          <div className="adminField">
            <label>OG Image URL</label>
            <input value={form.ogImageUrl} onChange={(e) => set("ogImageUrl", e.target.value)} placeholder="https://mehtaxd.com/images/product-og.jpg" />
          </div>

          <div className="adminField">
            <label>Canonical URL</label>
            <input value={form.canonicalUrl} onChange={(e) => set("canonicalUrl", e.target.value)} placeholder="/products/fc-25-coins-100m" />
          </div>
        </div>
      </section>
    </form>
  );
}
