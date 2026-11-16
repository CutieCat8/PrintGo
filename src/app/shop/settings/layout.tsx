import type { ReactNode } from "react";
import { SettingsTabs } from "./_components/SettingsTabs";
// The parent ShopFrame resolves the authenticated account on the client before rendering children.
export const instant = false;
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <h1 className="text-2xl font-bold text-brand">ตั้งค่าร้าน</h1>
      <SettingsTabs />
      {children}
    </div>
  );
}
