import { NextResponse } from "next/server";
import { adminBackend, validateAdminOrigin } from "@/lib/admin-api-route";

const MAX_BODY_BYTES = 5 * 1024 * 1024 + 8192;

export async function POST(request: Request) {
  const originError = validateAdminOrigin(request);
  if (originError) return originError;
  const contentType = request.headers.get("content-type") || "";
  if (!/^multipart\/form-data;\s*boundary=.+$/i.test(contentType))
    return NextResponse.json({ message: "Choose an image to upload." }, { status: 415 });
  if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES)
    return NextResponse.json({ message: "Image must be 5 MB or smaller." }, { status: 413 });
  if (!request.body)
    return NextResponse.json({ message: "Choose an image to upload." }, { status: 400 });

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return NextResponse.json({ message: "Image must be 5 MB or smaller." }, { status: 413 });
      }
      chunks.push(value);
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    return adminBackend("/admin/products/media", {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
    });
  } catch {
    return NextResponse.json({ message: "Image upload could not be completed. Try again." }, { status: 503 });
  }
}
