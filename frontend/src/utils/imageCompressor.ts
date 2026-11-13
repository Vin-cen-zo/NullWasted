/**
 * Client-Side Image Compressor for NullWasted Food Images.
 * Uses HTML5 Canvas to resize photos to maxDimension (default 800px)
 * and exports as lightweight WebP (0.8 quality, ~50-150 KB) with JPEG fallback.
 * Automatically cleans up object URLs to prevent memory leaks.
 */

export async function compressImageFile(
  file: File,
  maxDimension: number = 800,
  quality: number = 0.8
): Promise<File> {
  // If not an image, return original
  if (!file.type.startsWith("image/")) {
    return file;
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      const tryExport = (mimeType: string, ext: string) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              if (mimeType !== "image/jpeg") {
                tryExport("image/jpeg", ".jpg");
              } else {
                resolve(file);
              }
              return;
            }

            const baseName = file.name.replace(/\.[^/.]+$/, "");
            const compressedFile = new File([blob], `${baseName}${ext}`, {
              type: mimeType,
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          },
          mimeType,
          quality
        );
      };

      tryExport("image/webp", ".webp");
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Gagal membaca berkas gambar untuk dikompresi."));
    };

    img.src = objectUrl;
  });
}
