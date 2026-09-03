"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, StarIcon } from "@/components/icons";
import { BlogEditor } from "@/components/blog/blog-editor";
import { nestjsApi, type Blog, type BlogStatus, type CreateBlogDto } from "@/lib/nestjs-api";

interface BlogFormState {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  status: BlogStatus;
  publishedAt: string;
  featured: boolean;
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
  ogImageUrl: string;
  category: string;
  tags: string;
  featuredImageUrl: string;
  featuredImageAlt: string;
  authorName: string;
}

const emptyForm: BlogFormState = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  status: "draft",
  publishedAt: "",
  featured: false,
  seoTitle: "",
  seoDescription: "",
  canonicalUrl: "",
  ogImageUrl: "",
  category: "",
  tags: "",
  featuredImageUrl: "",
  featuredImageAlt: "",
  authorName: "MehtaXD",
};

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}

function toDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function fromBlog(blog: Blog): BlogFormState {
  return {
    title: blog.title,
    slug: blog.slug,
    excerpt: blog.excerpt ?? "",
    content: blog.content,
    status: blog.status,
    publishedAt: toDateTimeLocal(blog.publishedAt),
    featured: blog.featured,
    seoTitle: blog.seoTitle ?? "",
    seoDescription: blog.seoDescription ?? "",
    canonicalUrl: blog.canonicalUrl ?? "",
    ogImageUrl: blog.ogImageUrl ?? "",
    category: blog.category ?? "",
    tags: blog.tags.join(", "),
    featuredImageUrl: blog.featuredImageUrl ?? "",
    featuredImageAlt: blog.featuredImageAlt ?? "",
    authorName: blog.authorName ?? "",
  };
}

function cleanTags(value: string) {
  const unique = new Map<string, string>();
  value.split(",").map((tag) => tag.trim()).filter(Boolean).forEach((tag) => {
    const key = tag.toLocaleLowerCase();
    if (!unique.has(key)) unique.set(key, tag);
  });
  return [...unique.values()];
}

function optional(value: string) {
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function BlogForm({ blogId }: { blogId?: string }) {
  const router = useRouter();
  const isEditing = Boolean(blogId);
  const slugTouched = useRef(isEditing);
  const [form, setForm] = useState<BlogFormState>(emptyForm);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (!blogId) return;
    nestjsApi.blogs.get(blogId)
      .then((blog) => setForm(fromBlog(blog)))
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Could not load the post"))
      .finally(() => setLoading(false));
  }, [blogId]);

  function set<K extends keyof BlogFormState>(key: K, value: BlogFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function changeTitle(value: string) {
    setForm((current) => ({ ...current, title: value, slug: slugTouched.current ? current.slug : slugify(value) }));
  }

  function payload(statusOverride?: BlogStatus): CreateBlogDto {
    const status = statusOverride ?? form.status;
    return {
      title: form.title.trim(),
      slug: form.slug.trim(),
      excerpt: optional(form.excerpt),
      content: form.content,
      status,
      publishedAt: status === "draft" && !form.publishedAt ? null : form.publishedAt ? new Date(form.publishedAt).toISOString() : undefined,
      featured: form.featured,
      seoTitle: optional(form.seoTitle),
      seoDescription: optional(form.seoDescription),
      canonicalUrl: optional(form.canonicalUrl),
      ogImageUrl: optional(form.ogImageUrl),
      category: optional(form.category),
      tags: cleanTags(form.tags),
      featuredImageUrl: optional(form.featuredImageUrl),
      featuredImageAlt: optional(form.featuredImageAlt),
      authorName: optional(form.authorName),
    };
  }

  async function save(statusOverride?: BlogStatus) {
    if (!form.title.trim()) return setMessage("Blog title is required.");
    if (!form.slug.trim()) return setMessage("Slug is required.");
    setSaving(true);
    setMessage("");
    try {
      if (blogId) await nestjsApi.blogs.update(blogId, payload(statusOverride));
      else await nestjsApi.blogs.create(payload(statusOverride));
      router.push("/admin/blogs" as Route);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the post");
    } finally {
      setSaving(false);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    void save();
  }

  const scheduled = form.status === "published" && Boolean(form.publishedAt) && new Date(form.publishedAt).getTime() > Date.now();
  const displayStatus = scheduled ? "Scheduled" : form.status.charAt(0).toUpperCase() + form.status.slice(1);

  if (loading) return <div className="blogEditorLoadingPage"><Loader2 className="adminSpinner" size={30} /><span>Loading post…</span></div>;

  return (
    <form className="blogCmsForm" onSubmit={submit}>
      <header className="blogCmsHeader">
        <div><p className="adminEyebrow">Content · Blog</p><h1>{isEditing ? "Edit Blog Post" : "Create Blog Post"}</h1><span>Write, optimize, and publish from one focused workspace.</span></div>
        <div className="blogCmsActions">
          <Link className="adminButton" href={"/admin/blogs" as Route}>Cancel</Link>
          {!isEditing && <button className="adminButton" type="button" disabled={saving} onClick={() => void save("draft")}>Save Draft</button>}
          {isEditing && form.status !== "draft" && <button className="adminButton" type="button" disabled={saving} onClick={() => void save("draft")}>Save as Draft</button>}
          <button className="adminButton primary" type="submit" disabled={saving}>{saving ? <><Loader2 className="adminSpinner" size={15} /> Saving…</> : isEditing ? "Save Changes" : "Create Post"}</button>
        </div>
      </header>

      {message && <div className="adminNotice blogCmsNotice">{message}</div>}

      <div className="blogCmsGrid">
        <main className="blogCmsMain">
          <label className="blogTitleField"><span className="srOnly">Blog title</span><input value={form.title} onChange={(event) => changeTitle(event.target.value)} placeholder="Blog Title" required maxLength={220} /></label>
          <label className="adminField blogSlugField"><span>Slug</span><input value={form.slug} onChange={(event) => { slugTouched.current = true; set("slug", slugify(event.target.value)); }} placeholder="example-slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /><small>mehtaxd.com/blog/{form.slug || "example-slug"}</small></label>
          <label className="adminField blogExcerptField"><span>Short Excerpt</span><textarea value={form.excerpt} onChange={(event) => set("excerpt", event.target.value)} placeholder="A concise preview for listings, search, and sharing." maxLength={600} /><small>{form.excerpt.length} / 600</small></label>
          <div className="adminField blogContentField"><span>Article Content</span><BlogEditor value={form.content} onChange={(html) => set("content", html)} /></div>
        </main>

        <aside className="blogCmsSidebar">
          <section className="blogSidePanel blogPublishPanel">
            <div className="blogPanelTitle"><div><span>01</span><h2>Publishing</h2></div><span className={`adminBadge ${scheduled ? "scheduled" : form.status}`}>{displayStatus}</span></div>
            <label className="adminField"><span>Status</span><select value={form.status} onChange={(event) => set("status", event.target.value as BlogStatus)}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label>
            <label className="adminField"><span>Publish Date &amp; Time</span><input type="datetime-local" value={form.publishedAt} onChange={(event) => set("publishedAt", event.target.value)} /><small>Leave empty to publish immediately.</small></label>
            <label className="blogToggle"><span><StarIcon size={15} /> Featured Post</span><input type="checkbox" checked={form.featured} onChange={(event) => set("featured", event.target.checked)} /></label>
          </section>

          <section className="blogSidePanel blogSeoPanel">
            <div className="blogPanelTitle"><div><span>02</span><h2>SEO</h2></div></div>
            <label className="adminField"><span>SEO Title</span><input value={form.seoTitle} onChange={(event) => set("seoTitle", event.target.value)} placeholder="Optional search title" maxLength={100} /><small>{form.seoTitle.length} characters · target 50–60</small></label>
            <label className="adminField"><span>Meta Description</span><textarea value={form.seoDescription} onChange={(event) => set("seoDescription", event.target.value)} placeholder="Optional search description" maxLength={300} /><small>{form.seoDescription.length} characters · target 140–160</small></label>
            <label className="adminField"><span>Canonical URL</span><input type="url" value={form.canonicalUrl} onChange={(event) => set("canonicalUrl", event.target.value)} placeholder="https://mehtaxd.com/blog/example" /></label>
            <label className="adminField"><span>OG Image URL</span><input type="url" value={form.ogImageUrl} onChange={(event) => set("ogImageUrl", event.target.value)} placeholder="https://cdn.example.com/social.webp" /></label>
          </section>

          <section className="blogSidePanel blogTaxonomyPanel">
            <div className="blogPanelTitle"><div><span>03</span><h2>Category &amp; Tags</h2></div></div>
            <label className="adminField"><span>Category</span><input value={form.category} onChange={(event) => set("category", event.target.value)} placeholder="Guides" maxLength={120} /></label>
            <label className="adminField"><span>Tags</span><input value={form.tags} onChange={(event) => set("tags", event.target.value)} placeholder="gaming, delivery, guides" /><small>Comma-separated. Empty and duplicate tags are removed.</small></label>
          </section>

          <section className="blogSidePanel blogImagePanel">
            <div className="blogPanelTitle"><div><span>04</span><h2>Featured Image</h2></div></div>
            {form.featuredImageUrl && !imageError ? <div className="blogImagePreview"><img src={form.featuredImageUrl} alt={form.featuredImageAlt || "Featured image preview"} onError={() => setImageError(true)} /><button type="button" onClick={() => { set("featuredImageUrl", ""); setImageError(false); }}>Remove</button></div> : <div className="blogImagePlaceholder"><span className="blogImageEmptyMark" aria-hidden="true">▧</span><span>{imageError ? "Image could not be loaded" : "Add a hosted media URL"}</span><small>Protected uploads will be added with the media library.</small></div>}
            <label className="adminField"><span>Featured Image URL</span><input type="url" value={form.featuredImageUrl} onChange={(event) => { set("featuredImageUrl", event.target.value); setImageError(false); }} placeholder="https://cdn.example.com/feature.webp" /></label>
            <label className="adminField"><span>Image Alt Text</span><input value={form.featuredImageAlt} onChange={(event) => set("featuredImageAlt", event.target.value)} placeholder="Describe the image for accessibility" maxLength={300} /></label>
          </section>

          <section className="blogSidePanel blogAuthorPanel">
            <div className="blogPanelTitle"><div><span>05</span><h2>Author</h2></div></div>
            <label className="adminField"><span>Author Name</span><input value={form.authorName} onChange={(event) => set("authorName", event.target.value)} placeholder="MehtaXD" maxLength={120} /></label>
          </section>
        </aside>
      </div>
      <div className="blogMobileActions">
        <Link className="adminButton" href={"/admin/blogs" as Route}>Cancel</Link>
        {!isEditing && <button className="adminButton" type="button" disabled={saving} onClick={() => void save("draft")}>Save Draft</button>}
        {isEditing && form.status !== "draft" && <button className="adminButton" type="button" disabled={saving} onClick={() => void save("draft")}>Save as Draft</button>}
        <button className="adminButton primary" type="submit" disabled={saving}>{saving ? "Saving…" : isEditing ? "Save Changes" : "Create Post"}</button>
      </div>
    </form>
  );
}
