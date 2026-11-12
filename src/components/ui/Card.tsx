import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

type CardProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "section" | "article" | "li";
  padding?: "none" | "sm" | "md" | "lg";
};

const PADDING = { none: "", sm: "p-3", md: "p-4", lg: "p-6" };

export function Card({ as: Tag = "div", padding = "md", className, ...rest }: CardProps) {
  return (
    <Tag
      className={cx(
        "rounded-card border border-line bg-surface shadow-card",
        PADDING[padding],
        className,
      )}
      {...rest}
    />
  );
}

/** Title row inside a card, with optional actions on the right. */
export function CardHeader({
  title,
  actions,
  className,
}: {
  title: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 className="text-lg font-semibold text-brand">{title}</h2>
      {actions}
    </div>
  );
}
