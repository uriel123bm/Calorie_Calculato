import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: string;
  title: string;
  message?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon = "inbox", title, message, action, className = "" }: EmptyStateProps) {
  return (
    <div className={`empty-state animate-fade-in ${className}`.trim()}>
      <span className="material-symbols-outlined empty-state__icon" aria-hidden="true">
        {icon}
      </span>
      <p className="empty-state__title">{title}</p>
      {message && <p className="empty-state__message">{message}</p>}
      {action}
    </div>
  );
}
