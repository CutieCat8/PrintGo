import { cx } from "./cx";

/** PrintGo mark: a navy page with an orange folded corner and a "go" arrow. */
export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#12284c" />
      <path d="M10 7h9l5 5v13a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" fill="#fff" />
      <path d="M19 7v4a1 1 0 0 0 1 1h4z" fill="#f26b21" />
      <path
        d="M13 19.5h6m-2.5-2.5 2.5 2.5-2.5 2.5"
        stroke="#12284c"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({
  className,
  size = "md",
  tone = "dark",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
  /** "light" for use on navy backgrounds. */
  tone?: "dark" | "light";
}) {
  const mark = { sm: "size-6", md: "size-8", lg: "size-12" }[size];
  const text = { sm: "text-base", md: "text-xl", lg: "text-3xl" }[size];
  return (
    <span className={cx("inline-flex items-center gap-2", className)}>
      <LogoMark className={mark} />
      <span
        className={cx(
          "font-bold tracking-tight",
          text,
          tone === "dark" ? "text-brand" : "text-white",
        )}
      >
        Print<span className="text-accent">Go</span>
      </span>
    </span>
  );
}
