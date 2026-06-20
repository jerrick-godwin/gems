import { useEffect, useState } from "react";
import type { GemsApiClient } from "@gems/api-client";
import type { Report, UserDashboard } from "@gems/schemas";

export function useAccountWorkflow(api: GemsApiClient, isSignedIn: boolean) {
  const [accountError, setAccountError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<UserDashboard | null>(null);
  const [myReports, setMyReports] = useState<Report[]>([]);

  useEffect(() => {
    if (!isSignedIn) {
      setDashboard(null);
      setMyReports([]);
      setAccountError(null);
      return;
    }

    let active = true;
    Promise.all([api.dashboard(), api.myReports()])
      .then(([nextDashboard, nextReports]) => {
        if (!active) return;
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

  return { accountError, dashboard, setDashboard, myReports, setMyReports };
}
