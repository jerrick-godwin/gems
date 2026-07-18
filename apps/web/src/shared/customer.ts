import type { MarketplaceReferences } from "@gems/api-client";
import type { MarketplaceAuthUser } from "../firebase";
import { pathForView, viewFromPathname, type View } from "./types";

export type CustomerAuthState =
  | { status: "resolving"; user: null }
  | { status: "signed-out"; user: null }
  | { status: "signed-in"; user: MarketplaceAuthUser };

export type CustomerNavigationOptions = {
  replace?: boolean;
  path?: string;
};

type CustomerLocation = Pick<Location, "pathname" | "search" | "hash">;

export function customerNavigationPath(view: View, options: CustomerNavigationOptions, location: CustomerLocation) {
  if (options.path) return options.path;
  if (view === "receipt" && viewFromPathname(location.pathname) === "receipt") {
    return `${location.pathname}${location.search}${location.hash}`;
  }
  return pathForView(view);
}

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
};
