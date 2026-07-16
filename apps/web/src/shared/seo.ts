export const siteName = "Gemslanka";

export const footerDescription =
  "Your trusted all-in-one gemstone marketplace for buying and selling valuable gemstones with passion, transparency, and confidence.";

export const priorityGemSlugs = [
  "sapphire",
  "ruby",
  "spinel",
  "cats-eye",
  "moonstone",
  "alexandrite",
  "zircon",
  "garnet",
  "tourmaline",
  "aquamarine",
  "emerald",
  "topaz"
] as const;

const priorityGemSlugSet = new Set<string>(priorityGemSlugs);

export function isPriorityGemSlug(slug: string) {
  return priorityGemSlugSet.has(slug);
}

export type SeoLandingPageId =
  | "buy"
  | "sell"
  | "about"
  | "gemstones"
  | "buying-guide"
  | "certification-guide";

export interface SeoLandingPageDefinition {
  path: string;
  title: string;
  description: string;
  heading: string;
  introduction: string;
  updatedAt: string;
}

export const seoLandingPages: Record<SeoLandingPageId, SeoLandingPageDefinition> = {
  buy: {
    path: "/buy-gemstones",
    title: "Buy Gemstones Online | Natural Gems for Sale | Gemslanka",
    description: "Browse gemstone listings from Sri Lanka and sellers worldwide, compare disclosed details, and contact sellers directly on Gemslanka.",
    heading: "Buy Gemstones Online with Clear Listing Details",
    introduction: "Discover loose gemstones and natural gem listings from Sri Lanka and sellers worldwide. Compare origin, treatment, certification, price, and seller information before contacting a seller directly.",
    updatedAt: "2026-07-15"
  },
  sell: {
    path: "/sell-gemstones",
    title: "Sell Gemstones Online | List Gems on Gemslanka",
    description: "List gemstones on Gemslanka, present useful gem details, and reach buyers looking for gems from Sri Lanka and around the world.",
    heading: "Sell Gemstones Online to a Global Audience",
    introduction: "Create a clear gemstone listing with photographs, price, origin, treatment, and certificate information. Gemslanka publishes moderated listings and helps interested buyers contact sellers directly.",
    updatedAt: "2026-07-15"
  },
  about: {
    path: "/about-us",
    title: "About Gemslanka | Global Gemstone Listing Marketplace",
    description: "Learn how Gemslanka connects gemstone buyers and sellers through moderated listings while preserving Sri Lanka's gemstone heritage.",
    heading: "A Sri Lankan Gemstone Marketplace with Global Reach",
    introduction: "Gemslanka is an independent gemstone listing marketplace built in Sri Lanka for buyers and sellers worldwide. We make gemstone information easier to compare while keeping negotiation, inspection, payment, and delivery directly between users.",
    updatedAt: "2026-07-15"
  },
  gemstones: {
    path: "/gemstones",
    title: "Gemstone Types and Listings | Gemslanka",
    description: "Explore gemstone types, learn what listing details to compare, and browse current gemstone listings on Gemslanka.",
    heading: "Explore Gemstone Types and Marketplace Listings",
    introduction: "Use this gemstone directory to explore sapphires, rubies, spinels, cat's-eye, moonstones, and many other gem varieties. Each category connects practical buyer guidance with current marketplace listings.",
    updatedAt: "2026-07-15"
  },
  "buying-guide": {
    path: "/guides/buying-gemstones-online",
    title: "Buying Gemstones Online: A Practical Guide | Gemslanka",
    description: "Learn how to compare gemstone listings, ask sellers useful questions, review lab reports, and complete due diligence before buying a gem online.",
    heading: "A Practical Guide to Buying Gemstones Online",
    introduction: "Online gemstone listings can help you compare many stones, but photographs and descriptions are only a starting point. Use a careful process to confirm identity, condition, treatment, value, payment, and delivery before completing a transaction.",
    updatedAt: "2026-07-16"
  },
  "certification-guide": {
    path: "/guides/gemstone-certification-and-treatments",
    title: "Gemstone Certification and Treatments Guide | Gemslanka",
    description: "Understand gemstone lab reports, seller-provided certificates, common treatments, and the questions to ask before contacting a seller.",
    heading: "Gemstone Certification, Lab Reports, and Treatments",
    introduction: "A lab report can describe a gemstone's tested characteristics, while treatment disclosure explains whether its appearance has been altered. Neither a photograph nor a certificate label alone replaces careful verification with the issuing laboratory and qualified professionals.",
    updatedAt: "2026-07-16"
  }
};

export interface SeoLandingLinkContent {
  label: string;
  description: string;
}

export const seoLandingLinkContent: Record<SeoLandingPageId, SeoLandingLinkContent> = {
  buy: { label: "Buy Gemstones", description: "Compare listings with a practical buyer process." },
  sell: { label: "Sell Gemstones", description: "Prepare a clear listing for international buyers." },
  about: { label: "About Us", description: "Understand Gemslanka's listing-only marketplace." },
  gemstones: { label: "Gemstone Types", description: "Explore gemstone categories and current listings." },
  "buying-guide": { label: "Buying Guide", description: "Follow a due-diligence checklist before buying." },
  "certification-guide": { label: "Certification & Treatments", description: "Understand lab reports, treatments, and disclosure." }
};

export interface SeoLandingCrossLinksDefinition {
  cards: readonly [SeoLandingPageId, SeoLandingPageId, SeoLandingPageId];
  inline: { target: SeoLandingPageId; before: string; label: string; after: string };
}

export const seoLandingCrossLinks: Record<SeoLandingPageId, SeoLandingCrossLinksDefinition> = {
  buy: {
    cards: ["gemstones", "certification-guide", "sell"],
    inline: { target: "about", before: "For more context, learn ", label: "how Gemslanka works", after: " before contacting sellers." }
  },
  sell: {
    cards: ["buy", "gemstones", "about"],
    inline: { target: "certification-guide", before: "Before publishing, review ", label: "how treatments and lab reports should be disclosed", after: " in a clear listing." }
  },
  about: {
    cards: ["buy", "sell", "gemstones"],
    inline: { target: "certification-guide", before: "For deeper due diligence, read ", label: "the certification and treatments guide", after: " before evaluating seller claims." }
  },
  gemstones: {
    cards: ["buy", "certification-guide", "about"],
    inline: { target: "sell", before: "Planning to list a stone? Review ", label: "how to create a useful seller listing", after: "." }
  },
  "buying-guide": {
    cards: ["gemstones", "certification-guide", "buy"],
    inline: { target: "about", before: "Learn ", label: "how Gemslanka's listing marketplace works", after: " before contacting a seller." }
  },
  "certification-guide": {
    cards: ["gemstones", "buy", "about"],
    inline: { target: "sell", before: "Sellers can also review ", label: "how to create a clear gemstone listing", after: "." }
  }
};

export const guideSources = {
  "gia-colored-stone-reports": {
    organization: "GIA",
    title: "Sample Colored Stone Reports",
    scope: "What a coloured-stone identification report may describe, including identity, detectable treatments, measurements, colour, and a photograph.",
    url: "https://www.gia.edu/analysis-grading-sample-report-colored-stone?reporttype=colored-stone-identification-report",
    reviewedAt: "2026-07-16"
  },
  "gia-report-check": {
    organization: "GIA",
    title: "Report Check",
    scope: "How report information can be compared with the issuing laboratory's archived record.",
    url: "https://www.gia.edu/gia-website/report-check-landing",
    reviewedAt: "2026-07-16"
  },
  "cibjo-blue-books": {
    organization: "CIBJO",
    title: "The Blue Books",
    scope: "Voluntary international nomenclature and disclosure standards for gemstones and treatments.",
    url: "https://cibjo.org/the-blue-books/",
    reviewedAt: "2026-07-16"
  },
  "ftc-gemstone-buying": {
    organization: "US FTC",
    title: "Buying Gemstones, Diamonds, and Pearls",
    scope: "US consumer guidance on gemstone terminology and treatment disclosures; it is not presented as Sri Lankan or universal law.",
    url: "https://consumer.ftc.gov/articles/buying-gemstones-diamonds-and-pearls",
    reviewedAt: "2026-07-16"
  },
  "ngja-certificate-verification": {
    organization: "Sri Lanka NGJA",
    title: "Gem Lab Certificate Verification",
    scope: "The official NGJA service for checking eligible Sri Lankan gem-testing certificate records.",
    url: "https://gemlab-certificate.ngja.gov.lk/",
    reviewedAt: "2026-07-16"
  },
  "ngja-laboratory-services": {
    organization: "Sri Lanka NGJA",
    title: "Gem Testing Laboratory Certificates",
    scope: "Official information about NGJA gem-testing laboratory certificate services in Sri Lanka.",
    url: "https://ngja.gov.lk/business_services/charges-for-gem-testing-laboratory-certificates-issued-by-ngja/",
    reviewedAt: "2026-07-16"
  }
} as const;

export type GuideSourceId = keyof typeof guideSources;

export const guideSourceIdsByPage = {
  "buying-guide": ["ftc-gemstone-buying", "gia-report-check", "ngja-certificate-verification", "cibjo-blue-books"],
  "certification-guide": ["gia-colored-stone-reports", "gia-report-check", "cibjo-blue-books", "ftc-gemstone-buying", "ngja-certificate-verification", "ngja-laboratory-services"]
} as const satisfies Record<"buying-guide" | "certification-guide", readonly GuideSourceId[]>;

export function seoLandingPageFromPath(pathname: string) {
  return (Object.entries(seoLandingPages) as Array<[SeoLandingPageId, SeoLandingPageDefinition]>)
    .find(([, page]) => page.path === pathname)?.[0];
}

export function gemstoneCategoryPath(slug: string) {
  return `/gemstones/${encodeURIComponent(slug)}`;
}

export function publicListingPhotoPath(listingId: string, order: number, thumbnail = false) {
  const base = `/media/listings/${encodeURIComponent(listingId)}/photos/${Math.max(0, Math.trunc(order))}`;
  return thumbnail ? `${base}/thumbnail.webp` : base;
}

export function descriptiveListingImageAlt(currentAlt: string | undefined, listingTitle: string, gemTypeName?: string) {
  const trimmed = currentAlt?.trim() ?? "";
  const filenameLike = /\.(?:avif|gif|heic|jpe?g|png|webp)$/i.test(trimmed) || /^(?:img|image|photo|screenshot|whatsapp)[-_\s\d]/i.test(trimmed);
  if (trimmed && !filenameLike) return trimmed;
  return `${listingTitle}${gemTypeName ? ` – ${gemTypeName} gemstone` : " – gemstone listing"}`;
}

const priorityGemIntroductions: Partial<Record<(typeof priorityGemSlugs)[number], string>> = {
  sapphire: "Sapphire occurs in many colours, with blue sapphire among the best-known gems associated with Sri Lanka. Review each listing's stated origin, treatment, colour, clarity, dimensions, and laboratory information rather than assuming every sapphire is Ceylon-origin.",
  ruby: "Ruby is the red variety of corundum. Compare colour, transparency, treatment disclosure, inclusions, weight, and any laboratory report when reviewing ruby listings.",
  spinel: "Spinel occurs in vivid red, pink, blue, purple, and other colours and has a long history in Asian gem markets. Check colour, clarity, origin claims, treatment disclosure, and report details for each stone.",
  "cats-eye": "Cat's-eye gemstones display a moving band of light known as chatoyancy. Ask which mineral species the name refers to, then compare the sharpness of the eye, body colour, transparency, treatment, and report details.",
  moonstone: "Moonstone is valued for adularescence, the light that appears to float across the stone. Compare body colour, strength and colour of the effect, transparency, cut, fractures, and stated origin.",
  alexandrite: "Alexandrite is a colour-change variety of chrysoberyl. Assess the colours shown under different lighting, strength of the change, clarity, treatment disclosure, and independent laboratory findings.",
  zircon: "Natural zircon is distinct from synthetic cubic zirconia and occurs in several colours. Confirm the material named in the listing and compare colour, brilliance, heat-treatment disclosure, wear, and report information.",
  garnet: "Garnet is a family of related gemstones available in a broad range of colours. Identify the stated variety where possible and compare colour, clarity, size, treatment disclosure, and laboratory information.",
  tourmaline: "Tourmaline ranges from single-colour stones to bi-colour and multi-colour material. Compare colour zoning, clarity, cut, treatment disclosure, origin claims, and any available report.",
  aquamarine: "Aquamarine is the blue to blue-green variety of beryl. Compare tone, saturation, clarity, cut, weight, treatment disclosure, and any laboratory documentation.",
  emerald: "Emerald is the green variety of beryl and commonly contains visible inclusions. Review colour, clarity, fracture filling or oil disclosure, condition, origin claims, and laboratory details.",
  topaz: "Topaz occurs in several colours, some commonly produced or enhanced by treatment. Compare colour, clarity, durability considerations, treatment disclosure, dimensions, and report information."
};

export function gemstoneCategoryIntroduction(name: string, slug: string) {
  return priorityGemIntroductions[slug as (typeof priorityGemSlugs)[number]]
    ?? `${name} listings on Gemslanka show seller-provided details such as carat weight, colour, shape, treatment, certification status, price, and location. Compare those details and complete independent due diligence before agreeing to a transaction.`;
}
