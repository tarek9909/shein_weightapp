import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { ModalProvider } from "./context/ModalContext"; // adjust path
ReactDOM.createRoot(document.getElementById("root")).render( <ModalProvider>
    <App />
  </ModalProvider>);
