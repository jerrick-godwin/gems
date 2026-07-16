import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/entries/customer.css";
import "./firebase"; // Initialize Firebase

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
