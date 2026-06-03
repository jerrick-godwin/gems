import { Landmark, Printer } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { formatLkr, type Cart, type CheckoutDetails, type CheckoutRequest, type Order, type UserDashboard } from "@gems/schemas";
import type { View } from "../../shared/types";
import { AddressBlock, OrderSummaryItem } from "../../shared/checkout";

export function CheckoutView({
  cart,
  profile,
  setView,
  checkout
}: {
  cart: Cart | null;
  profile?: UserDashboard["user"];
  setView: (v: View) => void;
  checkout: (request: CheckoutRequest) => Promise<Order>;
}) {
  const items = cart?.items ?? [];
  const total = items.reduce((sum, item) => sum + (item.listing?.priceLkr ?? 0) * item.quantity, 0);
  const [status, setStatus] = useState<string | null>(null);
  const [placedOrder, setPlacedOrder] = useState<Order | null>(null);
  const [sameAsBilling, setSameAsBilling] = useState(true);
  const [billingDetails, setBillingDetails] = useState<CheckoutDetails>(() => defaultCheckoutDetails(profile));
  const [deliveryDetails, setDeliveryDetails] = useState<CheckoutDetails>(() => defaultCheckoutDetails(profile));

  useEffect(() => {
    const defaults = defaultCheckoutDetails(profile);
    setBillingDetails((current) => current.fullName || current.email || current.mobile ? current : defaults);
    setDeliveryDetails((current) => current.fullName || current.email || current.mobile ? current : defaults);
  }, [profile]);

  const activeDeliveryDetails = sameAsBilling ? billingDetails : deliveryDetails;
  const placeOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("Placing order...");
    try {
      const order = await checkout({
        billingDetails,
        deliveryDetails: activeDeliveryDetails,
        paymentMethod: "direct_bank_transfer",
        customerNote: (event.currentTarget.elements.namedItem("customerNote") as HTMLTextAreaElement | null)?.value
      });
      setPlacedOrder(order);
      setStatus(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to place order.");
    }
  };

  if (placedOrder) {
    return (
      <section className="dashboard checkout-page">
        <div className="section-heading checkout-heading">
          <h1>Invoice generated</h1>
          <p>Your order has been placed. Admin will contact you by mobile or email to arrange direct bank transfer.</p>
        </div>
        <section className="invoice-panel data-panel">
          <div className="invoice-header">
            <div>
              <span className="eyebrow">Invoice</span>
              <h2>{placedOrder.invoiceNumber}</h2>
              <p>Payment method: Direct bank transfer</p>
            </div>
            <button type="button" className="primary-action print-action" onClick={() => window.print()}>
              <Printer size={18} />
              Print invoice
            </button>
          </div>
          <div className="invoice-meta">
            <AddressBlock title="Billing details" details={placedOrder.billingDetails} />
            <AddressBlock title="Delivery details" details={placedOrder.deliveryDetails} />
          </div>
          <div className="checkout-summary-list invoice-items">
            {placedOrder.items.map((item) => (
              <OrderSummaryItem
                key={item.id}
                title={item.titleSnapshot}
                imageUrl={item.imageUrlSnapshot}
                summary={item.productSummary}
                quantity={item.quantity}
                unitPrice={item.unitPriceLkr}
              />
            ))}
          </div>
          <div className="checkout-total-row">
            <span>Total</span>
            <strong>{formatLkr(placedOrder.totalLkr)}</strong>
          </div>
          <div className="checkout-actions">
            <button type="button" className="secondary-action" onClick={() => setView("dashboard")}>
              View dashboard
            </button>
            <button type="button" className="secondary-action" onClick={() => setView("market")}>
              Return to Market
            </button>
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="dashboard checkout-page">
      <div className="section-heading checkout-heading">
        <h1>Checkout</h1>
        <p>Place your order and the admin team will contact you to complete direct bank transfer.</p>
      </div>
      {items.length === 0 ? (
        <div className="empty-results">
          <h2>No items in checkout</h2>
          <p>Return to the marketplace to add gems before placing an order.</p>
          <button type="button" className="primary-action" onClick={() => setView("market")}>Return to Market</button>
        </div>
      ) : (
        <form className="checkout-grid" onSubmit={placeOrder}>
          <div className="checkout-form-stack">
            <section className="data-panel checkout-panel">
              <h2>Billing details</h2>
              <CheckoutDetailsFields details={billingDetails} setDetails={setBillingDetails} prefix="billing" />
            </section>
            <section className="data-panel checkout-panel">
              <div className="checkout-panel-title">
                <h2>Delivery details</h2>
                <label className="same-address-toggle">
                  <input type="checkbox" checked={sameAsBilling} onChange={(event) => setSameAsBilling(event.target.checked)} />
                  Same as billing
                </label>
              </div>
              {!sameAsBilling && <CheckoutDetailsFields details={deliveryDetails} setDetails={setDeliveryDetails} prefix="delivery" />}
              {sameAsBilling && <AddressBlock title="Using billing address" details={billingDetails} />}
            </section>
            <section className="data-panel checkout-panel">
              <h2>Payment</h2>
              <div className="payment-method-card">
                <Landmark size={22} />
                <div>
                  <strong>Direct bank transfer</strong>
                  <p>Once the order is placed, admin will contact you via mobile or email with verification and bank transfer instructions.</p>
                </div>
              </div>
              <label className="checkout-field checkout-field-full">
                Order note
                <textarea name="customerNote" rows={4} placeholder="Optional delivery or billing note" />
              </label>
            </section>
          </div>
          <aside className="data-panel checkout-summary-panel">
            <div className="checkout-summary-title" style={{ justifyContent: 'flex-start' }}>
              <h2>Order summary</h2>
            </div>
            <div className="checkout-summary-list">
              {items.map((item) => (
                <OrderSummaryItem
                  key={item.id}
                  title={item.listing?.title ?? item.listingId}
                  imageUrl={item.listing?.media[0]?.url}
                  summary={item.listing ? [
                    item.listing.attributes.carat ? `${item.listing.attributes.carat} ct` : "",
                    item.listing.attributes.color,
                    item.listing.attributes.shape
                  ].filter(Boolean).join(" · ") : "Product pending"}
                  quantity={item.quantity}
                  unitPrice={item.listing?.priceLkr ?? 0}
                />
              ))}
            </div>
            <div className="checkout-total-row">
              <span>Total</span>
              <strong>{formatLkr(total)}</strong>
            </div>
            <button className="primary-action checkout-submit" type="submit" disabled={status === "Placing order..."}>
              {status === "Placing order..." ? status : "Place order"}
            </button>
            <button type="button" className="secondary-action checkout-secondary" onClick={() => setView("market")}>
              Return to Market
            </button>
            {status && status !== "Placing order..." && <p className="checkout-status">{status}</p>}
          </aside>
        </form>
      )}
    </section>
  );
}

function defaultCheckoutDetails(profile?: UserDashboard["user"]): CheckoutDetails {
  return {
    fullName: profile?.name ?? "",
    email: profile?.email ?? "",
    mobile: profile?.phone ?? "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    district: "",
    postalCode: "",
    country: "Sri Lanka"
  };
}

function CheckoutDetailsFields({
  details,
  setDetails,
  prefix
}: {
  details: CheckoutDetails;
  setDetails: (details: CheckoutDetails) => void;
  prefix: string;
}) {
  const setField = (field: keyof CheckoutDetails, value: string) => setDetails({ ...details, [field]: value });
  return (
    <div className="checkout-fields">
      <label className="checkout-field">
        <div>Full name <span className="required-asterisk">*</span></div>
        <input id={`${prefix}-full-name`} value={details.fullName} onChange={(event) => setField("fullName", event.target.value)} required />
      </label>
      <label className="checkout-field">
        <div>Email <span className="required-asterisk">*</span></div>
        <input type="email" value={details.email} onChange={(event) => setField("email", event.target.value)} required />
      </label>
      <label className="checkout-field">
        <div>Mobile <span className="required-asterisk">*</span></div>
        <input value={details.mobile} onChange={(event) => setField("mobile", event.target.value)} required />
      </label>
      <label className="checkout-field">
        <div>Address line 1 <span className="required-asterisk">*</span></div>
        <input value={details.addressLine1} onChange={(event) => setField("addressLine1", event.target.value)} required />
      </label>
      <label className="checkout-field">
        Address line 2
        <input value={details.addressLine2 ?? ""} onChange={(event) => setField("addressLine2", event.target.value)} />
      </label>
      <label className="checkout-field">
        <div>City <span className="required-asterisk">*</span></div>
        <input value={details.city} onChange={(event) => setField("city", event.target.value)} required />
      </label>
      <label className="checkout-field">
        <div>District / Province <span className="required-asterisk">*</span></div>
        <input value={details.district} onChange={(event) => setField("district", event.target.value)} required />
      </label>
      <label className="checkout-field">
        <div>Postal code <span className="required-asterisk">*</span></div>
        <input value={details.postalCode} onChange={(event) => setField("postalCode", event.target.value)} required />
      </label>
      <label className="checkout-field">
        <div>Country <span className="required-asterisk">*</span></div>
        <input value={details.country} onChange={(event) => setField("country", event.target.value)} required />
      </label>
    </div>
  );
}

