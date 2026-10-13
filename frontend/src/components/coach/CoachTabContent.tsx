/**
 * Top-level wrapper for the "מאמן" tab.
 *
 * Shows both:
 * 1. TraineeInvitationsPanel — visible to all users (receive invitations from coaches)
 * 2. CoachDashboard — visible when the user has an active coach profile
 */
import { useState } from "react";
import { useCoach } from "../../hooks/useCoach";
import { CoachDashboard } from "./CoachDashboard";
import { TraineeInvitationsPanel } from "./TraineeInvitationsPanel";
import { ActivateCoachModal } from "./ActivateCoachModal";

export function CoachTabContent() {
  const { activateCoach, myInvitations } = useCoach();
  const [showActivate, setShowActivate] = useState(false);

  const pendingCount = myInvitations.filter((i) => i.status === "pending").length;

  return (
    <div className="page-container">
      {/* Trainee invitations banner — always visible */}
      {pendingCount > 0 && (
        <div
          className="section animate-enter"
          style={{ background: "var(--coach-soft)", borderColor: "var(--coach-border)", padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}
        >
          <span className="material-symbols-outlined" style={{ color: "var(--coach-accent)", fontSize: 28 }}>notifications_active</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--coach-accent)" }}>
              {pendingCount === 1 ? "קיבלת הזמנה ממאמן!" : `קיבלת ${pendingCount} הזמנות ממאמנים`}
            </div>
            <div style={{ fontSize: 13, color: "var(--on-surface-var)" }}>גלול למטה לצפייה ואישור</div>
          </div>
        </div>
      )}

      {/* Coach dashboard (if coach) or activation prompt */}
      <CoachDashboard onActivateCoach={() => setShowActivate(true)} />

      {/* Invitation management section */}
      <TraineeInvitationsPanel />

      {showActivate && (
        <ActivateCoachModal
          onClose={() => setShowActivate(false)}
          onActivate={async (bio) => {
            await activateCoach(bio);
            setShowActivate(false);
          }}
        />
      )}
    </div>
  );
}
