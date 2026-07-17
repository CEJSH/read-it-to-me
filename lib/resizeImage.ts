export interface ResizedImage {
  media: string;
  data: string;
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(new Error("file read fail"));
    r.readAsDataURL(file);
  });
}

const SUPPORTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function resizeImage(
  file: File,
  max = 1100,
  quality = 0.72,
): Promise<ResizedImage> {
  const dataUrl = await readAsDataURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error("decode fail"));
      im.src = dataUrl;
    });
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    if (Math.max(w, h) > max) {
      const k = max / Math.max(w, h);
      w = Math.round(w * k);
      h = Math.round(h * k);
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unsupported");
    ctx.drawImage(img, 0, 0, w, h);
    return {
      media: "image/jpeg",
      data: canvas.toDataURL("image/jpeg", quality).split(",")[1],
    };
  } catch {
    if (SUPPORTED_TYPES.includes(file.type)) {
      return { media: file.type, data: dataUrl.split(",")[1] };
    }
    throw new Error("unsupported image: " + file.type);
  }
}
