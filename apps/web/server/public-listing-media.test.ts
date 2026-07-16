import assert from "node:assert/strict";
import test from "node:test";
import type { ListingMedia } from "@gems/schemas";
import { resolvePublicListingMedia } from "./public-listing-media.js";

const media: ListingMedia[] = [
  {
    id: "photo-1",
    listingId: "listing 1",
    kind: "photo",
    url: "https://storage.example/photo.jpg?sig=fresh",
    thumbnailUrl: "https://storage.example/photo.card.webp?sig=fresh",
    alt: "Natural blue sapphire",
    order: 0,
    moderationStatus: "not_submitted"
  },
  {
    id: "certificate-1",
    listingId: "listing 1",
    kind: "certificate",
    url: "https://storage.example/private-certificate.pdf?sig=secret",
    alt: "Certificate",
    order: 1,
    moderationStatus: "not_submitted"
  }
];

test("stable public photo routes resolve fresh photo and thumbnail redirects", async () => {
  const load = async (id: string) => id === "listing 1" ? { listing: { media } } : undefined;
  const photo = await resolvePublicListingMedia("/media/listings/listing%201/photos/0", load);
  const thumbnail = await resolvePublicListingMedia("/media/listings/listing%201/photos/0/thumbnail.webp", load);
  assert.equal(photo.location, "https://storage.example/photo.jpg?sig=fresh");
  assert.equal(thumbnail.location, "https://storage.example/photo.card.webp?sig=fresh");
});

test("stable media routes do not expose private listings, certificates, or missing orders", async () => {
  const publicLoad = async () => ({ listing: { media } });
  const privateLoad = async () => undefined;
  assert.deepEqual(await resolvePublicListingMedia("/media/listings/private/photos/0", privateLoad), { matched: true });
  assert.deepEqual(await resolvePublicListingMedia("/media/listings/listing%201/photos/1", publicLoad), { matched: true });
  assert.deepEqual(await resolvePublicListingMedia("/media/listings/listing%201/photos/99", publicLoad), { matched: true });
  assert.deepEqual(await resolvePublicListingMedia("/media/listings/listing%201/certificates/1", publicLoad), { matched: false });
});
