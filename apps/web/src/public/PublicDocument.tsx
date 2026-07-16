import type { MarketplacePageData } from "@gems/schemas";
import { CustomerRoot } from "../customer/CustomerRoot.js";
import {
  descriptiveListingImageAlt,
  gemstoneCategoryIntroduction,
  gemstoneCategoryPath,
  publicListingPhotoPath,
  seoLandingPages
} from "../shared/seo.js";
import type { PublicRenderPayload, PublicRouteData } from "./types.js";
export type { PublicRenderPayload, PublicRouteData } from "./types.js";

export interface PublicDocumentProps extends PublicRenderPayload {
  serializedState: string;
}

const analyticsMeasurementId = "G-PBC7B30RE3";
const adsensePublisherId = "ca-pub-1870465390690184";
const defaultSocialImagePath = "/assets/gem-triptych.png";

export function PublicDocument(props: PublicDocumentProps) {
  const metadata = metadataFor(props);
  return (
    <html lang="en" data-theme={props.theme}>
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="description" content={metadata.description} />
        <meta name="robots" content={metadata.robots} />
        {props.verification?.google && <meta name="google-site-verification" content={props.verification.google} />}
        {props.verification?.bing && <meta name="msvalidate.01" content={props.verification.bing} />}
        <meta name="theme-color" content="#fdd404" />
        <meta name="application-name" content="Gemslanka" />
        <meta name="google-adsense-account" content={adsensePublisherId} />
        <meta property="og:site_name" content="Gemslanka" />
        <meta property="og:title" content={metadata.title} />
        <meta property="og:description" content={metadata.description} />
        <meta property="og:type" content={props.route.kind === "listing" ? "product" : "website"} />
        <meta property="og:url" content={metadata.canonical} />
        <meta property="og:image" content={metadata.image} />
        <meta property="og:image:alt" content={metadata.imageAlt} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={metadata.title} />
        <meta name="twitter:description" content={metadata.description} />
        <meta name="twitter:image" content={metadata.image} />
        <meta name="twitter:image:alt" content={metadata.imageAlt} />
        <link rel="canonical" href={metadata.canonical} />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-rounded-32.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/assets/logo-mark-rounded-192.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon-rounded.png" />
        <link rel="manifest" href="/site.webmanifest" crossOrigin="use-credentials" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700;800&display=swap" rel="stylesheet" />
        {props.assets.stylesheets.map((href) => <link key={href} rel="stylesheet" href={href} />)}
        {props.assets.modulePreloads.map((href) => <link key={href} rel="modulepreload" href={href} />)}
        {props.assets.reactRefreshPreamble && <script type="module" dangerouslySetInnerHTML={{ __html: reactRefreshPreamble }} />}
        <title>{metadata.title}</title>
        <script async src={`https://www.googletagmanager.com/gtag/js?id=${analyticsMeasurementId}`} />
        <script dangerouslySetInnerHTML={{ __html: googleTagBootstrap }} />
        <script async src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsensePublisherId}`} crossOrigin="anonymous" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: metadata.structuredData }} />
      </head>
      <body>
        <div id="public-root"><PublicApp initialUrl={props.url} initialRoute={props.route} initialTheme={props.theme} year={props.year} /></div>
        <script id="__PUBLIC_STATE__" type="application/json" dangerouslySetInnerHTML={{ __html: props.serializedState }} />
        <script type="module" src={props.assets.clientEntry} />
      </body>
    </html>
  );
}

const reactRefreshPreamble = `
import RefreshRuntime from "/@react-refresh";
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
window.__vite_plugin_react_preamble_installed__ = true;
`;

const googleTagBootstrap = `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${analyticsMeasurementId}');
`;

export function PublicApp({ initialRoute, initialTheme }: { initialUrl: string; initialRoute: PublicRouteData; initialTheme: "light" | "dark"; year: number }) {
  return <CustomerRoot initialPublicRoute={initialRoute} initialTheme={initialTheme} />;
}

function marketplaceHref(filters: MarketplacePageData["filters"], basePath = "/", lockedGemType?: string) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.gemType && filters.gemType !== lockedGemType) params.set("gemType", filters.gemType);
  for (const location of filters.locations) params.append("location", location);
  if (filters.treatment) params.set("treatment", filters.treatment);
  if (filters.certificate) params.set("certificate", filters.certificate);
  if (filters.sort !== "featured") params.set("sort", filters.sort);
  if (filters.page !== 1) params.set("page", String(filters.page));
  if (filters.limit !== 20) params.set("limit", String(filters.limit));
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function metadataFor(props: PublicRenderPayload) {
  const fallbackDescription = "Browse gemstone listings from Sri Lanka and sellers worldwide, compare disclosed details, and contact sellers directly on Gemslanka.";
  let title = "Gemslanka | Buy and Sell Gemstones Worldwide";
  let description = fallbackDescription;
  let robots = "index,follow,max-image-preview:large";
  let image = new URL(defaultSocialImagePath, props.origin).href;
  let imageAlt = "Gemstones listed on the Gemslanka marketplace";
  const current = new URL(props.url, props.origin);
  let canonicalPath = current.pathname.replace(/\/+$/, "") || "/";
  if (props.route.kind === "marketplace") {
    const filters = props.route.data.filters;
    const indexable = !filters.q && !filters.gemType && !filters.locations.length && !filters.treatment && !filters.certificate && filters.sort === "featured" && !current.searchParams.has("limit");
    if (!indexable) robots = "noindex,follow";
    canonicalPath = marketplaceHref({ ...filters, limit: 20 });
    if (filters.page > 1) {
      title = `Gemstone Marketplace – Page ${filters.page} | Gemslanka`;
      description = `Browse page ${filters.page} of current gemstone listings from sellers on Gemslanka.`;
    }
  } else if (props.route.kind === "category") {
    const filters = props.route.data.filters;
    const indexableFilters = !filters.q && !filters.locations.length && !filters.treatment && !filters.certificate && filters.sort === "featured" && !current.searchParams.has("limit");
    if (!props.route.indexable || !indexableFilters) robots = "noindex,follow";
    canonicalPath = marketplaceHref({ ...filters, gemType: props.route.gemType.id, limit: 20 }, gemstoneCategoryPath(props.route.gemType.slug), props.route.gemType.id);
    title = `Buy ${props.route.gemType.name} Gemstones Online${filters.page > 1 ? ` – Page ${filters.page}` : ""} | Gemslanka`;
    description = filters.page > 1
      ? `Browse page ${filters.page} of ${props.route.gemType.name.toLowerCase()} gemstone listings on Gemslanka.`
      : `${gemstoneCategoryIntroduction(props.route.gemType.name, props.route.gemType.slug).slice(0, 154).trimEnd()}`;
  } else if (props.route.kind === "landing") {
    const definition = seoLandingPages[props.route.page];
    title = definition.title;
    description = definition.description;
    canonicalPath = definition.path;
  } else if (props.route.kind === "listing") {
    title = `${props.route.listing.title} | Gemslanka`;
    description = props.route.listing.description.trim().slice(0, 160) || `${props.route.listing.title}, a gemstone listing available from a seller on Gemslanka.`;
    const listingImage = props.route.listing.media
      .filter((media) => media.kind === "photo")
      .sort((left, right) => left.order - right.order)[0];
    if (listingImage) {
      image = new URL(publicListingPhotoPath(props.route.listing.id, listingImage.order, true), props.origin).href;
      imageAlt = descriptiveListingImageAlt(listingImage.alt, props.route.listing.title, humanizeGemType(props.route.listing.gemTypeId));
    }
  } else if (props.route.kind === "content") {
    const labels = { contact: "Contact Gemslanka", terms: "Terms and Conditions", privacy: "Privacy Policy", refund: "Refund Policy" };
    title = `${labels[props.route.page]} | Gemslanka`;
    description = props.route.page === "contact"
      ? "Contact Gemslanka for support with gemstone listings, marketplace accounts, and listing services."
      : `${labels[props.route.page]} for the Gemslanka gemstone listing marketplace.`;
    if (props.route.page !== "contact") robots = "noindex,follow";
  } else {
    title = `${props.route.status} | Gemslanka`;
    robots = "noindex,follow";
  }
  const canonical = new URL(canonicalPath, props.origin).href;
  const structuredData = JSON.stringify(structuredDataFor(props, { canonical, description, image })).replaceAll("<", "\\u003c");
  return { title, description, robots, canonical, image, imageAlt, structuredData };
}

function structuredDataFor(props: PublicRenderPayload, metadata: { canonical: string; description: string; image: string }) {
  const organization = {
    "@type": "Organization",
    "@id": `${props.origin}/#organization`,
    name: "Gemslanka",
    alternateName: ["Gemslanka.lk", "Gems Lanka"],
    legalName: "KRISTIANA MAGRET GEM & JEWELLERY",
    url: `${props.origin}/`,
    logo: new URL("/assets/logo-mark-512.png", props.origin).href,
    email: "info@gemslanka.lk"
  };

  if (props.route.kind === "listing") {
    const firstPhoto = props.route.listing.media
      .filter((media) => media.kind === "photo")
      .sort((left, right) => left.order - right.order)[0];
    const productImage = firstPhoto
      ? new URL(publicListingPhotoPath(props.route.listing.id, firstPhoto.order), props.origin).href
      : metadata.image;
    return {
      "@context": "https://schema.org",
      "@graph": [
        organization,
        {
          "@type": "Product",
          "@id": `${metadata.canonical}#product`,
          name: props.route.listing.title,
          sku: props.route.listing.id,
          description: metadata.description,
          image: [productImage],
          url: metadata.canonical,
          category: `${humanizeGemType(props.route.listing.gemTypeId)} gemstone`,
          offers: {
            "@type": "Offer",
            priceCurrency: "LKR",
            price: props.route.listing.priceLkr,
            availability: "https://schema.org/InStock",
            url: metadata.canonical,
            seller: {
              "@type": props.route.seller.businessName ? "Organization" : "Person",
              name: props.route.seller.businessName ?? props.route.seller.displayName
            }
          }
        },
        breadcrumbData(props.origin, [
          ["Marketplace", "/"],
          [humanizeGemType(props.route.listing.gemTypeId), gemstoneCategoryPath(props.route.listing.gemTypeId)],
          [props.route.listing.title, new URL(props.url, props.origin).pathname]
        ])
      ]
    };
  }

  if (props.route.kind === "marketplace") {
    return {
      "@context": "https://schema.org",
      "@graph": [
        organization,
        {
          "@type": "WebSite",
          "@id": `${props.origin}/#website`,
          url: `${props.origin}/`,
          name: "Gemslanka",
          alternateName: ["Gemslanka.lk", "Gems Lanka"],
          description: metadata.description,
          publisher: { "@id": organization["@id"] },
          inLanguage: "en"
        }
      ]
    };
  }

  if (props.route.kind === "category") {
    const categoryPath = gemstoneCategoryPath(props.route.gemType.slug);
    const categoryData = props.route.data;
    return {
      "@context": "https://schema.org",
      "@graph": [
        organization,
        {
          "@type": "CollectionPage",
          "@id": metadata.canonical,
          url: metadata.canonical,
          name: `Buy ${props.route.gemType.name} Gemstones Online`,
          description: metadata.description,
          isPartOf: { "@id": `${props.origin}/#website` },
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: categoryData.page.total,
            itemListElement: categoryData.page.items.map((item, index) => ({
              "@type": "ListItem",
              position: (categoryData.page.page - 1) * categoryData.page.limit + index + 1,
              url: new URL(`/listings/${encodeURIComponent(item.id)}`, props.origin).href,
              name: item.title
            }))
          },
          inLanguage: "en"
        },
        breadcrumbData(props.origin, [["Marketplace", "/"], ["Gemstones", "/gemstones"], [props.route.gemType.name, categoryPath]])
      ]
    };
  }

  if (props.route.kind === "landing") {
    const definition = seoLandingPages[props.route.page];
    const pageType = props.route.page === "about" ? "AboutPage" : props.route.page === "buy" || props.route.page === "gemstones" ? "CollectionPage" : "WebPage";
    return {
      "@context": "https://schema.org",
      "@graph": [
        organization,
        {
          "@type": pageType,
          "@id": metadata.canonical,
          url: metadata.canonical,
          name: definition.heading,
          description: metadata.description,
          isPartOf: { "@id": `${props.origin}/#website` },
          publisher: { "@id": organization["@id"] },
          inLanguage: "en"
        },
        breadcrumbData(props.origin, [["Marketplace", "/"], [definition.heading, definition.path]])
      ]
    };
  }

  return {
    "@context": "https://schema.org",
    "@graph": [
      organization,
      {
        "@type": props.route.kind === "content" && props.route.page === "contact" ? "ContactPage" : "WebPage",
        "@id": metadata.canonical,
        url: metadata.canonical,
        name: props.route.kind === "content" ? `${props.route.page} | Gemslanka` : "Gemslanka",
        description: metadata.description,
        publisher: { "@id": organization["@id"] },
        inLanguage: "en"
      }
    ]
  };
}

function breadcrumbData(origin: string, items: Array<[name: string, path: string]>) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map(([name, path], index) => ({
      "@type": "ListItem",
      position: index + 1,
      name,
      item: new URL(path, origin).href
    }))
  };
}

function humanizeGemType(value: string) {
  return value.split("-").map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : part).join(" ");
}
