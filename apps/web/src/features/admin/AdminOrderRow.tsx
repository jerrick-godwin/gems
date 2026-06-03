import { FileText } from "lucide-react";
import { useEffect, useState } from "react";
import type { GemsAdminApiClient } from "@gems/api-client";
import { formatLkr, orderStatusLabel, orderStatuses, type Order, type OrderItem, type OrderStatus } from "@gems/schemas";
import { gemFallbackImageUrl } from "../../shared/productImages";

export function AdminOrderRow({
  order,
  api,
  token,
  onUpdate,
  setLoadError
}: {
  order: Order;
  api: GemsAdminApiClient;
  token: string;
  onUpdate: (order: Order) => void;
  setLoadError: (error: string | null) => void;
}) {
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [busy, setBusy] = useState(false);
  const formatAddress = (details: Order["billingDetails"]) => [
    details.addressLine1,
    details.addressLine2,
    details.city,
    details.district,
    details.postalCode,
    details.country
  ].filter(Boolean).join(", ");

  useEffect(() => {
    setStatus(order.status);
  }, [order.status]);

  const handleUpdate = async () => {
    setBusy(true);
    try {
      const updated = await api.updateOrderStatus(token, order.id, status);
      onUpdate(updated);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to update order status");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-order-row">
      <div className="admin-order-header">
        <div>
          <span className="eyebrow">Invoice</span>
          <strong>{order.invoiceNumber}</strong>
          <p>{new Date(order.createdAt).toLocaleString()} · {formatLkr(order.totalLkr)}</p>
        </div>
        <span className="order-status-pill">{orderStatusLabel(order.status)}</span>
      </div>
      <div className="admin-order-body">
        <div className="admin-order-contact">
          <div>
            <span className="eyebrow" style={{ marginBottom: "4px" }}>Billing Details</span>
            <strong>{order.billingDetails.fullName}</strong>
            <span>{order.billingDetails.mobile}</span>
            <span>{order.billingDetails.email}</span>
            <span>{formatAddress(order.billingDetails)}</span>
          </div>
          <div>
            <span className="eyebrow" style={{ marginBottom: "4px" }}>Delivery Details</span>
            <strong>{order.deliveryDetails.fullName}</strong>
            <span>{order.deliveryDetails.mobile}</span>
            <span>{order.deliveryDetails.email}</span>
            <span>{formatAddress(order.deliveryDetails)}</span>
          </div>
        </div>
        <div className="admin-order-items">
          {order.items.map((item) => (
            <div className="admin-order-item" key={item.id}>
              <AdminOrderThumb item={item} />
              <div className="admin-order-item-copy">
                <div className="admin-order-product-head">
                  <strong>{item.titleSnapshot}</strong>
                  <span>Qty {item.quantity} · {formatLkr(item.unitPriceLkr)}</span>
                </div>
                {item.attributesSnapshot ? (
                  <div className="admin-order-attribute-grid">
                    <AdminOrderAttribute label="Carat" value={`${item.attributesSnapshot.carat} ct`} />
                    <AdminOrderAttribute label="Color" value={item.attributesSnapshot.color} />
                    <AdminOrderAttribute label="Shape" value={item.attributesSnapshot.shape} />
                    {item.attributesSnapshot.cut && <AdminOrderAttribute label="Cut" value={item.attributesSnapshot.cut} />}
                    <AdminOrderAttribute label="Treatment" value={item.attributesSnapshot.treatment} />
                    <AdminOrderAttribute label="Origin" value={item.attributesSnapshot.origin} />
                    {item.attributesSnapshot.dimensions && <AdminOrderAttribute label="Dimensions" value={item.attributesSnapshot.dimensions} />}
                    <AdminOrderAttribute label="Clarity" value={item.attributesSnapshot.clarity} />
                    <AdminOrderAttribute label="Certificate" value={item.attributesSnapshot.certificateStatus.replace(/_/g, " ")} />
                    {item.attributesSnapshot.labName && <AdminOrderAttribute label="Lab" value={item.attributesSnapshot.labName} />}
                    {item.attributesSnapshot.reportNumber && <AdminOrderAttribute label="Report #" value={item.attributesSnapshot.reportNumber} />}
                  </div>
                ) : (
                  <span>{item.productSummary}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      {order.status !== "closed" && order.status !== "rejected" && (
        <div className="admin-order-actions">
          <select value={status} onChange={(event) => setStatus(event.target.value as OrderStatus)}>
            {orderStatuses.map((item) => (
              <option key={item} value={item}>{orderStatusLabel(item)}</option>
            ))}
          </select>
          <button type="button" className="primary-action" disabled={busy || status === order.status} onClick={() => void handleUpdate()}>
            {busy ? "Updating..." : "Update status"}
          </button>
        </div>
      )}
      {order.customerNote && <p className="admin-order-note">{order.customerNote}</p>}
    </div>
  );
}

function AdminOrderAttribute({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-order-attribute">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AdminOrderThumb({ item }: { item: OrderItem }) {
  const fallbackImageUrl = gemFallbackImageUrl(item.titleSnapshot, item.productSummary);
  const [displayImageUrl, setDisplayImageUrl] = useState(item.imageUrlSnapshot ?? fallbackImageUrl);

  useEffect(() => {
    setDisplayImageUrl(item.imageUrlSnapshot ?? fallbackImageUrl);
  }, [item.imageUrlSnapshot, fallbackImageUrl]);

  return (
    <div className="admin-order-thumb">
      {displayImageUrl ? (
        <img
          src={displayImageUrl}
          alt={item.titleSnapshot}
          onError={() => setDisplayImageUrl((current) => current === fallbackImageUrl ? undefined : fallbackImageUrl)}
        />
      ) : (
        <FileText size={18} />
      )}
    </div>
  );
}
