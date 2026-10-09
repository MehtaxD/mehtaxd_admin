"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus, Trash2, Loader2 } from "@/components/icons";
import { nestjsApi, Game, CreateGameDto, UpdateGameDto } from "@/lib/nestjs-api";
import { BlogEditor } from "@/components/blog/blog-editor";
import { GameMediaField } from "@/components/game-media-field";
import { finalizeSlug, normalizeSlugDraft } from "@/lib/slug-input";

type Faq = { question: string; answer: string };
type GameFormData = {
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  heroEyebrow: string;
  heroTitle: string;
  heroBody: string;
  mark: string;
  tone: string;
  guide: string;
  highlights: string;
  faqs: Faq[];
  metaTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  status: "draft" | "published" | "archived";
  iconUrl: string;
  bannerUrl: string;
  featured: boolean;
  seoKeywords: string;
  ogImageUrl: string;
};

const empty: GameFormData = {
  name: "",
  slug: "",
  shortDescription: "",
  description: "",
  heroEyebrow: "SHOP THE GAME",
  heroTitle: "",
  heroBody: "",
  mark: "GAME",
  tone: "neutral",
  guide: "",
  highlights: "",
  faqs: [{ question: "", answer: "" }],
  metaTitle: "",
  metaDescription: "",
  canonicalUrl: "",
  status: "draft",
  iconUrl: "",
  bannerUrl: "",
  featured: false,
  seoKeywords: "",
  ogImageUrl: "",
};

export default function GameEditorPage() {
  const params = useParams();
  const router = useRouter();
  const gameId = params.id as string;
  const isEditing = gameId !== "new";

  const [form, setForm] = useState<GameFormData>(empty);
  const [saving, setSaving] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(0);
  const [loading, setLoading] = useState(isEditing);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");

  useEffect(() => {
    if (isEditing) {
      loadGame();
    }
  }, [gameId]);

async function loadGame() {
    try {
      const game = await nestjsApi.games.get(gameId);
      setForm(() => ({
        name: game.name,
        slug: game.slug,
        shortDescription: game.shortDescription || "",
        description: game.description || "",
        heroEyebrow: game.heroEyebrow || "",
        heroTitle: game.heroTitle || "",
        heroBody: game.heroBody || "",
        mark: game.mark || "",
        tone: game.tone || "",
        guide: game.guide || "",
        highlights: (game.highlights || []).join(", "),
        iconUrl: game.iconUrl || "",
        bannerUrl: game.bannerUrl || "",
        featured: game.featured,
        seoKeywords: game.seoKeywords || "",
        ogImageUrl: game.ogImageUrl || "",
        metaTitle: game.seoTitle || "",
        metaDescription: game.seoDescription || "",
        canonicalUrl: game.canonicalUrl || "",
        status: game.status || "draft",
        faqs: game.faqs?.length ? game.faqs : [{ question: "", answer: "" }],
      }));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load game");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }

  function set<K extends keyof GameFormData>(key: K, value: GameFormData[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function addFaq() {
    set("faqs", [...form.faqs, { question: "", answer: "" }]);
  }

  function removeFaq(index: number) {
    set("faqs", form.faqs.filter((_, i) => i !== index));
  }

  function updateFaq(index: number, key: keyof Faq, value: string) {
    set("faqs", form.faqs.map((faq, i) => i === index ? { ...faq, [key]: value } : faq));
  }

function buildCreateGamePayload() {
    return {
      name: form.name,
      slug: finalizeSlug(form.slug || form.name),
      shortDescription: form.shortDescription,
      description: form.description,
      heroEyebrow: form.heroEyebrow,
      heroTitle: form.heroTitle,
      heroBody: form.heroBody,
      mark: form.mark,
      tone: form.tone,
      guide: form.guide,
      highlights: form.highlights.split(",").map((item) => item.trim()).filter(Boolean),
      faqs: form.faqs.filter((faq) => faq.question.trim() && faq.answer.trim()),
      iconUrl: form.iconUrl || undefined,
      bannerUrl: form.bannerUrl || undefined,
      featured: form.featured,
      seoTitle: form.metaTitle || undefined,
      seoDescription: form.metaDescription || undefined,
      seoKeywords: form.seoKeywords || undefined,
      ogImageUrl: form.ogImageUrl || undefined,
      canonicalUrl: form.canonicalUrl || undefined,
      status: form.status,
    };
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (uploadingMedia > 0) return;
    if (form.faqs.some((faq) => Boolean(faq.question.trim()) !== Boolean(faq.answer.trim()))) {
      setMessage("Complete both the question and answer for each FAQ, or remove the unfinished row.");
      setMessageType("error");
      return;
    }
    setSaving(true);
    setMessage("");

    try {
      let result: Game;

      if (isEditing) {
        // For editing, send only the fields that are in UpdateGameDto
        const payload = {
          name: form.name,
          slug: finalizeSlug(form.slug || form.name),
          shortDescription: form.shortDescription,
          description: form.description,
          heroEyebrow: form.heroEyebrow,
          heroTitle: form.heroTitle,
          heroBody: form.heroBody,
          mark: form.mark,
          tone: form.tone,
          guide: form.guide,
          highlights: form.highlights.split(",").map((item) => item.trim()).filter(Boolean),
          faqs: form.faqs.filter((faq) => faq.question.trim() && faq.answer.trim()),
          iconUrl: form.iconUrl || null,
          bannerUrl: form.bannerUrl || null,
          featured: form.featured,
          seoTitle: form.metaTitle || undefined,
          seoDescription: form.metaDescription || undefined,
          seoKeywords: form.seoKeywords || undefined,
          ogImageUrl: form.ogImageUrl || null,
          canonicalUrl: form.canonicalUrl || undefined,
          status: form.status,
        };
        result = await nestjsApi.games.update(gameId, payload as UpdateGameDto);
      } else {
        // For creating, use the clean CreateGameDto payload
        const payload = buildCreateGamePayload();
        result = await nestjsApi.games.create(payload);
      }

      setMessage(`Saved as ${result.status}. Game URL: /games/${result.slug}`);
      setMessageType("success");
      router.push("/admin/games");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save game");
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
          <div className="adminEyebrow">Catalog · Games</div>
          <h1>{isEditing ? "Edit game" : "Create new game"}</h1>
          <p>One form controls the game page, FAQs and SEO. Publish it once and the dynamic storefront can use the slug automatically.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="adminButton" href="/admin/games">Cancel</Link>
          <button className="adminButton primary" disabled={saving || uploadingMedia > 0} type="submit">
            {saving ? <Loader2 size={16} /> : uploadingMedia > 0 ? "Uploading image…" : "Save game"}
          </button>
        </div>
      </div>

      {message && <div className={messageType === "success" ? "adminSuccess" : "adminNotice"} role={messageType === "error" ? "alert" : "status"}>{message}</div>}

      <section className="adminSection">
        <h2>Game information</h2>
        <p>Keep this focused on what customers actually need to understand the game.</p>
        <div className="adminFormGrid">
          <div className="adminField">
            <label>Name</label>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="8 Ball Pool" required />
          </div>
          <div className="adminField">
            <label>Slug</label>
            <input value={form.slug} onChange={(e) => set("slug", normalizeSlugDraft(e.target.value))} onBlur={(e) => set("slug", finalizeSlug(e.currentTarget.value))} placeholder="8-ball-pool" />
            <span className="adminHint">Leave blank to generate automatically from the name.</span>
          </div>
          <div className="adminField full">
            <label>Short description</label>
            <input value={form.shortDescription} onChange={(e) => set("shortDescription", e.target.value)} placeholder="Coins, Cash and accounts for 8 Ball Pool players." required />
          </div>
          <div className="adminField full">
            <label>Description</label>
            <BlogEditor mode="game" value={form.description} onChange={(html) => set("description", html)} placeholder="Full game description" ariaLabel="Game description" />
          </div>
          <div className="adminField">
            <label>Game mark</label>
            <input value={form.mark} onChange={(e) => set("mark", e.target.value.toUpperCase())} placeholder="8BP" />
          </div>
          <div className="adminField">
            <label>Visual tone</label>
            <select value={form.tone} onChange={(e) => set("tone", e.target.value)}>
              <option value="neutral">Neutral</option>
              <option value="dark">Dark</option>
              <option value="cobalt">Cobalt</option>
              <option value="amber">Amber</option>
              <option value="rose">Rose</option>
            </select>
          </div>
          <div className="adminField">
            <label>Hero eyebrow</label>
            <input value={form.heroEyebrow} onChange={(e) => set("heroEyebrow", e.target.value)} />
          </div>
          <div className="adminField">
            <label>Hero title</label>
            <input value={form.heroTitle} onChange={(e) => set("heroTitle", e.target.value)} placeholder="More coins. Better cues. Less waiting." required />
          </div>
          <div className="adminField full">
            <label>Featured</label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={form.featured} onChange={(e) => set("featured", e.target.checked)} />
              <span>Show in featured games</span>
            </label>
          </div>
          <div className="adminField">
            <label>Status</label>
            <select value={form.status} onChange={(e) => set("status", e.target.value as "draft" | "published" | "archived")}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div className="adminField full">
            <label>Highlights</label>
            <input value={form.highlights} onChange={(e) => set("highlights", e.target.value)} placeholder="Coins & Cash, High-balance accounts, Fast order chat" />
          </div>
          <div className="adminField full">
            <label>Before-you-buy guide</label>
            <textarea value={form.guide} onChange={(e) => set("guide", e.target.value)} placeholder="Tell buyers what matters before ordering." />
          </div>
          <div className="adminField full">
            <label>Hero / intro content</label>
            <textarea value={form.heroBody} onChange={(e) => set("heroBody", e.target.value)} placeholder="Explain what buyers can find and what they should check before buying." required />
          </div>
        </div>
      </section>

      <section className="adminSection">
        <h2>Frequently asked questions</h2>
        <p>These are rendered dynamically on the public game page. Add real buyer questions, not keyword stuffing.</p>
        <div className="faqEditor">
          {form.faqs.map((faq, index) => (
            <div className="faqRow" key={index}>
              <div className="faqRowHead">
                <strong>FAQ {index + 1}</strong>
                <button type="button" className="adminIconButton" onClick={() => removeFaq(index)} aria-label="Remove FAQ">
                  <Trash2 size={15} />
                </button>
              </div>
              <div className="adminFormGrid">
                <div className="adminField full">
                  <label>Question</label>
                  <input value={faq.question} onChange={(e) => updateFaq(index, "question", e.target.value)} placeholder="What can I buy for this game?" />
                </div>
                <div className="adminField full">
                  <label>Answer</label>
                  <textarea value={faq.answer} onChange={(e) => updateFaq(index, "answer", e.target.value)} placeholder="Give a clear buyer-focused answer." />
                </div>
              </div>
            </div>
          ))}
        </div>
        <button type="button" className="adminButton" style={{ marginTop: 12 }} onClick={addFaq}>
          <Plus size={14} /> Add FAQ
        </button>
      </section>

      <section className="adminSection">
        <h2>SEO</h2>
        <p>These values control the metadata for the game page. Canonical paths are generated automatically when blank.</p>
        <div className="adminFormGrid">
          <div className="adminField full">
            <label>SEO title</label>
            <input value={form.metaTitle} onChange={(e) => set("metaTitle", e.target.value)} placeholder="8 Ball Pool Coins, Cash & Accounts | MehtaXD" />
          </div>
          <div className="adminField full">
            <label>Meta description</label>
            <textarea value={form.metaDescription} onChange={(e) => set("metaDescription", e.target.value)} placeholder="Buy 8 Ball Pool Coins, Cash and accounts from MehtaXD..." />
          </div>
          <div className="adminField full">
            <label>SEO keywords (comma-separated)</label>
            <input value={form.seoKeywords} onChange={(e) => set("seoKeywords", e.target.value)} placeholder="gaming, coins, accounts, boosting" />
          </div>
        </div>
        <details className="adminGameMediaUrl adminGameSeoAdvanced">
          <summary>Advanced SEO · Canonical URL</summary>
          <div className="adminField">
            <label htmlFor="game-canonical-url">Canonical URL override</label>
            <input id="game-canonical-url" value={form.canonicalUrl} onChange={(e) => set("canonicalUrl", e.target.value)} placeholder="Generated automatically from the Game slug" />
          </div>
        </details>
      </section>

      <section className="adminSection">
        <h2>Media</h2>
        <p>Upload PNG, JPEG or WebP, up to 5 MB. Inspect the crop here before saving or publishing.</p>
        <div className="adminGameMediaGrid">
          <GameMediaField kind="icon" label="Icon" value={form.iconUrl} bannerUrl={form.bannerUrl} gameName={form.name} gameMark={form.mark} onChange={(url) => set("iconUrl", url)} onUploadStateChange={(delta) => setUploadingMedia((count) => count + delta)} />
          <GameMediaField kind="banner" label="Banner" value={form.bannerUrl} onChange={(url) => set("bannerUrl", url)} onUploadStateChange={(delta) => setUploadingMedia((count) => count + delta)} />
          <GameMediaField kind="og" label="OG image" value={form.ogImageUrl} fallbackUrl={form.bannerUrl} onChange={(url) => set("ogImageUrl", url)} onUploadStateChange={(delta) => setUploadingMedia((count) => count + delta)} />
        </div>
      </section>
    </form>
  );
}
