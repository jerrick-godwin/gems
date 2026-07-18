export function normalizeListingTitle(value: string) {
  return value
    .trim()
    .split(/\s+/u)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
