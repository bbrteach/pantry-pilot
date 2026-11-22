/**
 * Resizes and compresses a user-selected image file in the browser so phone
 * camera photos upload quickly and keep local storage lean.
 */
export async function compressImageFile(
  file: File,
  maxDimension = 960,
  quality = 0.82
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a valid image file (JPEG, PNG, or WebP).');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the selected image.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Could not decode the selected image.'));
    el.src = dataUrl;
  });

  let { width, height } = img;
  if (width > maxDimension || height > maxDimension) {
    if (width >= height) {
      height = Math.round((height * maxDimension) / width);
      width = maxDimension;
    } else {
      width = Math.round((width * maxDimension) / height);
      height = maxDimension;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;

  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}
