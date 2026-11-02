/** Lado da foto de perfil salva (quadrada) e qualidade do JPEG: ~15–30 KB, dentro do limite do servidor. */
const AVATAR_SIZE = 256;
const JPEG_QUALITY = 0.82;
/** Mesmo teto do servidor (readAvatar); acima disso tenta de novo com qualidade menor. */
const MAX_DATA_URL_LENGTH = 60000;

/** Miniatura do ranking (lista de até 50 pessoas): 64×64, ~2–4 KB, teto igual ao do servidor. */
const THUMB_SIZE = 64;
const MAX_THUMB_LENGTH = 8000;

/** Desenha o recorte central quadrado da imagem num canvas de `size` × `size` e devolve o JPEG que caiba em `maxLength`. */
function renderSquareJpeg(bitmap, size, maxLength) {
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff"; // fundo branco para PNG com transparência
  context.fillRect(0, 0, size, size);
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);

  let quality = JPEG_QUALITY;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length > maxLength && quality > 0.4) {
    quality -= 0.15;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  if (dataUrl.length > maxLength) throw new Error("A foto ficou grande demais. Tente outra imagem.");
  return dataUrl;
}

/**
 * Lê a imagem escolhida e devolve a foto (256×256) e a miniatura do ranking (64×64), JPEG com recorte central.
 * A foto original não sai do aparelho: só as versões pequenas são enviadas.
 * @param {File} file
 * @returns {Promise<{avatar: string, avatarThumb: string}>}
 * @throws {Error} se o arquivo não for uma imagem que o navegador consiga abrir.
 * Usado por: ProfilePage (trocar a foto de perfil).
 */
export async function fileToAvatarImages(file) {
  if (!file.type.startsWith("image/")) throw new Error("Escolha um arquivo de imagem.");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("Não foi possível abrir essa imagem. Tente outra.");
  });
  try {
    return {
      avatar: renderSquareJpeg(bitmap, AVATAR_SIZE, MAX_DATA_URL_LENGTH),
      avatarThumb: renderSquareJpeg(bitmap, THUMB_SIZE, MAX_THUMB_LENGTH),
    };
  } finally {
    bitmap.close?.();
  }
}
