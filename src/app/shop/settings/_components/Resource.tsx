"use client";
import type { ReactNode } from "react";
import useSWR from "swr";
import { ErrorState, Skeleton } from "@/components/ui";
import { errorMessage } from "@/lib/client/http";

/** Revalidation never replaces a dirty form on focus. Returned values seed the form once. */
export function Resource<T>({
  cacheKey,
  load,
  children,
}: {
  cacheKey: string;
  load: () => Promise<T>;
  children: (data: T, saved: (data: T) => Promise<void>) => ReactNode;
}) {
  const resource = useSWR(cacheKey, load, { revalidateOnFocus: false, shouldRetryOnError: false });
  if (resource.error)
    return (
      <ErrorState
        description={errorMessage(resource.error)}
        onRetry={() => void resource.mutate()}
      />
    );
  if (!resource.data) return <Skeleton className="h-64" />;
  return children(resource.data, async (data) => {
    await resource.mutate(data, { revalidate: false });
  });
}
