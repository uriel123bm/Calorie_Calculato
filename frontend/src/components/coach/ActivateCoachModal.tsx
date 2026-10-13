import { useState } from "react";

interface ActivateCoachModalProps {
  onClose: () => void;
  onActivate: (bio?: string) => Promise<void>;
}

export function ActivateCoachModal({ onClose, onActivate }: ActivateCoachModalProps) {
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onActivate(bio.trim() || undefined);
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "שגיאה בהפעלת פרופיל מאמן";
      setError(String(msg));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="onboarding-overlay" role="dialog" aria-label="הפעלת מרחב מאמן" onClick={onClose}>
      <div
        className="onboarding-card premium-card animate-scale"
        style={{ maxWidth: 420, width: "90vw" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="onboarding-head">
          <strong style={{ color: "var(--coach-accent)", fontSize: 17 }}>
            <span className="material-symbols-outlined" style={{ verticalAlign: "middle", marginLeft: 6 }}>fitness_center</span>
            הפעל מרחב מאמן
          </strong>
          <button type="button" className="ghost onboarding-close" onClick={onClose} aria-label="סגור">סגור</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
          <p style={{ fontSize: 14, color: "var(--on-surface-var)", margin: 0, lineHeight: 1.65 }}>
            כמאמן, תוכל:
          </p>
          <ul style={{ margin: 0, padding: "0 0 0 20px", fontSize: 14, color: "var(--on-surface-var)", lineHeight: 2 }}>
            <li>להזמין מתאמנים לחלוק נתוני תזונה</li>
            <li>לצפות בסיכומים יומיים ושבועיים</li>
            <li>להציע יעדי תזונה אישיים</li>
            <li>לעקוב אחר ההתקדמות</li>
          </ul>
          <div style={{ fontSize: 13, padding: "10px 14px", background: "var(--primary-soft)", borderRadius: "var(--radius-xs)", color: "var(--primary-strong)", lineHeight: 1.6 }}>
            המתאמן שולט תמיד בנתונים שלו. הוא יכול לבטל גישה בכל עת.
          </div>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ fontSize: 14, fontWeight: 600, display: "flex", flexDirection: "column", gap: 6 }}>
            תיאור קצר (אופציונלי)
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="מאמן כושר ותזונה מוסמך עם ניסיון של 5 שנים..."
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

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" className="ghost" onClick={onClose} disabled={loading}>ביטול</button>
            <button
              type="submit"
              className="primary"
              style={{ background: "var(--coach-accent)" }}
              disabled={loading}
            >
              {loading ? "מפעיל..." : "הפעל מרחב מאמן"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
