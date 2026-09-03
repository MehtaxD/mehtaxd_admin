"use client";

import { useParams } from "next/navigation";
import { BlogForm } from "@/components/blog/blog-form";

export default function EditBlogPage() {
  const params = useParams<{ id: string }>();
  return <BlogForm blogId={params.id} />;
}
