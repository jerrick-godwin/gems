import type { MarketplaceReferences } from "@gems/api-client";
import type { CustomerAuthClient, MarketplaceAuthUser } from "../firebase";
import type { View } from "./types";

export type CustomerAuthState =
  | { status: "resolving"; user: null }
  | { status: "signed-out"; user: null }
  | { status: "signed-in"; user: MarketplaceAuthUser };

export type CustomerNavigationOptions = {
  replace?: boolean;
  path?: string;
};

export type MarketplaceReferenceState = {
  data: MarketplaceReferences;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  retry: () => void;
};

export type AccountSurfaceProps = {
  view: View;
  authState: CustomerAuthState;
  references: MarketplaceReferenceState;
  navigate: (view: View, options?: CustomerNavigationOptions) => void;
  authClient: CustomerAuthClient;
  hrefForView: (view: View) => string;
};
