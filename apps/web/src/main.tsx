import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { CustomerRoot } from "./customer/CustomerRoot";
import { viewFromPathname } from "./shared/types";
import "./styles/entries/customer.css";

const initialTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <CustomerRoot
      initialTheme={initialTheme}
      initialView={viewFromPathname(window.location.pathname)}
      accountComponent={App}
    />
  </React.StrictMode>
);
