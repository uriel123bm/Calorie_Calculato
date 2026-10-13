/**
 * Panel shown to regular users to see invitations they've received from coaches
 * and to manage their active coaching relationships.
 */
import { useCoach } from "../../hooks/useCoach";
import { EmptyState, LoadingSkeleton, StatusBadge } from "../ui";

export function TraineeInvitationsPanel() {
  const {
    myInvitations,
    myInvitationsLoading,
    myRelationships,
    acceptMyInvitation,
    rejectMyInvitation,
    revokeMyCoach,
    refreshMyInvitations,
    error,
    clearError,
  } = useCoach();

  const pendingInvitations = myInvitations.filter((i) => i.status === "pending");
  const pastInvitations = myInvitations.filter((i) => i.status !== "pending");
  const activeRelationships = myRelationships.filter((r) => r.status === "active");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error && (
        <div style={{ background: "#fce8e8", color: "var(--danger)", borderRadius: "var(--radius-xs)", padding: "8px 12px", fontSize: 13, display: "flex", justifyContent: "space-between" }}>
          {error}
          <button type="button" className="ghost" onClick={clearError} style={{ padding: "0 6px" }}>✕</button>
        </div>
      )}

      {/* Active coaching relationships */}
      {activeRelationships.length > 0 && (
        <div className="section" style={{ background: "var(--coach-soft)", borderColor: "var(--coach-border)" }}>
          <h2 style={{ color: "var(--coach-accent)", marginBottom: 14 }}>
            <span className="material-symbols-outlined">supervisor_account</span>
            המאמנים שלי
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {activeRelationships.map((rel) => (
              <div key={rel.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontSize: 14 }}>
                  <div style={{ fontWeight: 600 }}>מאמן פעיל</div>
                  <div style={{ fontSize: 12, color: "var(--on-surface-var)" }}>
                    מאז {new Date(rel.started_at).toLocaleDateString("he-IL")}
                  </div>
                </div>
                <button
                  type="button"
                  className="ghost"
                  style={{ fontSize: 13, color: "var(--danger)", borderColor: "var(--danger)" }}
                  onClick={() => {
                    if (window.confirm("לבטל את גישת המאמן לנתונים שלך?")) {
                      void revokeMyCoach(rel.id);
                    }
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>block</span>
                  בטל גישה
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending invitations */}
      <div className="section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 style={{ margin: 0 }}>
            <span className="material-symbols-outlined">mail</span>
            הזמנות ממאמנים
          </h2>
          <button
            type="button"
            className="ghost"
            onClick={() => void refreshMyInvitations()}
            aria-label="רענן הזמנות"
            style={{ padding: "4px 10px", fontSize: 13 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
          </button>
        </div>

        {myInvitationsLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <LoadingSkeleton height={80} borderRadius={14} />
            <LoadingSkeleton height={80} borderRadius={14} />
          </div>
        ) : pendingInvitations.length === 0 ? (
          <EmptyState
            icon="mail_outline"
            title="אין הזמנות חדשות"
            message="כשמאמן ישלח לך הזמנה, היא תופיע כאן"
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {pendingInvitations.map((inv) => (
              <div
                key={inv.id}
                className="premium-card animate-enter"
                style={{ background: "var(--coach-soft)", borderColor: "var(--coach-border)", padding: "16px 18px" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 18, verticalAlign: "middle", marginLeft: 6, color: "var(--coach-accent)" }}>
                        supervisor_account
                      </span>
                      {inv.coach_username ?? "מאמן"}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--on-surface-var)", marginTop: 4 }}>
                      הוזמנת על ידי {inv.coach_email}
                    </div>
                    {inv.message && (
                      <div style={{ fontSize: 13, marginTop: 8, padding: "8px 12px", background: "rgba(255,255,255,0.7)", borderRadius: "var(--radius-xs)", fontStyle: "italic" }}>
                        {inv.message}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: "var(--on-surface-var)", marginTop: 8 }}>
                      ⏳ תוקף עד: {new Date(inv.expires_at).toLocaleDateString("he-IL")}
                    </div>
                  </div>
                </div>

                {/* Consent notice */}
                <div style={{ fontSize: 12, color: "var(--on-surface-var)", marginTop: 12, padding: "8px 12px", background: "rgba(255,255,255,0.5)", borderRadius: "var(--radius-xs)", lineHeight: 1.6 }}>
                  <strong>שים לב:</strong> אישור ההזמנה יאפשר למאמן לצפות בנתוני התזונה היומיים שלך, ההיסטוריה, הארוחות השמורות ומשקל הגוף. תוכל לבטל את הגישה בכל עת.
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                  <button
                    type="button"
                    className="ghost"
                    style={{ flex: 1, color: "var(--danger)", borderColor: "var(--danger)" }}
                    onClick={() => void rejectMyInvitation(inv.id)}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>cancel</span>
                    דחה
                  </button>
                  <button
                    type="button"
                    className="primary"
                    style={{ flex: 2, background: "var(--coach-accent)" }}
                    onClick={() => void acceptMyInvitation(inv.id)}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check_circle</span>
                    אשר הזמנה
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Past invitations */}
        {pastInvitations.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, color: "var(--on-surface-var)", fontWeight: 600, marginBottom: 10 }}>הזמנות קודמות</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {pastInvitations.slice(0, 5).map((inv) => (
                <div
                  key={inv.id}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "var(--surface-alt)", borderRadius: "var(--radius-xs)" }}
                >
                  <span style={{ fontSize: 13 }}>{inv.coach_username ?? inv.coach_email}</span>
                  <StatusBadge status={inv.status} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
