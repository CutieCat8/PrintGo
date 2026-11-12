import Link from "next/link";
import type { ReactNode } from "react";
// The parent ShopFrame resolves the authenticated account on the client before rendering children.
export const instant = false;
const tabs = [
  ["/shop/settings", "โปรไฟล์"],
  ["/shop/settings/hours", "เวลาเปิด–ปิด"],
  ["/shop/settings/pricing", "ราคาปริ้น"],
  ["/shop/settings/services", "บริการเสริม"],
];
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <h1 className="text-2xl font-bold text-brand">ตั้งค่าร้าน</h1>
      <nav aria-label="ตั้งค่าร้าน" className="flex flex-wrap gap-2">
        {tabs.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className="min-h-11 rounded-control border border-line bg-white px-4 py-2 text-brand hover:bg-brand-50"
          >
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
