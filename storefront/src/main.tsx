import { createRoot } from "react-dom/client";

// Task T-13 replaces this with the five Storefront views (results, product, cart, checkout, order).
function Storefront() {
  return <p>Shelf Storefront</p>;
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<Storefront />);
