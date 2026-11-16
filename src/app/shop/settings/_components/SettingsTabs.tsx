"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const tabs = [
  ["/shop/settings", "โปรไฟล์"],
  ["/shop/settings/hours", "เวลาเปิด–ปิด"],
  ["/shop/settings/pricing", "ราคาปริ้น"],
  ["/shop/settings/services", "บริการเสริม"],
] as const;

/** Settings menu: the page you are on is filled in dark and marked for screen readers. */
export function SettingsTabs() {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label="ตั้งค่าร้าน" className="flex flex-wrap gap-2">
      {tabs.map(([href, label]) => {
        // "/shop/settings" is the profile page, so it must match exactly (the others start with it)
        const active = href === "/shop/settings" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "min-h-11 rounded-control border px-4 py-2 font-medium transition",
              active
                ? "border-brand bg-brand text-white"
                : "border-line bg-white text-ink-muted hover:bg-brand-50 hover:text-ink",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
