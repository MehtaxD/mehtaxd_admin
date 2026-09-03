"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";
import { Edit3, Loader2, Plus, Trash2 } from "@/components/icons";
import { nestjsApi, type Blog } from "@/lib/nestjs-api";

function statusFor(blog: Blog) {
  if (blog.status === "published" && blog.publishedAt && new Date(blog.publishedAt).getTime() > Date.now()) return "scheduled";
  return blog.status;
}

function readableDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function AdminBlogsPage() {
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { void loadBlogs(); }, []);

  async function loadBlogs() {
    setLoading(true);
    setError("");
    try {
      setBlogs(await nestjsApi.blogs.list());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load blog posts");
    } finally {
      setLoading(false);
    }
  }

  async function archiveBlog(blog: Blog) {
    if (!window.confirm(`Archive “${blog.title}”? It will no longer be public.`)) return;
    setBusyId(blog.id);
    try {
      const updated = await nestjsApi.blogs.archive(blog.id);
      setBlogs((current) => current.map((item) => item.id === blog.id ? updated : item));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not archive the post");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteBlog(blog: Blog) {
    if (!window.confirm(`Permanently delete “${blog.title}”? This cannot be undone.`)) return;
    setBusyId(blog.id);
    try {
      await nestjsApi.blogs.delete(blog.id);
      setBlogs((current) => current.filter((item) => item.id !== blog.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete the post");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="adminPageHead">
        <div><p className="adminEyebrow">Content</p><h1>Blog Posts</h1><p>Write, schedule, publish, and archive MehtaXD editorial content.</p></div>
        <Link className="adminButton primary" href={"/admin/blogs/new" as Route}><Plus size={16} /> Create Post</Link>
      </div>

      {error && <div className="adminNotice" style={{ marginBottom: 18 }}>{error}</div>}

      {loading ? (
        <div className="blogListLoading"><Loader2 className="adminSpinner" size={28} /> Loading posts…</div>
      ) : blogs.length === 0 ? (
        <section className="blogEmptyState"><span>MXD / EDITORIAL</span><h2>No blog posts yet.</h2><p>Create your first post and keep it as a draft until it is ready.</p><Link className="adminButton primary" href={"/admin/blogs/new" as Route}><Plus size={16} /> Create Post</Link></section>
      ) : (
        <div className="blogTableShell">
          <table className="blogAdminTable">
            <thead><tr><th>Title</th><th>Category</th><th>Status</th><th>Featured</th><th>Published / Scheduled</th><th>Updated</th><th>Author</th><th><span className="srOnly">Actions</span></th></tr></thead>
            <tbody>
              {blogs.map((blog) => {
                const status = statusFor(blog);
                return (
                  <tr key={blog.id}>
                    <td data-label="Title"><strong>{blog.title}</strong><small>/blog/{blog.slug}</small></td>
                    <td data-label="Category">{blog.category || "—"}</td>
                    <td data-label="Status"><span className={`adminBadge ${status}`}>{status}</span></td>
                    <td data-label="Featured">{blog.featured ? "Yes" : "—"}</td>
                    <td data-label="Published">{readableDate(blog.publishedAt)}</td>
                    <td data-label="Updated">{readableDate(blog.updatedAt)}</td>
                    <td data-label="Author">{blog.authorName || "—"}</td>
                    <td data-label="Actions">
                      <div className="blogRowActions">
                        <Link className="adminIconButton" href={`/admin/blogs/${blog.id}/edit` as Route} aria-label={`Edit ${blog.title}`}><Edit3 size={15} /></Link>
                        {blog.status !== "archived" && <button className="adminIconButton" type="button" disabled={busyId === blog.id} onClick={() => void archiveBlog(blog)} aria-label={`Archive ${blog.title}`}>↘</button>}
                        <details className="blogDangerMenu"><summary className="adminIconButton" aria-label={`More actions for ${blog.title}`}>•••</summary><div><button type="button" disabled={busyId === blog.id} onClick={() => void deleteBlog(blog)}><Trash2 size={14} /> Permanently delete</button></div></details>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
