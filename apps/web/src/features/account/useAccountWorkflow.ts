import { useEffect, useState } from "react";
import type { GemsApiClient } from "@gems/api-client";
import type { Report, UserDashboard, WishlistItem } from "@gems/schemas";

export function useAccountWorkflow(api: GemsApiClient, isSignedIn: boolean) {
  const [accountError, setAccountError] = useState<string | null>(null);
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [dashboard, setDashboard] = useState<UserDashboard | null>(null);
  const [myReports, setMyReports] = useState<Report[]>([]);

  useEffect(() => {
    if (!isSignedIn) {
      setWishlistItems([]);
      setDashboard(null);
      setMyReports([]);
      setAccountError(null);
      return;
    }

    let active = true;
    Promise.all([api.wishlist(), api.dashboard(), api.myReports()])
      .then(([nextWishlist, nextDashboard, nextReports]) => {
        if (!active) return;
        setWishlistItems(nextWishlist);
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

  return { accountError, wishlistItems, setWishlistItems, dashboard, setDashboard, myReports, setMyReports };
}
