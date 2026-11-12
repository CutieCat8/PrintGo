import { Suspense } from "react";
import { SkeletonCard } from "@/components/ui";
import { CustomerOrderPage } from "./view";

/** The client view reads the route id with useParams, which needs a Suspense boundary. */
export default function Page() {
  return (
    <Suspense fallback={<SkeletonCard />}>
      <CustomerOrderPage />
    </Suspense>
  );
}
