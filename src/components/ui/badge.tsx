import type { HTMLAttributes } from "react";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "muted" | "outline" | "danger";
};

export function Badge({ variant = "default", className = "", ...props }: BadgeProps) {
  return <span className={`ui-badge badge-${variant} ${className}`} {...props} />;
}
