import type { ButtonHTMLAttributes } from "react";

type Variant = "default" | "secondary" | "outline" | "ghost" | "destructive";
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "md" | "icon";
};

export function Button({ variant = "default", size = "md", className = "", ...props }: ButtonProps) {
  return <button className={`ui-button button-${variant} button-${size} ${className}`} {...props} />;
}
