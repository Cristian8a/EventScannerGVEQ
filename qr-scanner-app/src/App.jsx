import React from "react";
import "./index.css";
import QRScannerApp from "./QRScannerApp/QRScannerApp";
import ApartadoApp from "./ApartadoApp/ApartadoApp";

function App() {

  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);

  const isApartado =
    path === ("/apartado") ||
    params.get("invitadoId") ||
    params.has("oppId");

  return isApartado ? <ApartadoApp /> : <QRScannerApp />;
}

export default App;
