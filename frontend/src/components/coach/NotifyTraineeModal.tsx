/**
 * Modal for coaches to send push notifications to a trainee.
 * Provides preset messages and a custom message option.
 */
import { useState } from "react";
import { notifyTrainee } from "../../services/coachApi";

interface Preset {
  icon: string;
  label: string;
  title: string;
  body: string;
  tag: string;
}

const PRESETS: Preset[] = [
  {
    icon: "fitness_center",
    label: "יציאה לאימון",
    title: "⏰ הגיע הזמן לאימון!",
    body: "המאמן שלך מחכה — צא/י לאימון היום ✪",
    tag: "coach-workout",
  },
  {
    icon: "directions_walk",
    label: "השלמת יעד צעדים",
    title: "🚶 יעד הצעדים מחכה לך",
    body: "עוד כמה צעדים ותשלים/י את יעד הצעדים היומי — אל תוותר/י!",
    tag: "coach-steps",
  },
  {
    icon: "restaurant",
    label: "דיווח תזונה",
    title: "🥗 רשם/י את הארוחות שלך",
    body: "אל תשכח/י לדווח על מה שאכלת היום — מעקב מדויק = תוצאות טובות יותר",
    tag: "coach-nutrition",
  },
  {
    icon: "monitor_weight",
    label: "מדידת משקל",
    title: "⚖️ יום מדידה!",
    body: "הגיע הזמן לעלות על המאזניים ולרשום את המשקל שלך להיום",
    tag: "coach-weight",
  },
  {
    icon: "local_drink",
    label: "שתיית מים",
    title: "💧 שתה/י מים!",
    body: "שמרו על לחות — יעד המים היומי שלך מחכה להשלמה",
    tag: "coach-water",
  },
  {
    icon: "emoji_events",
    label: "עידוד אישי",
    title: "🏆 כל הכבוד!",
    body: "אתה/את עושה עבודה נהדרת — המשיכו כך! המאמן שלך גאה בך",
    tag: "coach-encouragement",
  },
];

interface Props {
  traineeId: string;
  traineeName: string;
  onClose: () => void;
}

export function NotifyTraineeModal({ traineeId, traineeName, onClose }: Props) {
  const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null);
  const [customTitle, setCustomTitle] = useState("");
  const [customBody, setCustomBody] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    const payload = isCustom
      ? { title: customTitle.trim(), body: customBody.trim(), tag: "coach-custom" }
      : selectedPreset
        ? { title: selectedPreset.title, body: selectedPreset.body, tag: selectedPreset.tag }
        : null;

    if (!payload || !payload.title || !payload.body) return;

    setLoading(true);
    setError(null);
    try {
      await notifyTrainee(traineeId, payload);
      setSent(true);
      setTimeout(onClose, 1800);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "שגיאה בשליחת ההתראה";
      setError(String(msg));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="onboarding-overlay" role="dialog" aria-label="שליחת התראה" onClick={onClose}>
      <div
        className="onboarding-card premium-card animate-scale"
        style={{ maxWidth: 440, width: "92vw", maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="onboarding-head" style={{ position: "sticky", top: 0, background: "var(--surface-card)", zIndex: 1, paddingBottom: 12 }}>
          <strong style={{ color: "var(--coach-accent)", fontSize: 16 }}>
            <span className="material-symbols-outlined" style={{ verticalAlign: "middle", marginLeft: 6, fontSize: 20 }}>
              notifications_active
            </span>
            שלח התראה ל-{traineeName}
          </strong>
          <button type="button" className="ghost onboarding-close" onClick={onClose} aria-label="סגור">סגור</button>
        </div>

        {sent ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 56, color: "#4caf50" }}>check_circle</span>
            <p style={{ fontSize: 16, fontWeight: 700, color: "#4caf50", margin: "10px 0 0" }}>ההתראה נשלחה!</p>
          </div>
        ) : (
          <>
            {/* Preset grid */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--on-surface-var)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                הודעות מוכנות
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
                {PRESETS.map((preset) => (
                  <button
                    key={preset.tag}
                    type="button"
                    onClick={() => { setSelectedPreset(preset); setIsCustom(false); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "12px 14px",
                      borderRadius: 14,
                      border: `2px solid ${selectedPreset?.tag === preset.tag && !isCustom ? "var(--coach-accent)" : "var(--border)"}`,
                      background: selectedPreset?.tag === preset.tag && !isCustom ? "var(--coach-soft)" : "var(--surface-card)",
                      cursor: "pointer",
                      textAlign: "right",
                      transition: "all 0.15s",
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{
                        fontSize: 22,
                        color: selectedPreset?.tag === preset.tag && !isCustom ? "var(--coach-accent)" : "var(--outline)",
                        flexShrink: 0,
                      }}
                    >
                      {preset.icon}
                    </span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--on-surface)" }}>{preset.label}</div>
                      <div style={{ fontSize: 11, color: "var(--on-surface-var)", marginTop: 2, lineHeight: 1.3 }}>{preset.title}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Preview */}
            {selectedPreset && !isCustom && (
              <div style={{
                background: "var(--coach-soft)", borderRadius: 14,
                border: "1px solid var(--coach-border)", padding: "12px 16px",
                marginBottom: 14,
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--coach-accent)", marginBottom: 4 }}>תצוגה מקדימה:</div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{selectedPreset.title}</div>
                <div style={{ fontSize: 13, color: "var(--on-surface-var)", marginTop: 3 }}>{selectedPreset.body}</div>
              </div>
            )}

            {/* Custom message toggle */}
            <button
              type="button"
              onClick={() => { setIsCustom((v) => !v); setSelectedPreset(null); }}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                width: "100%", padding: "10px 14px",
                borderRadius: 12, border: `2px solid ${isCustom ? "var(--coach-accent)" : "var(--border)"}`,
                background: isCustom ? "var(--coach-soft)" : "var(--surface-card)",
                cursor: "pointer", marginBottom: isCustom ? 12 : 16, fontSize: 13, fontWeight: 600,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: isCustom ? "var(--coach-accent)" : "var(--outline)" }}>
                edit_note
              </span>
              הודעה מותאמת אישית
            </button>

            {isCustom && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: "flex", flexDirection: "column", gap: 5 }}>
                  כותרת
                  <input
                    type="text"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="לדוגמה: בוא לאימון היום!"
                    maxLength={100}
                    autoFocus
                  />
                </label>
                <label style={{ fontSize: 13, fontWeight: 600, display: "flex", flexDirection: "column", gap: 5 }}>
                  גוף ההודעה
                  <textarea
                    value={customBody}
                    onChange={(e) => setCustomBody(e.target.value)}
                    placeholder="לדוגמה: ראיתי שלא ביצעת אימון השבוע — הגיע הזמן!"
                    maxLength={300}
                    rows={3}
                    style={{ resize: "vertical", padding: 10, borderRadius: 10, border: "1px solid var(--border)", fontSize: 13 }}
                  />
                </label>
              </div>
            )}

            {error && (
              <div style={{ background: "#fce8e8", color: "var(--danger)", borderRadius: 10, padding: "8px 12px", fontSize: 13, marginBottom: 12 }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" className="ghost" onClick={onClose} disabled={loading} style={{ flex: 1 }}>
                ביטול
              </button>
              <button
                type="button"
                className="primary"
                style={{ flex: 2, background: "var(--coach-accent)" }}
                disabled={loading || (!selectedPreset && (!customTitle.trim() || !customBody.trim()))}
                onClick={() => void handleSend()}
              >
                {loading
                  ? "שולח..."
                  : (
                    <>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>send</span>
                      שלח התראה
                    </>
                  )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
