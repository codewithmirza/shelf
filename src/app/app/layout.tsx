import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import styles from "./seller.module.css";

export const metadata: Metadata = { title: "Shelf · Seller app", robots: { index: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#F7F7F5" };

// The Seller app: mobile first, one 480 px column on desktop (DESIGN-SYSTEM.md "Seller app").
export default function SellerLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      {children}
      <Toaster position="bottom-center" visibleToasts={1} offset={88} toastOptions={{ className: styles.toast ?? "", duration: 3000 }} />
    </div>
  );
}
