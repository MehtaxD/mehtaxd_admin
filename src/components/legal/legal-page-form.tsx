"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "@/components/icons";
import { BlogEditor } from "@/components/blog/blog-editor";
import {
  nestjsApi,
  type LegalPage,
  type LegalPageKey,
  type LegalPageStatus,
  type UpdateLegalPageDto,
} from "@/lib/nestjs-api";

interface LegalFormState {
  title: string;
  content: string;
  status: LegalPageStatus;
  publishedAt: string;
  seoTitle: string;
  seoDescription: string;
}

function toDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function fromPage(page: LegalPage): LegalFormState {
  return {
    title: page.title,
    content: page.content,
    status: page.status,
    publishedAt: toDateTimeLocal(page.publishedAt),
    seoTitle: page.seoTitle ?? "",
    seoDescription: page.seoDescription ?? "",
  };
}

export function LegalPageForm({ pageKey }: { pageKey: LegalPageKey }) {
  const router = useRouter();
  const [form, setForm] = useState<LegalFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    nestjsApi.legalPages
      .get(pageKey)
      .then((page) => setForm(fromPage(page)))
      .catch((error: unknown) =>
        setMessage(
          error instanceof Error
            ? error.message
            : "Could not load the legal page",
        ),
      );
  }, [pageKey]);

  function set<K extends keyof LegalFormState>(
    key: K,
    value: LegalFormState[K],
  ) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function payload(statusOverride?: LegalPageStatus): UpdateLegalPageDto {
    if (!form) return {};
    const status = statusOverride ?? form.status;
    return {
      title: form.title.trim(),
      content: form.content,
      status,
      publishedAt:
        status === "draft" && !form.publishedAt
          ? null
          : form.publishedAt
            ? new Date(form.publishedAt).toISOString()
            : undefined,
      seoTitle: form.seoTitle.trim(),
      seoDescription: form.seoDescription.trim(),
    };
  }

  async function save(statusOverride?: LegalPageStatus) {
    if (!form?.title.trim()) {
      setMessage("Page title is required.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const page = await nestjsApi.legalPages.update(
        pageKey,
        payload(statusOverride),
      );
      setForm(fromPage(page));
      setMessage(
        page.status === "published"
          ? "Published changes saved."
          : "Draft saved.",
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not save the legal page",
      );
    } finally {
      setSaving(false);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    void save();
  }

  if (!form) {
    return (
      <div className="blogEditorLoadingPage">
        {message ? (
          <span>{message}</span>
        ) : (
          <>
            <Loader2 className="adminSpinner" size={30} />
            <span>Loading legal page…</span>
          </>
        )}
      </div>
    );
  }

  const previewHref = `/admin/legal-pages/${pageKey}/preview` as Route;
  const scheduled =
    form.status === "published" &&
    Boolean(form.publishedAt) &&
    new Date(form.publishedAt).getTime() > Date.now();
  const displayStatus = scheduled
    ? "Scheduled"
    : form.status.charAt(0).toUpperCase() + form.status.slice(1);

  return (
    <form className="blogCmsForm legalCmsForm" onSubmit={submit}>
      <header className="blogCmsHeader">
        <div>
          <p className="adminEyebrow">Content · Legal</p>
          <h1>Edit {form.title}</h1>
          <span>
            Manage the public legal page without changing its fixed route.
          </span>
        </div>
        <div className="blogCmsActions">
          <Link className="adminButton" href={"/admin/legal-pages" as Route}>
            Cancel
          </Link>
          <Link className="adminButton" href={previewHref} target="_blank" rel="noopener noreferrer">
            Preview Saved
          </Link>
          {form.status !== "draft" && (
            <button
              className="adminButton"
              type="button"
              disabled={saving}
              onClick={() => void save("draft")}
            >
              Save as Draft
            </button>
          )}
          <button
            className="adminButton primary"
            type="submit"
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2 className="adminSpinner" size={15} /> Saving…
              </>
            ) : form.status === "draft" ? (
              "Save Draft"
            ) : (
              "Save Changes"
            )}
          </button>
          {form.status === "draft" && (
            <button
              className="adminButton primary"
              type="button"
              disabled={saving}
              onClick={() => void save("published")}
            >
              Publish
            </button>
          )}
        </div>
      </header>

      {message && <div className="adminNotice blogCmsNotice">{message}</div>}

      <div className="blogCmsGrid">
        <main className="blogCmsMain">
          <label className="blogTitleField">
            <span className="srOnly">Page title</span>
            <input
              value={form.title}
              onChange={(event) => set("title", event.target.value)}
              placeholder="Page Title"
              required
              maxLength={220}
            />
          </label>
          <div className="adminField blogContentField">
            <span>Page Content</span>
            <BlogEditor
              value={form.content}
              onChange={(html) => set("content", html)}
              placeholder="Start writing the legal page…"
              ariaLabel="Legal page content"
            />
          </div>
        </main>

        <aside className="blogCmsSidebar">
          <section className="blogSidePanel blogPublishPanel">
            <div className="blogPanelTitle">
              <div>
                <span>01</span>
                <h2>Publishing</h2>
              </div>
              <span
                className={`adminBadge ${scheduled ? "scheduled" : form.status}`}
              >
                {displayStatus}
              </span>
            </div>
            <label className="adminField">
              <span>Status</span>
              <select
                value={form.status}
                onChange={(event) =>
                  set("status", event.target.value as LegalPageStatus)
                }
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </label>
            <label className="adminField">
              <span>Publish Date &amp; Time</span>
              <input
                type="datetime-local"
                value={form.publishedAt}
                onChange={(event) => set("publishedAt", event.target.value)}
              />
              <small>Leave empty to publish immediately.</small>
            </label>
            <div className="legalFixedRoute">
              <span>Fixed public route</span>
              <code>/{pageKey}</code>
            </div>
          </section>

          <section className="blogSidePanel blogSeoPanel">
            <div className="blogPanelTitle">
              <div>
                <span>02</span>
                <h2>SEO</h2>
              </div>
            </div>
            <label className="adminField">
              <span>SEO Title</span>
              <input
                value={form.seoTitle}
                onChange={(event) => set("seoTitle", event.target.value)}
                placeholder="Optional search title"
                maxLength={100}
              />
              <small>{form.seoTitle.length} characters · target 50–60</small>
            </label>
            <label className="adminField">
              <span>Meta Description</span>
              <textarea
                value={form.seoDescription}
                onChange={(event) => set("seoDescription", event.target.value)}
                placeholder="Optional search description"
                maxLength={300}
              />
              <small>
                {form.seoDescription.length} characters · target 140–160
              </small>
            </label>
            <div className="legalFixedRoute">
              <span>Canonical URL</span>
              <code>https://mehtaxd.com/{pageKey}</code>
            </div>
          </section>
        </aside>
      </div>

      <div className="blogMobileActions legalMobileActions">
        <Link className="adminButton" href={"/admin/legal-pages" as Route}>
          Cancel
        </Link>
        <Link className="adminButton" href={previewHref} target="_blank" rel="noopener noreferrer">
          Preview Saved
        </Link>
        <button className="adminButton" type="submit" disabled={saving}>
          {saving
            ? "Saving…"
            : form.status === "draft"
              ? "Save Draft"
              : "Save Changes"}
        </button>
        {form.status === "draft" && (
          <button
            className="adminButton primary"
            type="button"
            disabled={saving}
            onClick={() => void save("published")}
          >
            Publish
          </button>
        )}
      </div>
    </form>
  );
}
