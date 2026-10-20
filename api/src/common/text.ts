/** Minúsculo, sem acentos e com espaços normalizados — base do índice de busca. */
export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function slugify(value: string): string {
  return normalizeSearch(value).replace(/\s+/g, '-');
}

/** Texto indexado do produto: nome + marca + categoria + cores das variações. */
export function buildSearchText(
  parts: Array<string | null | undefined>,
): string {
  return normalizeSearch(parts.filter(Boolean).join(' '));
}

/** Escapa curingas do ILIKE (% e _) vindos do usuário. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
