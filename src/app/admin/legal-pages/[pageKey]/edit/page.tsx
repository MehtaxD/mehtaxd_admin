"use client";

import { notFound, useParams } from "next/navigation";
import { LegalPageForm } from "@/components/legal/legal-page-form";
import { LEGAL_PAGE_KEYS, type LegalPageKey } from "@/lib/nestjs-api";

export default function EditLegalPage() {
  const params = useParams<{ pageKey: string }>();
  if (!LEGAL_PAGE_KEYS.includes(params.pageKey as LegalPageKey)) notFound();
  return <LegalPageForm pageKey={params.pageKey as LegalPageKey} />;
}
