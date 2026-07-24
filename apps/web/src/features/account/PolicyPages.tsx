import type { MerchantDisclosure } from "@gems/schemas";

export function ContactUs({ disclosure }: { disclosure?: MerchantDisclosure }) {
  return (
    <section className="policy-page">
      <div className="section-heading">
        <h1>Contact Us</h1>
      </div>
      <div className="data-panel policy-content contact-disclosure card card--spacious">
        {disclosure ? (
          <div className="contact-detail-grid">
            <ContactDetail label="Merchant name" value={disclosure.merchantName} />
            <ContactDetail label="Email" value={disclosure.email} />
            <ContactDetail label="Licence number" value={disclosure.licenceNumber} />
          </div>
        ) : (
          <p>Loading merchant details...</p>
        )}
      </div>
    </section>
  );
}

export function TermsAndConditions() {
  return (
    <section className="policy-page">
      <div className="section-heading">
        <h1>Terms and Conditions</h1>
        <p>Effective June 11, 2026. These terms apply to gemslanka.lk listing services.</p>
      </div>
      <div className="data-panel policy-content card card--spacious">
        <PolicySection title="Listing-only service">
          gemslanka.lk provides listing publication, seller visibility, contact tools, and moderation workflows only. We do not sell, buy, broker, inspect, transport, insure, or guarantee gemstones.
        </PolicySection>
        <PolicySection title="No responsibility for gem transactions">
          Any selling, purchasing, negotiation, inspection, payment, delivery, refund, or dispute between buyers and sellers happens outside gemslanka.lk. Users are responsible for their own due diligence before any transaction.
        </PolicySection>
        <PolicySection title="Seller responsibilities">
          Sellers must provide accurate listing details, clear photos, truthful treatment and certificate information, and must not post fake, misleading, illegal, duplicate, or abusive content.
        </PolicySection>
        <PolicySection title="Verification limits">
          Listing verification is a platform review step and does not guarantee gemstone authenticity, value, ownership, legality, treatment status, certification, seller reliability, or buyer suitability.
        </PolicySection>
        <PolicySection title="Free trial">
          New user accounts receive a free listing trial for 14 days from account creation unless gemslanka.lk extends or terminates the trial. During an active trial, eligible sellers may submit listings without payment. Trial listings expire when the trial ends unless converted to a paid subscription. We may terminate trial access immediately for abuse, marketplace risk, or policy violations.
        </PolicySection>
        <PolicySection title="Subscriptions and renewal">
          Each paid listing uses its own subscription plan. Basic is valid for 1 month, Pro for 2 months, and Plus for 3 months. Paid subscriptions automatically renew unless cancelled before the next renewal. Trial access is not a paid subscription and does not renew automatically. Expired trial, unpaid, or expired paid listings become inactive and are removed from public browsing until renewed or converted to paid access.
        </PolicySection>
        <PolicySection title="No refunds">
          All paid listing subscriptions, renewals, and extra-photo fees are non-refundable, including rejected listings, cancelled renewals, expired listings, duplicate submissions, or seller withdrawal. Free trial access has no cash value and cannot be redeemed, transferred, or refunded.
        </PolicySection>
        <PolicySection title="Account actions">
          We may reject, remove, expire, or suspend listings and accounts that violate these terms, create marketplace risk, or misuse the service.
        </PolicySection>
      </div>
    </section>
  );
}

export function PrivacyPolicy() {
  return (
    <section className="policy-page">
      <div className="section-heading">
        <h1>Privacy Policy</h1>
        <p>Effective June 11, 2026. This policy explains how gemslanka.lk handles user, listing, and advertising data.</p>
      </div>
      <div className="data-panel policy-content card card--spacious">
        <PolicySection title="Information we collect">
          We collect account details, contact details, profile settings, listing descriptions, uploaded media, certificates, reports, moderation records, trial status and dates, subscription selections, and payment metadata.
        </PolicySection>
        <PolicySection title="Payments">
          Our payment provider processes payment details. gemslanka.lk stores payment references, amount, currency, status, listing, subscription plan, policy acceptance version, and timestamps, but does not store card credentials.
        </PolicySection>
        <PolicySection title="How data is used">
          We use data to operate accounts, publish listings, moderate content, manage free trials, process listing subscriptions, prevent abuse, respond to reports, provide support, and maintain legal or audit records.
        </PolicySection>
        <PolicySection title="Cookies and local storage">
          The site uses cookies and local storage for authentication, theme preferences, session continuity, security, site analytics, and marketplace functionality.
        </PolicySection>
        <PolicySection title="Google AdSense and third-party advertising cookies">
          Third-party vendors, including Google, use cookies to serve ads based on a user's prior visits to gemslanka.lk or other websites. Google's use of advertising cookies enables it and its partners to serve ads to users based on their visit to our site and/or other sites on the Internet. Users may opt out of personalized advertising by visiting <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer">Google Ads Settings</a> or by visiting <a href="https://www.aboutads.info" target="_blank" rel="noopener noreferrer">www.aboutads.info</a>.
        </PolicySection>
        <PolicySection title="Retention and security">
          We retain records as needed for operations, moderation, security, legal compliance, and payment audits. We use reasonable safeguards, but no online service can guarantee absolute security.
        </PolicySection>
        <PolicySection title="User choices">
          Users can update account information, manage cookie consent preferences, cancel listing auto-renewal, request support, and ask about personal data associated with their account.
        </PolicySection>
      </div>
    </section>
  );
}

export function RefundPolicy() {
  return (
    <section className="policy-page">
      <div className="section-heading">
        <h1>Refund Policy</h1>
        <p>Effective June 11, 2026. This policy applies to gemslanka.lk listing subscriptions, renewals, and extra-photo fees.</p>
      </div>
      <div className="data-panel policy-content card card--spacious">
        <PolicySection title="No refunds">
          No refunds. gemslanka.lk paid listing subscriptions, renewals, and extra-photo fees are non-refundable. Free trial access has no cash value and is not refundable or redeemable.
        </PolicySection>
        <PolicySection title="Covered situations">
          This no-refund policy applies to rejected listings, cancelled renewals, expired listings, duplicate submissions, seller withdrawal, and any buyer/seller transaction outcome outside the platform.
        </PolicySection>
        <PolicySection title="Auto-renewal cancellation">
          Cancelling auto-renewal stops future renewal charges only. It does not refund the current listing validity period or any previously paid fees.
        </PolicySection>
      </div>
    </section>
  );
}

function ContactDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="contact-detail">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PolicySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="policy-section">
      <h2>{title}</h2>
      <p>{children}</p>
    </section>
  );
}
