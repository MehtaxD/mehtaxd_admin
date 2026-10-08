"use client";

import { useState } from "react";
import { nestjsApi } from "@/lib/nestjs-api";

type Kind = "icon" | "banner" | "og";

export function GameMediaField({ kind, label, value, fallbackUrl, onChange, onUploadStateChange }: {
  kind: Kind;
  label: string;
  value: string;
  fallbackUrl?: string;
  onChange: (url: string) => void;
  onUploadStateChange: (delta: number) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loadedUrl, setLoadedUrl] = useState("");
  const [brokenUrl, setBrokenUrl] = useState("");
  const preview = value || fallbackUrl;
  const imageBroken = Boolean(preview && brokenUrl === preview);
  const imageLoaded = Boolean(preview && loadedUrl === preview);
  const sizeHint = kind === "icon"
    ? "Recommended: 512 × 512 px, square PNG or WebP."
    : kind === "banner"
      ? "Recommended: 1600 × 1280 px (5:4). Keep important details centered for the wider mobile crop."
      : "Recommended: 1200 × 630 px (social preview, 1.91:1).";

  async function upload(file: File) {
    setError("");
    setMessage("");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024 || file.size === 0) {
      setError("Choose a PNG, JPEG, or WebP image up to 5 MB.");
      return;
    }
    setUploading(true);
    onUploadStateChange(1);
    try {
      const result = await nestjsApi.games.uploadMedia(kind, file);
      onChange(result.url);
      setMessage("Uploaded. Check the crop below, then save the Game.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Image upload failed. Try again.");
    } finally {
      setUploading(false);
      onUploadStateChange(-1);
    }
  }

  return (
    <div className="adminGameMediaField">
      <div className="adminGameMediaHeading"><strong>{label}</strong><span>{imageBroken ? "Image unavailable" : kind === "og" && !value && fallbackUrl ? "Using Banner" : imageLoaded ? "Ready to save" : preview ? "Checking image…" : "No image"}</span></div>
      <p className="adminHint">{sizeHint} Maximum 5 MB.</p>
      <div className="adminGameMediaCrops">
        <div className={`adminGameMediaPreview ${kind}`}>
          {preview && !imageBroken ? <img src={preview} alt={`${label} crop preview`} onLoad={() => { setLoadedUrl(preview); setBrokenUrl(""); }} onError={() => setBrokenUrl(preview)} /> : <span>{imageBroken ? "Image could not be loaded" : `No ${label.toLowerCase()} selected`}</span>}
        </div>
        {kind === "banner" && preview && !imageBroken ? <div className="adminGameMediaPreview bannerMobile"><img src={preview} alt="Mobile Games listing crop preview" /></div> : null}
      </div>
      {imageBroken ? <p className="adminNotice" role="alert">This image URL does not load. Replace it with an upload or remove it before saving.</p> : null}
      {preview ? <p className="adminHint">{kind === "banner" ? "Games listing · desktop and mobile crops" : kind === "icon" ? "Games listing fallback when no Banner is set" : "Social share · 1.91:1 crop"}</p> : null}
      {kind === "og" && !value && fallbackUrl ? <p className="adminHint">The Banner will be used for social sharing unless you upload a separate image.</p> : null}
      <div className="adminGameMediaActions">
        <label className="adminButton">
          {uploading ? "Uploading…" : value ? "Replace image" : "Upload image"}
          <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} aria-label={`Upload ${label.toLowerCase()}`} onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void upload(file);
          }} />
        </label>
        {value ? <button type="button" className="adminButton" disabled={uploading} onClick={() => { onChange(""); setError(""); setMessage("Image removed. Save the Game to keep this change."); }}>Remove</button> : null}
      </div>
      <details className="adminGameMediaUrl"><summary>Use hosted URL instead</summary><input type="url" value={value} onChange={(event) => onChange(event.target.value)} aria-label={`${label} URL`} placeholder="https://…" /></details>
      {error ? <p className="adminNotice" role="alert">{error}</p> : null}
      {message ? <p className="adminHint" role="status">{message}</p> : null}
    </div>
  );
}
