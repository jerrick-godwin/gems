const merchantDisclosure = {
  merchantName: "KRISTIANA MAGRET GEM & JEWELLARY",
  email: "info@gemslanka.lk",
  address: "No 31/24 Grandpass Road, Colombo 14, Sri Lanka",
  licenceNumber: "20266DL39394"
};

export function ContactUs() {
  return (
    <section className="policy-page">
      <div className="section-heading">
        <h1>Contact Us</h1>
        <p>Merchant and licence details for gemslanka.lk.</p>
      </div>
      <div className="data-panel policy-content contact-disclosure">
        <div className="contact-detail-grid">
          <ContactDetail label="Merchant name" value={merchantDisclosure.merchantName} />
          <ContactDetail label="Email" value={merchantDisclosure.email} />
          <ContactDetail label="Contact address" value={merchantDisclosure.address} />
          <ContactDetail label="Licence number" value={merchantDisclosure.licenceNumber} />
        </div>
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
      <div className="data-panel policy-content">
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
        <PolicySection title="Subscriptions and renewal">
          Each listing uses its own subscription plan. Basic is valid for 1 month, Pro for 2 months, and Plus for 3 months. Subscriptions automatically renew unless cancelled before the next renewal. Expired or unpaid listings become inactive and are removed from public browsing until renewed.
        </PolicySection>
        <PolicySection title="No refunds">
          All listing subscriptions, renewals, and extra-photo fees are non-refundable, including rejected listings, cancelled renewals, expired listings, duplicate submissions, or seller withdrawal.
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
        <p>Effective June 11, 2026. This policy explains how gemslanka.lk handles user and listing data.</p>
      </div>
      <div className="data-panel policy-content">
        <PolicySection title="Information we collect">
          We collect account details, contact details, profile settings, listing descriptions, uploaded media, certificates, reports, moderation records, subscription selections, and payment metadata.
        </PolicySection>
        <PolicySection title="Payments">
          Webxpay processes payment details. gemslanka.lk stores payment references, amount, currency, status, listing, subscription plan, policy acceptance version, and timestamps, but does not store card credentials.
        </PolicySection>
        <PolicySection title="How data is used">
          We use data to operate accounts, publish listings, moderate content, process listing subscriptions, prevent abuse, respond to reports, provide support, and maintain legal or audit records.
        </PolicySection>
        <PolicySection title="Cookies and local storage">
          The site may use cookies or local storage for authentication, theme preferences, session continuity, security, and marketplace functionality.
        </PolicySection>
        <PolicySection title="Retention and security">
          We retain records as needed for operations, moderation, security, legal compliance, and payment audits. We use reasonable safeguards, but no online service can guarantee absolute security.
        </PolicySection>
        <PolicySection title="User choices">
          Users can update account information, cancel listing auto-renewal, request support, and ask about personal data associated with their account.
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
      <div className="data-panel policy-content">
        <PolicySection title="No refunds">
          No refunds. gemslanka.lk listing subscriptions, renewals, and extra-photo fees are non-refundable.
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

function PolicySection({ title, children }: { title: string; children: string }) {
  return (
    <section className="policy-section">
      <h2>{title}</h2>
      <p>{children}</p>
    </section>
  );
}
