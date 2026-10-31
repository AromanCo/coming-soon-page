const CATALOG_IMAGE_HOST = "atrafshan.net";
const CATALOG_IMAGE_PATH = /^\/static\/v2\/related\/w445\/[a-f0-9-]+\.jpe?g$/i;

/** Miss Dior's catalog year is 1947, but the attached image's edition is not verified. */
export function canUseCatalogProductImage(productId: number, value: string | undefined): value is string {
  return productId !== 14185 && isAllowedCatalogImageUrl(value);
}

/** Permit only the catalog's current HTTPS image URL format on the approved third-party image host. */
export function isAllowedCatalogImageUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === CATALOG_IMAGE_HOST && !url.port && CATALOG_IMAGE_PATH.test(url.pathname) && !url.search && !url.hash;
  } catch {
    return false;
  }
}
