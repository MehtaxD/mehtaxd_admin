"use client";

import { useCallback, useEffect, useState } from "react";
import {
  nestjsApi,
  type AdminReview,
  type AdminReviewList,
  type AdminReviewSummary,
} from "@/lib/nestjs-api";
import styles from "./reviews.module.css";

type Filter = "all" | "published" | "hidden" | "featured";

function readableDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

export default function AdminReviewsPage() {
  const [list, setList] = useState<AdminReviewList | null>(null);
  const [summary, setSummary] = useState<AdminReviewSummary | null>(null);
  const [featured, setFeatured] = useState<AdminReview[]>([]);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const filterParams =
        filter === "published"
          ? { published: true }
          : filter === "hidden"
            ? { published: false }
            : filter === "featured"
              ? { featured: true }
              : {};
      const [nextList, nextSummary, featuredList] = await Promise.all([
        nestjsApi.reviews.list({ page, pageSize: 25, ...filterParams }),
        nestjsApi.reviews.summary(),
        nestjsApi.reviews.list({ page: 1, pageSize: 100, featured: true }),
      ]);
      setError("");
      setList(nextList);
      setSummary(nextSummary);
      setFeatured(featuredList.items);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Reviews could not load.",
      );
    }
  }, [filter, page]);

  useEffect(() => {
    // Initial remote data synchronization for this client-only Admin screen.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function updateReview(
    review: AdminReview,
    change: { published?: boolean; homepageFeatured?: boolean },
  ) {
    setBusy(review.id);
    setError("");
    try {
      await nestjsApi.reviews.update(review.id, change);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Review could not be updated.",
      );
    } finally {
      setBusy("");
    }
  }

  async function moveFeatured(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= featured.length) return;
    const reordered = [...featured];
    [reordered[index], reordered[target]] = [
      reordered[target],
      reordered[index],
    ];
    setBusy("reorder");
    setFeatured(reordered);
    try {
      await nestjsApi.reviews.reorderHomepage(reordered.map((item) => item.id));
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Review order could not be saved.",
      );
      await load();
    } finally {
      setBusy("");
    }
  }

  async function removeReview(review: AdminReview) {
    if (!window.confirm("Delete this imported review from MehtaXD?")) return;
    setBusy(review.id);
    try {
      await nestjsApi.reviews.delete(review.id);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Review could not be deleted.",
      );
    } finally {
      setBusy("");
    }
  }

  return (
    <div className={styles.page}>
      <div className="adminPageHead">
        <div>
          <p className="adminEyebrow">Trust content</p>
          <h1>Reviews</h1>
          <p>
            Control publication and choose the reviews shown on the homepage.
          </p>
        </div>
      </div>

      {error ? (
        <div className="adminNotice" role="alert">
          {error}
        </div>
      ) : null}

      <section className={styles.summary} aria-label="Review totals">
        <div className={styles.metric}>
          <span>Imported</span>
          <strong>{summary?.total ?? "—"}</strong>
        </div>
        <div className={styles.metric}>
          <span>Published</span>
          <strong>{summary?.published ?? "—"}</strong>
        </div>
        <div className={styles.metric}>
          <span>Homepage</span>
          <strong>{summary?.homepageFeatured ?? "—"}</strong>
        </div>
      </section>

      <div className={styles.filters} aria-label="Filter reviews">
        {(["all", "published", "hidden", "featured"] as const).map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={filter === item}
            onClick={() => {
              setFilter(item);
              setPage(1);
            }}
          >
            {item}
          </button>
        ))}
      </div>

      {!list ? (
        <div className={styles.empty}>Loading reviews…</div>
      ) : list.items.length === 0 ? (
        <div className={styles.empty}>No reviews match this view.</div>
      ) : (
        <section className={styles.list} aria-label="Imported reviews">
          {list.items.map((review) => {
            const featuredIndex = featured.findIndex(
              (item) => item.id === review.id,
            );
            return (
              <article className={styles.card} key={review.id}>
                <div className={styles.copy}>
                  <div className={styles.meta}>
                    <span>
                      {review.wasInitialRatingPositive
                        ? "Positive"
                        : "Not positive"}
                    </span>
                    <span>{review.gameTitle || "Game unavailable"}</span>
                    <span>
                      {review.productTitle ||
                        review.category ||
                        "Item unavailable"}
                    </span>
                    <time>
                      {readableDate(
                        review.orderCompletedAt || review.orderCreatedAt,
                      )}
                    </time>
                  </div>
                  <blockquote>{review.reviewMessage}</blockquote>
                  {review.feedbackTags.length ? (
                    <div className={styles.tags}>
                      {review.feedbackTags.map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className={styles.actions}>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={review.published}
                      disabled={busy === review.id}
                      onChange={(event) =>
                        void updateReview(review, {
                          published: event.target.checked,
                        })
                      }
                    />{" "}
                    Published
                  </label>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={review.homepageFeatured}
                      disabled={busy === review.id}
                      onChange={(event) =>
                        void updateReview(review, {
                          homepageFeatured: event.target.checked,
                        })
                      }
                    />{" "}
                    Homepage
                  </label>
                  {featuredIndex >= 0 ? (
                    <div className={styles.order} aria-label="Homepage order">
                      <button
                        type="button"
                        disabled={Boolean(busy) || featuredIndex === 0}
                        onClick={() => void moveFeatured(featuredIndex, -1)}
                        aria-label="Move review earlier"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={
                          Boolean(busy) || featuredIndex === featured.length - 1
                        }
                        onClick={() => void moveFeatured(featuredIndex, 1)}
                        aria-label="Move review later"
                      >
                        ↓
                      </button>
                    </div>
                  ) : null}
                  <button
                    className={styles.delete}
                    type="button"
                    disabled={busy === review.id}
                    onClick={() => void removeReview(review)}
                  >
                    Delete local copy
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {list && list.totalPages > 1 ? (
        <nav className={styles.pagination} aria-label="Review pages">
          <button
            className="adminButton"
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            Previous
          </button>
          <span>
            Page {page} of {list.totalPages}
          </span>
          <button
            className="adminButton"
            type="button"
            disabled={page >= list.totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
        </nav>
      ) : null}
    </div>
  );
}
