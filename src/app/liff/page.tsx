import { redirect } from "next/navigation";

/** The LINE rich menu opens /liff: start a new order. */
export default function LiffHome() {
  redirect("/liff/new");
}
