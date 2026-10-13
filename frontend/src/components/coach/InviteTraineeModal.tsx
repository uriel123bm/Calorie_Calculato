import { useState } from "react";

interface InviteTraineeModalProps {
  onClose: () => void;
  onSend: (email: string, message?: string) => Promise<void>;
}

export function InviteTraineeModal({ onClose, onSend }: InviteTraineeModalProps) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await onSend(email.trim(), message.trim() || undefined);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "שגיאה בשליחת ההזמנה";
      setError(String(msg));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="onboarding-overlay" role="dialog" aria-label="הזמנת מתאמן" onClick={onClose}>
      <div
        className="onboarding-card premium-card animate-scale"
        style={{ maxWidth: 400, width: "90vw" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="onboarding-head">
          <strong style={{ color: "var(--coach-accent)" }}>
            <span className="material-symbols-outlined" style={{ verticalAlign: "middle", marginLeft: 6 }}>person_add</span>
            הזמן מתאמן
          </strong>
          <button type="button" className="ghost onboarding-close" onClick={onClose} aria-label="סגור">
            סגור
          </button>
        </div>

        <p style={{ fontSize: 14, color: "var(--on-surface-var)", marginBottom: 16, marginTop: 4 }}>
          המתאמן יקבל הזמנה ויצטרך לאשר אותה לפני שתוכל לצפות בנתונים שלו.
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14, fontWeight: 600 }}>
            כתובת אימייל של המתאמן
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="trainee@example.com"
              required
              autoFocus
              dir="ltr"
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14, fontWeight: 600 }}>
            הודעה (אופציונלי)
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="היי, אני רוצה לעזור לך להגיע ליעדים שלך..."
              maxLength={500}
              rows={3}
              style={{ resize: "vertical", fontSize: 14, padding: 10, borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}
            />
          </label>

          {error && (
            <div style={{ background: "#fce8e8", color: "var(--danger)", borderRadius: "var(--radius-xs)", padding: "8px 12px", fontSize: 13 }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" className="ghost" onClick={onClose} disabled={loading}>
              ביטול
            </button>
            <button
              type="submit"
              className="primary"
              style={{ background: "var(--coach-accent)" }}
              disabled={loading || !email.trim()}
            >
              {loading ? "שולח..." : "שלח הזמנה"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
