import type { Listing } from "@gems/schemas";

export interface PublicListingMediaResolution {
  matched: boolean;
  location?: string;
}

type PublicListingLoader = (listingId: string) => Promise<{ listing: Pick<Listing, "media"> } | undefined>;

export async function resolvePublicListingMedia(pathname: string, loadPublicListing: PublicListingLoader): Promise<PublicListingMediaResolution> {
  const match = pathname.match(/^\/media\/listings\/([^/]+)\/photos\/(\d+)(\/thumbnail\.webp)?$/);
  if (!match) return { matched: false };

  let listingId: string;
  try {
    listingId = decodeURIComponent(match[1]);
  } catch {
    return { matched: true };
  }

  const result = await loadPublicListing(listingId);
  const order = Number(match[2]);
  const photo = result?.listing.media.find((media) => media.kind === "photo" && media.order === order);
  if (!photo) return { matched: true };

  return {
    matched: true,
    location: match[3] ? photo.thumbnailUrl || photo.url : photo.url
  };
}
