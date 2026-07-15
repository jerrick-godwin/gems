import type { MarketplacePageData } from "@gems/schemas";
import { MarketplaceRoute } from "../features/marketplace/MarketplaceRoute.js";
import type { PublicRenderPayload, PublicRouteData } from "./types.js";
export type { PublicRenderPayload, PublicRouteData } from "./types.js";

export interface PublicDocumentProps extends PublicRenderPayload {
  serializedState: string;
}

export function PublicDocument(props: PublicDocumentProps) {
  const metadata = metadataFor(props);
  return (
    <html lang="en" data-theme={props.theme}>
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="description" content={metadata.description} />
        <meta name="robots" content={metadata.robots} />
        <meta name="theme-color" content="#fdd404" />
        <meta property="og:site_name" content="Gemslanka" />
        <meta property="og:title" content={metadata.title} />
        <meta property="og:description" content={metadata.description} />
        <meta property="og:type" content={props.route.kind === "listing" ? "product" : "website"} />
        <meta property="og:url" content={metadata.canonical} />
        <link rel="canonical" href={metadata.canonical} />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700;800&display=swap" rel="stylesheet" />
        {props.assets.stylesheets.map((href) => <link key={href} rel="stylesheet" href={href} />)}
        {props.assets.modulePreloads.map((href) => <link key={href} rel="modulepreload" href={href} />)}
        {props.assets.reactRefreshPreamble && <script type="module" dangerouslySetInnerHTML={{ __html: reactRefreshPreamble }} />}
        <title>{metadata.title}</title>
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

function metadataFor(props: PublicRenderPayload) {
  const fallbackDescription = "Browse verified gemstone listings from sellers across Sri Lanka on Gemslanka.";
  let title = "Gemslanka | Sri Lankan Gemstone Marketplace";
  let description = fallbackDescription;
  let robots = "index,follow";
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
  } else if (props.route.kind === "content") {
    const labels = { contact: "Contact Gemslanka", terms: "Terms and Conditions", privacy: "Privacy Policy", refund: "Refund Policy" };
    title = `${labels[props.route.page]} | Gemslanka`;
  } else {
    title = `${props.route.status} | Gemslanka`;
    robots = "noindex,follow";
  }
  const canonical = `${props.origin}${canonicalPath}`;
  const structuredData = JSON.stringify({ "@context": "https://schema.org", "@type": props.route.kind === "listing" ? "Product" : "WebSite", name: props.route.kind === "listing" ? props.route.listing.title : "Gemslanka", url: canonical }).replaceAll("<", "\\u003c");
  return { title, description, robots, canonical, structuredData };
}
