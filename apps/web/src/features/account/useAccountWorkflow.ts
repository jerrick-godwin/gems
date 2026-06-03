import { useEffect, useState } from "react";
import type { GemsApiClient } from "@gems/api-client";
import type { Cart, Order, Report, UserDashboard, WishlistItem } from "@gems/schemas";

export function useAccountWorkflow(api: GemsApiClient, isSignedIn: boolean) {
  const [accountError, setAccountError] = useState<string | null>(null);
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [cart, setCart] = useState<Cart | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [dashboard, setDashboard] = useState<UserDashboard | null>(null);
  const [myReports, setMyReports] = useState<Report[]>([]);

  useEffect(() => {
    if (!isSignedIn) {
      setWishlistItems([]);
      setCart(null);
      setOrders([]);
      setDashboard(null);
      setMyReports([]);
      setAccountError(null);
      return;
    }

    let active = true;
    Promise.all([api.wishlist(), api.cart(), api.orders(), api.dashboard(), api.myReports()])
      .then(([nextWishlist, nextCart, nextOrders, nextDashboard, nextReports]) => {
        if (!active) return;
        setWishlistItems(nextWishlist);
        setCart(nextCart);
        setOrders(nextOrders);
        setDashboard(nextDashboard);
        setMyReports(nextReports);
        setAccountError(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setAccountError(error instanceof Error ? error.message : "Unable to load your account data");
      });

    return () => {
      active = false;
    };
  }, [api, isSignedIn]);

  return { accountError, wishlistItems, setWishlistItems, cart, setCart, orders, setOrders, dashboard, setDashboard, myReports, setMyReports };
}
