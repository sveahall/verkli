export type CoverExportFormat = "png" | "jpeg";

export async function encodeCover(image: HTMLImageElement, width: number, height: number, filter: string, format: CoverExportFormat): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable. Try another browser.");
  if (format === "jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
  }
  context.filter = filter;
  context.drawImage(image, 0, 0, width, height);
  const mime = `image/${format}`;
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
    (value) => value ? resolve(value) : reject(new Error("Could not encode the cover. Try again.")), mime, 0.95,
  ));
  return new File([blob], `cover-edited.${format === "jpeg" ? "jpg" : "png"}`, { type: mime });
}
