import type { GemType } from "@gems/schemas";
import type { ReactNode } from "react";
import {
  gemstoneCategoryIntroduction,
  gemstoneCategoryPath,
  guideSourceIdsByPage,
  guideSources,
  priorityGemSlugs,
  seoLandingCrossLinks,
  seoLandingLinkContent,
  seoLandingPages,
  type GuideSourceId,
  type SeoLandingPageId
} from "../../shared/seo.js";

const buyerSteps = [
  ["Compare the disclosed details", "Review carat weight, dimensions, colour, clarity, shape, treatment, origin, certificate status, price, and seller location."],
  ["Ask for current evidence", "Request recent photographs or video, the complete lab report where available, and answers to any missing or inconsistent listing details."],
  ["Verify independently", "Check the report with its issuing laboratory and arrange an inspection or qualified professional opinion when the value or risk justifies it."],
  ["Agree safe transaction terms", "Confirm identity, payment, delivery, insurance, return expectations, and applicable laws directly with the seller before paying."]
] as const;

const sellerSteps = [
  ["Describe the stone accurately", "Use a specific title and disclose weight, measurements, colour, clarity, shape, origin, treatment, certificate status, and material condition."],
  ["Use clear, current photographs", "Show the gemstone from useful angles under honest lighting. Avoid edited images that misrepresent colour, clarity, or condition."],
  ["Support important claims", "Upload relevant laboratory documentation and make it clear which details are seller statements rather than independent findings."],
  ["Respond transparently", "Answer buyer questions, agree inspection and transaction terms directly, and keep the listing current if availability changes."]
] as const;

export function SeoLandingPage({ page, gemTypes }: { page: SeoLandingPageId; gemTypes: GemType[] }) {
  const definition = seoLandingPages[page];
  return (
    <article className="seo-page">
      <header className="seo-hero card card--spacious">
        <h1>{definition.heading}</h1>
        <p>{definition.introduction}</p>
        <div className="seo-actions">
          {page === "sell" ? <a className="primary-action" href="/post">Create a Gem Listing</a> : <a className="primary-action" href="/">Browse Current Listings</a>}
          {page !== "buying-guide" && <a className="seo-secondary-action" href={seoLandingPages["buying-guide"].path}>Read the Buying Guide</a>}
        </div>
      </header>
      {page === "buy" && <StepsSection title="How to assess gemstone listings" steps={buyerSteps} />}
      {page === "sell" && <StepsSection title="How to create a useful gemstone listing" steps={sellerSteps} />}
      {page === "about" && <AboutContent />}
      {page === "buying-guide" && <BuyingGuideContent />}
      {page === "certification-guide" && <CertificationContent />}
      {(page === "gemstones" || page === "buy") && <GemstoneDirectory gemTypes={gemTypes} />}
      {(page === "buying-guide" || page === "certification-guide") && <GuideSources page={page} />}
      <RelatedLandingPages page={page} />
      <MarketplaceNotice />
    </article>
  );
}

export function MarketplaceSeoIntro() {
  return (
    <section className="marketplace-seo-intro card card--spacious" aria-labelledby="marketplace-heading">
      <div>
        <h1 id="marketplace-heading">Buy and Sell Gemstones Worldwide with Gemslanka</h1>
        <p>Browse gemstone listings from Sri Lanka and sellers worldwide. Compare disclosed price, origin, treatment, certification, and seller details before contacting a seller directly.</p>
      </div>
      <nav className="seo-sitelink-grid" aria-label="Gemslanka guides and marketplace information">
        <a className="card card--interactive" href={seoLandingPages.buy.path}><strong>Buy Gemstones</strong><span>Browse with a practical comparison process.</span></a>
        <a className="card card--interactive" href={seoLandingPages.sell.path}><strong>Sell Gemstones</strong><span>Create a clear listing for global buyers.</span></a>
        <a className="card card--interactive" href={seoLandingPages.gemstones.path}><strong>Gemstone Types</strong><span>Explore categories and current listings.</span></a>
        <a className="card card--interactive" href={seoLandingPages.about.path}><strong>About Us</strong><span>Learn how the listing marketplace works.</span></a>
      </nav>
    </section>
  );
}

export function CategorySeoIntro({ gemType }: { gemType: GemType }) {
  return (
    <header className="category-seo-intro card card--spacious">
      <nav className="seo-breadcrumbs" aria-label="Breadcrumb">
        <a href="/">Marketplace</a><span aria-hidden="true">/</span><a href="/gemstones">Gemstones</a><span aria-hidden="true">/</span><span>{gemType.name}</span>
      </nav>
      <h1>Buy {gemType.name} Gemstones Online</h1>
      <p>Compare current {gemType.name.toLowerCase()} listings by disclosed price, carat weight, colour, shape, treatment, certification status, seller, and location. Listing information is provided by sellers and should be verified independently.</p>
      <p>{gemstoneCategoryIntroduction(gemType.name, gemType.slug)}</p>
    </header>
  );
}

function GemstoneDirectory({ gemTypes }: { gemTypes: GemType[] }) {
  const ordered = [...gemTypes].sort((left, right) => {
    const leftPriority = priorityGemSlugs.indexOf(left.slug as (typeof priorityGemSlugs)[number]);
    const rightPriority = priorityGemSlugs.indexOf(right.slug as (typeof priorityGemSlugs)[number]);
    if (leftPriority !== -1 || rightPriority !== -1) return (leftPriority === -1 ? 999 : leftPriority) - (rightPriority === -1 ? 999 : rightPriority);
    return left.name.localeCompare(right.name);
  });
  return (
    <section className="seo-section gemstone-directory-card card card--spacious" aria-labelledby="gemstone-directory-heading">
      <div className="section-heading">
        <h2 id="gemstone-directory-heading">Gemstone types</h2>
        <p>Open a category to see buyer information and current marketplace listings.</p>
      </div>
      <div className="gemstone-directory">
        {ordered.map((gemType) => <a href={gemstoneCategoryPath(gemType.slug)} key={gemType.id}>{gemType.name}</a>)}
      </div>
    </section>
  );
}

function StepsSection({ title, steps }: { title: string; steps: ReadonlyArray<readonly [string, string]> }) {
  return (
    <section className="seo-section" aria-labelledby={`${title.toLowerCase().replace(/[^a-z]+/g, "-")}-heading`}>
      <h2 id={`${title.toLowerCase().replace(/[^a-z]+/g, "-")}-heading`}>{title}</h2>
      <div className="seo-card-grid">
        {steps.map(([heading, copy], index) => <section className="seo-card card" key={heading}><span>{index + 1}</span><h3>{heading}</h3><p>{copy}</p></section>)}
      </div>
    </section>
  );
}

function AboutContent() {
  return (
    <section className="seo-section seo-prose card card--spacious">
      <h2>How the marketplace works</h2>
      <p>Sellers publish individual gemstone listings after platform moderation. Buyers can search and filter those listings, review seller-provided information, and contact the seller. Gemslanka does not take ownership of gemstones or complete the sale.</p>
      <h2>Why Sri Lanka matters</h2>
      <p>Sri Lanka has a long and internationally recognised gemstone tradition. Gemslanka carries that identity while welcoming listings and buyers from around the world, making origin disclosure and careful comparison important on every page.</p>
      <h2>Transparency before transactions</h2>
      <p>Moderation helps enforce marketplace presentation and content rules, but it is not a guarantee of authenticity, ownership, value, legality, treatment status, or seller reliability. Users remain responsible for inspection and transaction due diligence.</p>
    </section>
  );
}

function BuyingGuideContent() {
  return (
    <>
      <StepsSection title="A buyer due-diligence checklist" steps={buyerSteps} />
      <GuideVisualSection
        id="listing-anatomy"
        title="Anatomy of a gemstone listing"
        asset="/assets/guides/listing-anatomy.svg"
        width={1200}
        height={720}
        alt="A fictional blue sapphire listing labelled to show photographs, gemstone details, seller claims, laboratory-report status, price, seller, and location."
        caption="A fictional listing created by Gemslanka for education. It is not an offer for sale and does not represent a real gemstone or seller."
        copy={<>Start by separating what the seller has stated from what independent evidence supports. Photographs can help you compare visible features and condition, but they cannot establish authenticity, origin, value, or treatment status. Consumer terminology and treatment disclosure are also discussed in the <GuideCitation sourceId="ftc-gemstone-buying" /> and <GuideCitation sourceId="cibjo-blue-books" /> references.</>}
        legend={[
          "Photographs: request current views from several angles and under stated lighting.",
          "Identity and measurements: compare the named gem, weight, dimensions, colour, and shape.",
          "Seller statements: treat origin and treatment descriptions as claims to investigate.",
          "Laboratory-report status: request the complete report and verify it with the issuer.",
          "Price: compare only after accounting for differences in size, quality, treatment, and evidence.",
          "Seller and location: confirm identity, possession of the stone, and practical transaction arrangements."
        ]}
      />
      <WorkedSapphireExample />
      <GuideVisualSection
        id="buyer-flow"
        title="Move from comparison to a documented decision"
        asset="/assets/guides/buyer-due-diligence-flow.svg"
        width={1200}
        height={520}
        alt="Five-step buyer flow: compare the listing, request evidence, verify the report, arrange independent inspection when warranted, and agree transaction terms."
        caption="The depth of checking should reflect the value, uncertainty, and risk of the proposed purchase."
        copy={<>Useful evidence can include current photographs from multiple angles, a video that shows the same stone and measurements, the complete laboratory report, a matching record on the issuer's official verification service, and written payment, delivery, insurance, and return terms. GIA and Sri Lanka's NGJA provide official verification services for eligible records: <GuideCitation sourceId="gia-report-check" /> <GuideCitation sourceId="ngja-certificate-verification" />.</>}
        legend={[
          "Compare every material detail and note what is absent or inconsistent.",
          "Request current evidence rather than relying only on an old listing image or cropped report.",
          "Open the issuing laboratory's official website yourself and compare its archived information.",
          "For significant purchases, consider an independent inspection by a qualified professional.",
          "Put payment, delivery, insurance, inspection, and return expectations in writing before paying."
        ]}
      />
    </>
  );
}

function WorkedSapphireExample() {
  const exampleGroups = [
    ["Disclosed by the fictional seller", ["Blue oval sapphire, 3.20 ct", "Seller-stated Sri Lankan origin", "Seller describes the stone as untreated", "A laboratory report is said to be available"]],
    ["Questions the buyer should ask", ["Are the images current and of this exact stone?", "Can the seller provide dimensions, unedited video, and the complete report?", "Which laboratory issued the report, and can its record be checked?", "What inspection, payment, delivery, insurance, and return terms apply?"]],
    ["Details that can be cross-checked", ["Report number, issue date, tested identity, weight, and dimensions", "Treatment findings and any origin opinion stated by the laboratory", "Whether the pictured stone reasonably corresponds with the report photograph", "Seller identity, possession, location, and written transaction terms"]],
    ["Conclusions the listing cannot establish", ["That the stone is authentic or worth the asking price", "That a Sri Lankan origin claim is correct", "That the stone is untreated because treatment is not stated elsewhere", "That the seller owns the stone or that the transaction will be safe"]]
  ] as const;
  return (
    <section className="seo-section guide-example card card--spacious" aria-labelledby="worked-sapphire-heading">
      <div className="section-heading">
        <h2 id="worked-sapphire-heading">Worked example: a fictional sapphire listing</h2>
        <p>The example below demonstrates a review process; it does not assess a real sapphire. “Not stated” must never be read as “untreated.”</p>
      </div>
      <div className="guide-example-grid">
        {exampleGroups.map(([heading, items]) => (
          <section className="guide-example-panel" key={heading}>
            <h3>{heading}</h3>
            <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
        ))}
      </div>
    </section>
  );
}

function CertificationContent() {
  return (
    <>
      <section className="seo-section seo-prose card card--spacious">
        <h2>What a gemstone laboratory report can tell you</h2>
        <p>A coloured-stone identification report may include the tested identity, whether the material is natural or laboratory-grown, detectable treatments, weight, measurements, colour, shape, and a photograph. Some services may offer an origin opinion. Scope and wording differ by laboratory, so read the complete report rather than relying on the word “certified.” <GuideCitation sourceId="gia-colored-stone-reports" /></p>
        <h2>What it cannot guarantee</h2>
        <p>A report describes the specimen submitted for testing within the service's scope. It does not by itself guarantee ownership, present condition, value, seller reliability, or transaction safety. Gemslanka may record that documentation was supplied for a listing, but Gemslanka is not the issuing laboratory and does not guarantee the report or stone.</p>
        <h2>Disclosure matters</h2>
        <p>Treatments may affect appearance, durability, care, and value. CIBJO publishes international industry guidance, while the FTC provides a useful US consumer reference—not Sri Lankan or universal law. <GuideCitation sourceId="cibjo-blue-books" /> <GuideCitation sourceId="ftc-gemstone-buying" /></p>
      </section>
      <GuideVisualSection
        id="report-anatomy"
        title="Read the full report, field by field"
        asset="/assets/guides/report-anatomy.svg"
        width={1200}
        height={720}
        alt="A generic illustrative gemstone report with labels for report number, date, photograph, identity, weight, measurements, colour, treatment findings, and optional origin opinion."
        caption="Illustrative example — not a laboratory report. This original diagram does not imitate or represent GIA, NGJA, or any other laboratory."
        copy={<>Look for the issuer's identity and the precise scope of testing before comparing the report with the offered stone. Sri Lanka's NGJA describes its own gem-testing laboratory certificate services, while GIA publishes examples showing the information included in its coloured-stone reports. <GuideCitation sourceId="ngja-laboratory-services" /> <GuideCitation sourceId="gia-colored-stone-reports" /></>}
        legend={[
          "Report number and date: use the exact identifier when checking the issuer's record.",
          "Photograph: compare it cautiously; colour and scale can vary between images.",
          "Tested identity and status: read the laboratory's exact natural or laboratory-grown wording.",
          "Weight, measurements, colour, and shape: compare these with the offered stone.",
          "Detectable treatments: do not replace a stated finding with a seller's broader description.",
          "Origin opinion: it may be optional, qualified, or unavailable depending on the stone and service."
        ]}
      />
      <TreatmentDisclosureMatrix />
      <MismatchExample />
      <GuideVisualSection
        id="report-verification"
        title="Verify a report on the issuer's official domain"
        asset="/assets/guides/report-verification-flow.svg"
        width={1200}
        height={520}
        alt="Five-step report verification flow: visit the issuer's official domain, enter the report number, compare details, investigate mismatches, and seek independent advice."
        caption="An online match supports comparison with an archived record; it does not prove ownership, value, seller reliability, or transaction safety."
        copy={<>Navigate to the issuing laboratory's official website yourself. Enter the report number and compare identity, weight, measurements, treatment findings, and the photograph where available. GIA Report Check and the NGJA certificate-verification service are examples for eligible records. <GuideCitation sourceId="gia-report-check" /> <GuideCitation sourceId="ngja-certificate-verification" /></>}
        legend={[
          "Use the laboratory's official domain, not an unfamiliar verification link sent by a seller.",
          "Enter the exact report or certificate number and check the date.",
          "Compare identity, weight, measurements, treatments, and photograph where the service displays them.",
          "Pause and investigate any mismatch; do not assume either fraud or authenticity.",
          "Seek independent advice when the value, inconsistency, or uncertainty warrants it."
        ]}
      />
    </>
  );
}

function TreatmentDisclosureMatrix() {
  const treatments = [
    ["Heating", "May alter colour or clarity. Ask whether heating was detected or disclosed and compare the exact report wording.", "Care needs depend on the gem and any additional treatment."],
    ["Diffusion", "Elements may be introduced near or into the surface to create or modify colour.", "Recutting or repolishing can affect some treated colour; seek material-specific advice."],
    ["Filling or oiling", "Fractures or cavities may be filled to improve apparent clarity, as commonly discussed for some emeralds.", "Heat, chemicals, ultrasonic cleaning, or wear may affect fillers; obtain specific care instructions."],
    ["Coating or dyeing", "Surface layers or colourants may change apparent colour or uniformity.", "Abrasion, solvents, heat, or cleaning may damage some coatings or dyes."],
    ["Unknown or unstated", "No useful conclusion follows from silence. “Not stated” does not mean “untreated.”", "Pause and request disclosure or appropriate independent testing before relying on the claim."]
  ] as const;
  return (
    <section className="seo-section guide-matrix" aria-labelledby="treatment-matrix-heading">
      <div className="section-heading">
        <h2 id="treatment-matrix-heading">Treatment-disclosure matrix</h2>
        <p>These examples are comparison prompts, not a substitute for material-specific laboratory findings or professional care advice.</p>
      </div>
      <div className="guide-matrix-grid">
        {treatments.map(([name, disclosure, care]) => (
          <article className="card guide-matrix-card" key={name}>
            <h3>{name}</h3>
            <p><strong>What to clarify:</strong> {disclosure}</p>
            <p><strong>Care consideration:</strong> {care}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function MismatchExample() {
  return (
    <aside className="guide-mismatch card card--callout" aria-labelledby="mismatch-heading">
      <h2 id="mismatch-heading">Fictional mismatch example: pause and clarify</h2>
      <p>A listing describes a <strong>3.20 ct untreated sapphire</strong>, while the supplied report records <strong>3.02 ct and indications of heating</strong>. The different weight could have several explanations, including an incorrect document, a listing error, or later recutting. The treatment wording also conflicts.</p>
      <p>Do not assume fraud, and do not assume the stone is authentic. Ask the seller for the complete current report and measurements, verify the record with the issuer, identify why the details differ, and seek an independent opinion if the purchase still warrants consideration.</p>
    </aside>
  );
}

function GuideVisualSection({ id, title, asset, width, height, alt, caption, copy, legend }: {
  id: string;
  title: string;
  asset: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
  copy: ReactNode;
  legend: readonly string[];
}) {
  return (
    <section className="seo-section guide-visual-section card card--spacious" aria-labelledby={`${id}-heading`}>
      <div className="guide-visual-copy">
        <h2 id={`${id}-heading`}>{title}</h2>
        <p>{copy}</p>
        <ol className="guide-legend">
          {legend.map((item) => <li key={item}>{item}</li>)}
        </ol>
      </div>
      <figure className="guide-figure">
        <div className="guide-figure-scroll" tabIndex={0} aria-label={`Scrollable diagram: ${title}`}>
          <img src={asset} width={width} height={height} loading="lazy" alt={alt} />
        </div>
        <span className="guide-figure-scroll-note">On small screens, scroll horizontally to inspect the diagram.</span>
        <figcaption>{caption}</figcaption>
      </figure>
    </section>
  );
}

function GuideCitation({ sourceId }: { sourceId: GuideSourceId }) {
  const source = guideSources[sourceId];
  return (
    <a className="guide-citation" href={source.url} target="_blank" rel="noopener noreferrer">
      {source.organization}: {source.title}<span className="u-visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}

function GuideSources({ page }: { page: "buying-guide" | "certification-guide" }) {
  return (
    <section className="seo-section guide-sources card card--spacious" aria-labelledby="guide-sources-heading">
      <div className="section-heading">
        <h2 id="guide-sources-heading">Sources and further reading</h2>
        <p>Authoritative references reviewed 16 July 2026. They are informational sources, not endorsements of Gemslanka.</p>
      </div>
      <ol className="guide-source-list">
        {guideSourceIdsByPage[page].map((sourceId) => {
          const source = guideSources[sourceId];
          return (
            <li key={sourceId}>
              <a href={source.url} target="_blank" rel="noopener noreferrer">{source.organization} — {source.title}<span className="u-visually-hidden"> (opens in a new tab)</span></a>
              <p>{source.scope}</p>
              <span>Reviewed {source.reviewedAt}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function RelatedLandingPages({ page }: { page: SeoLandingPageId }) {
  const related = seoLandingCrossLinks[page];
  return (
    <section className="seo-section seo-related-pages" aria-labelledby="continue-exploring-heading">
      <div className="section-heading">
        <h2 id="continue-exploring-heading">Continue exploring</h2>
        <p className="seo-related-inline">
          {related.inline.before}<a href={seoLandingPages[related.inline.target].path}>{related.inline.label}</a>{related.inline.after}
        </p>
      </div>
      <nav className="seo-sitelink-grid seo-related-links-grid" aria-label="Related Gemslanka pages">
        {related.cards.map((target) => {
          const content = seoLandingLinkContent[target];
          return (
            <a className="card card--interactive" href={seoLandingPages[target].path} key={target}>
              <strong>{content.label}</strong>
              <span>{content.description}</span>
            </a>
          );
        })}
      </nav>
    </section>
  );
}

function MarketplaceNotice() {
  return (
    <aside className="seo-marketplace-notice card card--callout">
      <strong>Listing marketplace notice</strong>
      <p>Gemslanka provides listing publication, moderation, discovery, and contact tools. Buyers and sellers arrange inspection, negotiation, payment, delivery, insurance, and any returns directly. Always complete your own due diligence.</p>
      <a href="/terms-and-conditions">Read the Terms and Conditions</a>
    </aside>
  );
}
