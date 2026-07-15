import type { MarketplacePageData } from "@gems/schemas";
import { MarketplaceRoute } from "../features/marketplace/MarketplaceRoute.js";
import type { PublicRenderPayload, PublicRouteData } from "./types.js";
export type { PublicRenderPayload, PublicRouteData } from "./types.js";

export interface PublicDocumentProps extends PublicRenderPayload {
  serializedState: string;
}

const analyticsMeasurementId = "G-PBC7B30RE3";
const adsensePublisherId = "ca-pub-1870465390690184";
const defaultSocialImagePath = "/assets/gem-triptych.png";
const defaultKeywords = "gems, lanka, ceylon gems, ceylon gemstones, sri lanka gems, sri lankan gems, sri lankan gemstones, gemstones sri lanka, ceylon sapphire, sri lankan gemstone marketplace, buy gems sri lanka, sell gems sri lanka";

export function PublicDocument(props: PublicDocumentProps) {
  const metadata = metadataFor(props);
  return (
    <html lang="en" data-theme={props.theme}>
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="description" content={metadata.description} />
        <meta name="keywords" content={defaultKeywords} />
        <meta name="robots" content={metadata.robots} />
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
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/assets/logo-mark-192.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
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
  return <MarketplaceRoute initialRoute={initialRoute} initialTheme={initialTheme} />;
}

function marketplaceHref(filters: MarketplacePageData["filters"]) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.gemType) params.set("gemType", filters.gemType);
  for (const location of filters.locations) params.append("location", location);
  if (filters.treatment) params.set("treatment", filters.treatment);
  if (filters.certificate) params.set("certificate", filters.certificate);
  if (filters.sort !== "featured") params.set("sort", filters.sort);
  if (filters.page !== 1) params.set("page", String(filters.page));
  if (filters.limit !== 20) params.set("limit", String(filters.limit));
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

export function metadataFor(props: PublicRenderPayload) {
  const fallbackDescription = "Browse verified gemstone listings from sellers across Sri Lanka on Gemslanka.";
  let title = "Gemslanka | Sri Lankan Gemstone Marketplace";
  let description = fallbackDescription;
  let robots = "index,follow";
  let image = new URL(defaultSocialImagePath, props.origin).href;
  let imageAlt = "Sri Lankan gemstones listed on Gemslanka";
  const current = new URL(props.url, props.origin);
  let canonicalPath = current.pathname;
  if (props.route.kind === "marketplace") {
    const filters = props.route.data.filters;
    const indexable = !filters.q && !filters.gemType && !filters.locations.length && !filters.treatment && !filters.certificate && filters.sort === "featured" && filters.limit === 20;
    if (!indexable) robots = "noindex,follow";
    canonicalPath = marketplaceHref({ ...filters, limit: 20 });
    if (filters.page > 1) title = `Gemstone listings – page ${filters.page} | Gemslanka`;
  } else if (props.route.kind === "listing") {
    title = `${props.route.listing.title} | Gemslanka`;
    description = props.route.listing.description.slice(0, 160);
    const listingImage = props.route.listing.media
      .filter((media) => media.kind === "photo")
      .sort((left, right) => left.order - right.order)[0];
    if (listingImage) {
      image = new URL(listingImage.thumbnailUrl ?? listingImage.url, props.origin).href;
      imageAlt = listingImage.alt || props.route.listing.title;
    }
  } else if (props.route.kind === "content") {
    const labels = { contact: "Contact Gemslanka", terms: "Terms and Conditions", privacy: "Privacy Policy", refund: "Refund Policy" };
    title = `${labels[props.route.page]} | Gemslanka`;
  } else {
    title = `${props.route.status} | Gemslanka`;
    robots = "noindex,follow";
  }
  const canonical = `${props.origin}${canonicalPath}`;
  const structuredData = JSON.stringify(structuredDataFor(props, { canonical, description, image })).replaceAll("<", "\\u003c");
  return { title, description, robots, canonical, image, imageAlt, structuredData };
}

function structuredDataFor(props: PublicRenderPayload, metadata: { canonical: string; description: string; image: string }) {
  const organization = {
    "@type": "Organization",
    "@id": `${props.origin}/#organization`,
    name: "Gemslanka",
    alternateName: ["Gemslanka.lk", "gems lanka", "ceylon gems", "sri lanka gems"],
    url: `${props.origin}/`,
    logo: new URL("/assets/logo-mark-512.png", props.origin).href
  };

  if (props.route.kind === "listing") {
    return {
      "@context": "https://schema.org",
      "@type": "Product",
      name: props.route.listing.title,
      description: metadata.description,
      image: [metadata.image],
      url: metadata.canonical,
      category: "Gemstone",
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
    };
  }

  return {
    "@context": "https://schema.org",
    "@graph": [
      organization,
      {
        "@type": props.route.kind === "content" ? "WebPage" : "WebSite",
        "@id": props.route.kind === "content" ? metadata.canonical : `${props.origin}/#website`,
        url: metadata.canonical,
        name: "Gemslanka",
        description: metadata.description,
        publisher: { "@id": organization["@id"] },
        inLanguage: "en"
      }
    ]
  };
}
