import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { CustomerRoot } from "./customer/CustomerRoot";
import { viewFromPathname } from "./shared/types";
import "./styles/entries/customer.css";
import { ImpersonationEntry } from "./customer/ImpersonationEntry";

const initialTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {window.location.pathname.startsWith("/impersonate") ? <ImpersonationEntry /> : <CustomerRoot
      initialTheme={initialTheme}
      initialView={viewFromPathname(window.location.pathname)}
      accountComponent={App}
    />}
  </React.StrictMode>
);
