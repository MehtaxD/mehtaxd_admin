"use client";

import { useState } from "react";
import { nestjsApi } from "@/lib/nestjs-api";

export type ProductImageForm = { key: string; imageUrl: string; altText: string };

export function ProductMediaEditor({ images, onChange, onUploadStateChange, productName }: {
  images: ProductImageForm[];
  onChange: (images: ProductImageForm[]) => void;
  onUploadStateChange: (delta: number) => void;
  productName: string;
}) {
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [broken, setBroken] = useState<string[]>([]);

  async function upload(file: File, key?: string) {
    setError("");
    if (!file.size || file.size > 5 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Choose a PNG, JPEG, or WebP image up to 5 MB.");
      return;
    }
    const pendingKey = key ?? crypto.randomUUID();
    setUploadingKey(pendingKey);
    onUploadStateChange(1);
    try {
      const result = await nestjsApi.products.uploadMedia(file);
      if (key) onChange(images.map((image) => image.key === key ? { ...image, imageUrl: result.url } : image));
      else onChange([...images, { key: pendingKey, imageUrl: result.url, altText: "" }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Image upload failed. Try again.");
    } finally {
      setUploadingKey(null);
      onUploadStateChange(-1);
    }
  }

  function move(index: number, nextIndex: number) {
    if (nextIndex < 0 || nextIndex >= images.length) return;
    const reordered = [...images];
    reordered.splice(nextIndex, 0, reordered.splice(index, 1)[0]);
    onChange(reordered);
  }

  return (
    <div className="adminProductMedia">
      <p className="adminHint">First image is the main Product image. The preview uses the same cover crop as the Storefront; the gallery follows this order. PNG, JPEG or WebP, up to 5 MB each.</p>
      {images.map((image, index) => (
        <div className="adminProductMediaItem" key={image.key}>
          <div className="adminProductMediaCrop">
            {broken.includes(image.imageUrl)
              ? <span role="alert">Image unavailable. Replace or remove it.</span>
              : <img src={image.imageUrl} alt={`${productName || "Product"} ${index === 0 ? "main image" : `gallery image ${index + 1}`} crop preview`}
                  onError={() => setBroken((current) => [...current, image.imageUrl])} />}
          </div>
          <div className="adminProductMediaDetails">
            <strong>{index === 0 ? "Main image" : `Gallery ${index + 1}`}</strong>
            <label className="adminField">Alt text
              <input value={image.altText} maxLength={250} onChange={(event) => onChange(images.map((item) => item.key === image.key ? { ...item, altText: event.target.value } : item))}
                placeholder={productName || "Describe the image"} />
            </label>
            <div className="adminProductMediaActions">
              <label className="adminButton">{uploadingKey === image.key ? "Uploading…" : "Replace"}
                <input type="file" accept="image/png,image/jpeg,image/webp" disabled={Boolean(uploadingKey)} aria-label={`Replace image ${index + 1}`}
                  onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file, image.key); }} />
              </label>
              <button type="button" className="adminButton" disabled={Boolean(uploadingKey)} onClick={() => onChange(images.filter((item) => item.key !== image.key))}>Remove</button>
              <button type="button" className="adminButton" disabled={index === 0} aria-label={`Move image ${index + 1} up`} onClick={() => move(index, index - 1)}>↑</button>
              <button type="button" className="adminButton" disabled={index === images.length - 1} aria-label={`Move image ${index + 1} down`} onClick={() => move(index, index + 1)}>↓</button>
            </div>
          </div>
        </div>
      ))}
      {images.length < 10 ? <label className="adminButton adminProductMediaAdd">{uploadingKey ? "Uploading…" : images.length ? "Add gallery image" : "Upload main image"}
        <input type="file" accept="image/png,image/jpeg,image/webp" disabled={Boolean(uploadingKey)} aria-label="Upload Product image"
          onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} />
      </label> : <p className="adminHint">Maximum 10 images.</p>}
      {error ? <p className="adminNotice" role="alert">{error}</p> : null}
    </div>
  );
}
