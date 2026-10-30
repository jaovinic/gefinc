/**
 * Monta um arquivo `.ico` a partir de imagens PNG já renderizadas (formato com PNG embutido, aceito por
 * todos os navegadores atuais). Cada item é `{ size, png }`; `size` vai de 1 a 256.
 */
export function buildIco(images) {
  if (images.length === 0) {
    throw new Error('Informe ao menos uma imagem.');
  }
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reservado
  header.writeUInt16LE(1, 2); // tipo: ícone
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, png }) => {
    if (!Number.isInteger(size) || size < 1 || size > 256) {
      throw new Error(`Tamanho inválido para o ícone: ${size}`);
    }
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0); // largura (0 = 256)
    entry.writeUInt8(size === 256 ? 0 : size, 1); // altura
    entry.writeUInt8(0, 2); // sem paleta
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4); // planos
    entry.writeUInt16LE(32, 6); // bits por pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)]);
}
