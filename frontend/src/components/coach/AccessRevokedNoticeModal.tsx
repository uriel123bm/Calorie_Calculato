/**
 * Blocking dialog when the other party ended coaching access.
 * User must acknowledge before it dismisses.
 */
interface AccessRevokedNoticeModalProps {
  title: string;
  message: string;
  onAcknowledge: () => void;
}

export function AccessRevokedNoticeModal({
  title,
  message,
  onAcknowledge,
}: AccessRevokedNoticeModalProps) {
  return (
    <div
      className="onboarding-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="access-notice-title"
      aria-describedby="access-notice-body"
    >
      <div
        className="onboarding-card premium-card animate-scale"
        style={{ maxWidth: 400, width: "90vw" }}
      >
        <div className="onboarding-head">
          <strong
            id="access-notice-title"
            style={{ color: "var(--coach-accent)", fontSize: 17, display: "flex", alignItems: "center", gap: 8 }}
          >
            <span className="material-symbols-outlined" aria-hidden>
              link_off
            </span>
            {title}
          </strong>
        </div>

        <p
          id="access-notice-body"
          style={{
            fontSize: 14,
            color: "var(--on-surface-var)",
            margin: "0 0 18px",
            lineHeight: 1.65,
          }}
        >
          {message}
        </p>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            className="primary"
            style={{ background: "var(--coach-accent)", minWidth: 96 }}
            onClick={onAcknowledge}
            autoFocus
          >
            הבנתי
          </button>
        </div>
      </div>
    </div>
  );
}
