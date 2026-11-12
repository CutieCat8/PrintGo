import type { Metadata } from "next";
import { Suspense } from "react";
import { ToastProvider } from "@/components/ui";
import { displayFont } from "@/components/ui/fonts";
import { ShopFrame } from "./_components/ShopFrame";

export const metadata: Metadata = { title: "PrintGo · ร้าน" };

/** Every shop page needs the signed-in shop (GET /api/shop/me) first, so none can be instant. */
export const instant = false;

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={displayFont.variable}>
      <ToastProvider>
        {/* ShopFrame reads the path (usePathname), which needs Suspense on dynamic routes */}
        <Suspense>
          <ShopFrame>{children}</ShopFrame>
        </Suspense>
      </ToastProvider>
    </div>
  );
}
