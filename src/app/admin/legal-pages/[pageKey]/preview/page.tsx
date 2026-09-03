"use client";

import Link from "next/link";
import type { Route } from "next";
import { notFound, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "@/components/icons";
import {
  LEGAL_PAGE_KEYS,
  nestjsApi,
  type LegalPage,
  type LegalPageKey,
} from "@/lib/nestjs-api";

function readableDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(
    new Date(value),
  );
}

export default function PreviewLegalPage() {
  const params = useParams<{ pageKey: string }>();
  if (!LEGAL_PAGE_KEYS.includes(params.pageKey as LegalPageKey)) notFound();
  const pageKey = params.pageKey as LegalPageKey;
  const [page, setPage] = useState<LegalPage | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    nestjsApi.legalPages
      .get(pageKey)
      .then(setPage)
      .catch((caught: unknown) =>
        setError(
          caught instanceof Error ? caught.message : "Could not load preview",
        ),
      );
  }, [pageKey]);

  if (!page) {
    return (
      <div className="blogEditorLoadingPage">
        {error || (
          <>
            <Loader2 className="adminSpinner" size={30} /> Loading preview…
          </>
        )}
      </div>
    );
  }

  return (
    <div className="legalAdminPreview">
      <header className="blogCmsHeader">
        <div>
          <p className="adminEyebrow">Private Admin Preview</p>
          <h1>{page.title}</h1>
          <span>
            {page.status === "published" ? "Published" : "Draft"} · Last updated{" "}
            {readableDate(page.updatedAt)}
          </span>
        </div>
        <div className="blogCmsActions legalPreviewActions">
          <Link
            className="adminButton"
            href={`/admin/legal-pages/${page.pageKey}/edit` as Route}
          >
            Back to Editor
          </Link>
        </div>
      </header>
      <article
        className="legalPreviewBody blogEditorContent"
        dangerouslySetInnerHTML={{ __html: page.content }}
      />
    </div>
  );
}
