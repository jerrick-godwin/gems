import { FileText, Printer } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { formatLkr, orderStatusLabel, type Listing, type MarketplaceContent, type Order, type UserDashboard } from "@gems/schemas";
import { Metric } from "../../shared/Metric";
import { AddressBlock, formatOrderPlacedDate, OrderSummaryItem } from "../../shared/checkout";
import { metricIcon } from "./helpers";

export function SellerDashboard({
  listings,
  content,
  dashboard,
  orders
}: {
  listings: Listing[];
  content?: MarketplaceContent;
  dashboard: UserDashboard | null;
  orders: Order[];
}) {
  const metrics = dashboard
    ? [
        { label: "Wishlist", value: String(dashboard.wishlistCount) },
        { label: "Cart items", value: String(dashboard.cartCount) },
        { label: "Orders", value: String(orders.length) }
      ]
    : content?.sellerMetrics ?? [];
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  return (
    <section className="dashboard">
      <div className="section-heading">
        <h1>Dashboard</h1>
        <p>Listings, inquiries, boosts, and trust signals — all in one place.</p>
      </div>
      <div className="metric-grid" style={{ gridTemplateColumns: `repeat(${metrics.length}, minmax(0, 1fr))` }}>
        {metrics.map((metric) => (
          <Metric icon={metricIcon(metric.label)} label={metric.label} value={metric.value} key={metric.label} />
        ))}
      </div>
      <section className="data-panel">
        <h2>Listing status</h2>
        {listings.length === 0 ? (
          <p style={{ color: "var(--sage)", fontWeight: 600 }}>No listings yet.</p>
        ) : (
          <div className="purchase-history-table listing-status-table">
            <div className="purchase-history-row purchase-history-head listing-status-row listing-status-head">
              <span>Product Name</span>
              <span>Description</span>
              <span>Status</span>
            </div>
            {listings.map((listing) => (
              <div className="purchase-history-row listing-status-row" key={listing.id}>
                <div className="listing-status-product" data-label="Product">
                  {listing.media?.[0] ? (
                    <img src={listing.media[0].url} alt={listing.title} />
                  ) : (
                    <div className="listing-status-placeholder" />
                  )}
                  <span>{listing.title}</span>
                </div>
                <span className="listing-status-description" data-label="Description" title={listing.description}>
                  {listing.description}
                </span>
                <strong className="listing-status-pill" data-label="Status">{listing.status.replace("_", " ")}</strong>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="data-panel">
        <h2>Purchase history</h2>
        {orders.length === 0 ? (
          <p style={{ color: "var(--sage)", fontWeight: 600 }}>No orders yet.</p>
        ) : (
          <div className="purchase-history-table">
            <div className="purchase-history-row purchase-history-head">
              <span>Invoice ID</span>
              <span>Order Placed (Date)</span>
              <span>Total</span>
              <span>Status</span>
              <span aria-hidden="true" />
            </div>
            {orders.map((order) => (
              <div className="purchase-history-row" key={order.id}>
                <span className="purchase-history-invoice">{order.invoiceNumber}</span>
                <span>{formatOrderPlacedDate(order.createdAt)}</span>
                <strong>{formatLkr(order.totalLkr)}</strong>
                <em>{orderStatusLabel(order.status)}</em>
                <button type="button" className="secondary-action purchase-history-action" onClick={() => setSelectedOrder(order)}>
                  <FileText size={16} strokeWidth={2.4} />
                  View invoice
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {selectedOrder && createPortal(
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.55)", zIndex: 100000, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)", padding: 24 }}>
          <div style={{ background: "var(--panel)", borderRadius: "var(--radius-lg)", width: 720, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "var(--shadow-xl)" }}>

            {/* Modal header bar */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid var(--line)" }}>
              <div>
                <span style={{ display: "block", color: "var(--muted)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Invoice</span>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "var(--ink)" }}>{selectedOrder.invoiceNumber}</h2>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button type="button" className="secondary-action" onClick={() => window.print()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 14px", height: 36, fontSize: 13 }}>
                  <Printer size={14} strokeWidth={2.5} />
                  Print
                </button>
                <button aria-label="Close invoice" onClick={() => setSelectedOrder(null)} style={{ background: "var(--soft)", border: "1px solid var(--line)", cursor: "pointer", width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0 }}>
                  <span style={{ display: "block", color: "var(--ink)", fontSize: 20, lineHeight: 1, marginTop: -1 }}>×</span>
                </button>
              </div>
            </div>

            {/* Modal body */}
            <div style={{ padding: "24px 24px 28px" }}>
              <p style={{ margin: "0 0 20px", color: "var(--muted)", fontSize: 14 }}>Payment method: Direct bank transfer</p>
              <div className="invoice-meta" style={{ marginBottom: 20 }}>
                <AddressBlock title="Billing details" details={selectedOrder.billingDetails} />
                <AddressBlock title="Delivery details" details={selectedOrder.deliveryDetails} />
              </div>
              <div className="checkout-summary-list invoice-items">
                {selectedOrder.items.map((item) => (
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
                <strong>{formatLkr(selectedOrder.totalLkr)}</strong>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}
