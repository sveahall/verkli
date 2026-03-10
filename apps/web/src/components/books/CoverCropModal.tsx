"use client";

import { useState, useRef, useCallback } from "react";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

const ASPECT_RATIO = 3 / 4;

function getCroppedCanvas(
  image: HTMLImageElement,
  crop: PixelCrop,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  canvas.width = crop.width * scaleX;
  canvas.height = crop.height * scaleY;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2d context");

  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas;
}

type Props = {
  src: string;
  onSave: (file: File) => Promise<void>;
  onClose: () => void;
};

export default function CoverCropModal({ src, onSave, onClose }: Props) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    imgRef.current = e.currentTarget;
    const { width, height } = e.currentTarget;
    const cropWidth = Math.min(width, height * ASPECT_RATIO);
    const cropHeight = cropWidth / ASPECT_RATIO;
    const initial: PixelCrop = {
      unit: "px",
      x: Math.round((width - cropWidth) / 2),
      y: Math.round((height - cropHeight) / 2),
      width: Math.round(cropWidth),
      height: Math.round(cropHeight),
    };
    setCrop(initial);
    setCompletedCrop(initial);
  }, []);

  const handleSave = async () => {
    if (!imgRef.current || !completedCrop) return;
    setSaving(true);
    setError(null);
    try {
      const canvas = getCroppedCanvas(imgRef.current, completedCrop);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.92),
      );
      const file = new File([blob], "cover-cropped.jpg", { type: "image/jpeg" });
      await onSave(file);
      onClose();
    } catch {
      setError("Could not save crop. The image may not allow editing. Try downloading and re-uploading it first.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="mx-4 flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-4 dark:border-white/[0.06]">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">Crop cover</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-white/40 dark:hover:bg-white/[0.06]"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-auto p-5">
          <ReactCrop
            crop={crop}
            onChange={(c) => setCrop(c)}
            onComplete={(c) => setCompletedCrop(c)}
            aspect={ASPECT_RATIO}
            className="max-h-[60vh]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={src}
              alt="Crop preview"
              crossOrigin="anonymous"
              onLoad={onImageLoad}
              className="max-h-[60vh] w-auto"
            />
          </ReactCrop>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-black/[0.06] px-5 py-4 dark:border-white/[0.06]">
          {error ? (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          ) : <span />}
          <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-black/[0.08] px-4 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50 dark:border-white/[0.08] dark:text-white/60 dark:hover:bg-white/[0.04]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !completedCrop}
            className="rounded-xl bg-[#907AFF] px-5 py-2 text-[13px] font-semibold text-white shadow-sm transition-all hover:bg-[#7B6BF0] disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save crop"}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
