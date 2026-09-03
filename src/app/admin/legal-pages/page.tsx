"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";
import { Edit3, Loader2 } from "@/components/icons";
import { nestjsApi, type LegalPage } from "@/lib/nestjs-api";

function readableDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function publicStatus(page: LegalPage) {
  if (
    page.status === "published" &&
    page.publishedAt &&
    new Date(page.publishedAt).getTime() > Date.now()
  ) {
    return "scheduled";
  }
  return page.status;
}

export default function AdminLegalPagesPage() {
  const [pages, setPages] = useState<LegalPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    nestjsApi.legalPages
      .list()
      .then(setPages)
      .catch((caught: unknown) =>
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load legal pages",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <div className="adminPageHead">
        <div>
          <p className="adminEyebrow">Content</p>
          <h1>Legal Pages</h1>
          <p>
            Edit and publish the four fixed legal pages shown in the storefront
            footer.
          </p>
        </div>
      </div>

      {error && (
        <div className="adminNotice" style={{ marginBottom: 18 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="blogListLoading">
          <Loader2 className="adminSpinner" size={28} /> Loading legal pages…
        </div>
      ) : (
        <div className="blogTableShell legalTableShell">
          <table className="blogAdminTable legalAdminTable">
            <thead>
              <tr>
                <th>Page</th>
                <th>Public Route</th>
                <th>Status</th>
                <th>Published</th>
                <th>Last Updated</th>
                <th>
                  <span className="srOnly">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pages.map((page) => {
                const status = publicStatus(page);
                return (
                  <tr key={page.id}>
                    <td data-label="Page">
                      <strong>{page.title}</strong>
                    </td>
                    <td data-label="Public Route">
                      <code>/{page.pageKey}</code>
                    </td>
                    <td data-label="Status">
                      <span className={`adminBadge ${status}`}>{status}</span>
                    </td>
                    <td data-label="Published">
                      {readableDate(page.publishedAt)}
                    </td>
                    <td data-label="Last Updated">
                      {readableDate(page.updatedAt)}
                    </td>
                    <td data-label="Actions">
                      <div className="blogRowActions">
                        <Link
                          className="adminButton legalPreviewButton"
                          href={
                            `/admin/legal-pages/${page.pageKey}/preview` as Route
                          }
                        >
                          Preview
                        </Link>
                        <Link
                          className="adminIconButton"
                          href={
                            `/admin/legal-pages/${page.pageKey}/edit` as Route
                          }
                          aria-label={`Edit ${page.title}`}
                        >
                          <Edit3 size={15} />
                        </Link>
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
