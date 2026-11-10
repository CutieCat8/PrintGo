import type { ReactNode } from "react";
import { Button } from "./Button";
import { cx } from "./cx";

type StateProps = {
  title: string;
  description?: ReactNode;
  /** Usually a Button, or a Link styled with buttonClasses(). */
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
};

function StateFrame({
  title,
  description,
  action,
  icon,
  className,
  role,
}: StateProps & { role?: string }) {
  return (
    <div role={role} className={cx("flex flex-col items-center px-4 py-10 text-center", className)}>
      {icon && (
        <div aria-hidden="true" className="mb-3 text-4xl">
          {icon}
        </div>
      )}
      <p className="text-lg font-semibold text-brand">{title}</p>
      {description && <p className="mt-1 max-w-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** "Nothing here yet" screen. */
export function EmptyState({ icon = "🗂️", ...props }: StateProps) {
  return <StateFrame icon={icon} {...props} />;
}

/** Error screen with a Thai message and a retry button. */
export function ErrorState({
  title = "เกิดข้อผิดพลาด",
  description = "โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
  onRetry,
  retrying,
  icon = "⚠️",
  className,
}: Partial<Omit<StateProps, "action">> & { onRetry?: () => void; retrying?: boolean }) {
  return (
    <StateFrame
      role="alert"
      icon={icon}
      title={title}
      description={description}
      className={className}
      action={
        onRetry && (
          <Button variant="secondary" onClick={onRetry} loading={retrying}>
            ลองใหม่
          </Button>
        )
      }
    />
  );
}
