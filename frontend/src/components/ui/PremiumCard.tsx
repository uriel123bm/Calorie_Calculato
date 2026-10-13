import type { ReactNode, HTMLAttributes } from "react";

interface PremiumCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Additional CSS class names */
  className?: string;
  /** Disable the hover lift effect */
  noHover?: boolean;
}

export function PremiumCard({ children, className = "", noHover = false, style, ...rest }: PremiumCardProps) {
  return (
    <div
      className={`premium-card${noHover ? " premium-card--no-hover" : ""} ${className}`.trim()}
      style={style}
      {...rest}
    >
      {children}
    </div>
  );
}
