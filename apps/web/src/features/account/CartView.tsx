import { CreditCard, Minus, Plus, Trash2 } from "lucide-react";
import { formatLkr, type Cart } from "@gems/schemas";
import type { View } from "../../shared/types";

export function CartView({
  cart,
  setCart,
  setView,
  removeItem,
  updateItem
}: {
  cart: Cart | null;
  setCart: (cart: Cart) => void;
  setView: (v: View) => void;
  removeItem: (itemId: string) => Promise<Cart>;
  updateItem: (itemId: string, quantity: number) => Promise<Cart>;
}) {
  const items = cart?.items ?? [];
  return (
    <section className="dashboard">
      <div className="section-heading">
        <h1>Your Cart</h1>
        <p>Review items in your cart before checkout.</p>
      </div>
      {items.length === 0 ? (
        <div className="empty-results">
          <h2>Your cart is empty</h2>
          <p>Start browsing to add gems to your cart.</p>
        </div>
      ) : (
        <section className="data-panel">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {items.map((item) => (
              <div className="cart-item-card" key={item.id} style={{ display: 'flex', gap: 16, padding: 16, border: '1px solid var(--line)', borderRadius: 'var(--radius)', background: 'var(--panel-strong)' }}>
                {item.listing?.media[0] && (
                  <img src={item.listing.media[0].url} alt={item.listing.title} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 'var(--radius-sm)' }} />
                )}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <h3 style={{ margin: 0, fontSize: 16, color: 'var(--ink)' }}>{item.listing?.title ?? item.listingId}</h3>
                  {item.listing && (
                    <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
                      {item.listing.attributes.carat} ct · {item.listing.attributes.color} · {item.listing.attributes.shape}
                    </div>
                  )}
                  <strong style={{ fontSize: 16, color: 'var(--emerald)', marginTop: 'auto' }}>
                    {item.listing ? formatLkr(item.listing.priceLkr) : "Pending"}
                  </strong>
                </div>
                <div className="qty-stepper" style={{ height: 'fit-content', alignSelf: 'center' }}>
                  <button type="button" onClick={() => {
                    if (item.quantity <= 1) {
                      void removeItem(item.id).then(setCart);
                    } else {
                      void updateItem(item.id, item.quantity - 1).then(setCart);
                    }
                  }} aria-label={item.quantity <= 1 ? "Remove item" : "Decrease quantity"}>
                    {item.quantity <= 1 ? <Trash2 size={16} strokeWidth={2.5} color="var(--danger)" /> : <Minus size={16} strokeWidth={2.5} />}
                  </button>
                  <span>{item.quantity}</span>
                  <button type="button" onClick={() => void updateItem(item.id, item.quantity + 1).then(setCart)} aria-label="Increase quantity">
                    <Plus size={16} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--line-strong)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 16px', color: 'var(--ink)' }}>Order Summary</h2>
            <div className="table-row" style={{ padding: '16px 0 24px' }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Total</span>
              <strong style={{ fontSize: 18 }}>{formatLkr(items.reduce((sum, item) => sum + (item.listing?.priceLkr ?? 0) * item.quantity, 0))}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="primary-action" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 32px', height: 48, fontSize: 16 }} onClick={() => setView("checkout")}>
                <CreditCard size={20} />
                Proceed to Checkout
              </button>
            </div>
          </div>
        </section>
      )}
    </section>
  );
}

