import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Showcase } from "./showcase";

export const metadata: Metadata = { title: "UI kit · PrintGo (dev)" };

/** Component gallery for the team. Development only: production returns 404. */
export default function DevUiPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Showcase />;
}
