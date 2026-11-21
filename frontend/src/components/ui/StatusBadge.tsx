type InvitationStatus =
  | "pending"
  | "proposed"
  | "accepted"
  | "rejected"
  | "expired"
  | "cancelled"
  | "revoked"
  | "superseded"
  | "active";

const LABELS: Record<InvitationStatus, string> = {
  pending:    "ממתין",
  proposed:   "ממתין",
  accepted:   "אושר",
  rejected:   "נדחה",
  expired:    "פג תוקף",
  cancelled:  "בוטל",
  revoked:    "בוטל",
  superseded: "בוטל",
  active:     "פעיל",
};

const ICONS: Record<InvitationStatus, string> = {
  pending:    "schedule",
  proposed:   "schedule",
  accepted:   "check_circle",
  rejected:   "cancel",
  expired:    "timer_off",
  cancelled:  "block",
  revoked:    "block",
  superseded: "block",
  active:     "verified",
};

interface StatusBadgeProps {
  status: InvitationStatus;
  className?: string;
}

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  return (
    <span
      className={`status-badge status-badge--${status} ${className}`.trim()}
      role="status"
      aria-label={LABELS[status]}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 13 }} aria-hidden="true">
        {ICONS[status]}
      </span>
      {LABELS[status]}
    </span>
  );
}
