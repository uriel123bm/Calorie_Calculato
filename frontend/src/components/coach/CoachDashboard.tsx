import { useEffect, useState } from "react";
import { useCoach } from "../../hooks/useCoach";
import { EmptyState, LoadingSkeleton, StatCard, StatusBadge } from "../ui";
import { InviteTraineeModal } from "./InviteTraineeModal";
import { TraineeDashboard } from "./TraineeDashboard";
import type { TraineeListItem } from "../../services/coachApi";

interface CoachDashboardProps {
  onActivateCoach: () => void;
}

export function CoachDashboard({ onActivateCoach }: CoachDashboardProps) {
  const {
    isCoach,
    profileLoading,
    coachProfile,
    trainees,
    traineesLoading,
    coachInvitations,
    invitationsLoading,
    refreshTrainees,
    refreshCoachInvitations,
    sendCoachInvitation,
    cancelCoachInvitation,
    error,
    clearError,
  } = useCoach();

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedTrainee, setSelectedTrainee] = useState<TraineeListItem | null>(null);

  useEffect(() => {
    if (isCoach) {
      void refreshTrainees();
      void refreshCoachInvitations();
    }
  }, [isCoach, refreshTrainees, refreshCoachInvitations]);

  if (profileLoading) {
    return (
      <div className="page-container">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <LoadingSkeleton height={60} borderRadius={20} />
          <LoadingSkeleton height={100} borderRadius={20} />
          <LoadingSkeleton height={200} borderRadius={20} />
        </div>
      </div>
    );
  }

  if (!isCoach) {
    return (
      <div className="page-container">
        <div className="page-hero" style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 40, color: "var(--coach-accent)" }}>
              supervisor_account
            </span>
            <div>
              <h2 className="page-title" style={{ color: "var(--coach-accent)" }}>מרחב מאמן</h2>
              <p className="page-subtitle">נהל את המתאמנים שלך</p>
            </div>
          </div>
        </div>

        <div className="section animate-enter" style={{ background: "var(--coach-soft)", borderColor: "var(--coach-border)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center", textAlign: "center", padding: "12px 0" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 52, color: "var(--coach-accent)", opacity: 0.85 }}>
              fitness_center
            </span>
            <h3 style={{ margin: 0, fontFamily: "var(--font-head)", fontSize: 18, color: "var(--on-surface)" }}>
              הפוך למאמן
            </h3>
            <p style={{ margin: 0, fontSize: 14, color: "var(--on-surface-var)", maxWidth: 300, lineHeight: 1.6 }}>
              פתח מרחב מאמן כדי להזמין מתאמנים, לצפות בנתוני התזונה שלהם ולהגדיר להם יעדים.
            </p>
            <button
              type="button"
              className="primary"
              style={{ background: "var(--coach-accent)", marginTop: 4 }}
              onClick={onActivateCoach}
            >
              <span className="material-symbols-outlined">add_circle</span>
              הפעל מרחב מאמן
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (selectedTrainee) {
    return (
      <TraineeDashboard
        trainee={selectedTrainee}
        onBack={() => setSelectedTrainee(null)}
      />
    );
  }

  const pendingInvitations = coachInvitations.filter((i) => i.status === "pending");

  return (
    <div className="page-container">
      {error && (
        <div className="section" style={{ background: "#fce8e8", borderColor: "#f5c6c6" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 14, color: "var(--danger)" }}>{error}</span>
            <button type="button" className="ghost" onClick={clearError} style={{ padding: "2px 8px" }}>סגור</button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="page-hero animate-enter">
        <span className="material-symbols-outlined" style={{ fontSize: 40, color: "var(--coach-accent)" }}>
          supervisor_account
        </span>
        <div>
          <h2 className="page-title" style={{ color: "var(--coach-accent)" }}>מרחב מאמן</h2>
          <p className="page-subtitle">{coachProfile?.bio ?? "ניהול מתאמנים"}</p>
        </div>
        <button
          type="button"
          className="primary"
          style={{ background: "var(--coach-accent)", marginRight: "auto" }}
          onClick={() => setShowInviteModal(true)}
        >
          <span className="material-symbols-outlined">person_add</span>
          הזמן מתאמן
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 4 }}>
        <StatCard icon="group" value={trainees.length} label="מתאמנים פעילים" />
        <StatCard icon="schedule" value={pendingInvitations.length} label="הזמנות ממתינות" />
      </div>

      {/* Active trainees */}
      <div className="section animate-enter" style={{ animationDelay: "80ms" }}>
        <h2 style={{ marginBottom: 14 }}>
          <span className="material-symbols-outlined">group</span>
          המתאמנים שלי
        </h2>

        {traineesLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[1, 2, 3].map((n) => <LoadingSkeleton key={n} height={68} borderRadius={14} />)}
          </div>
        ) : trainees.length === 0 ? (
          <EmptyState
            icon="group_off"
            title="אין מתאמנים עדיין"
            message="שלח הזמנה למתאמן הראשון שלך"
            action={
              <button type="button" className="primary" style={{ background: "var(--coach-accent)" }} onClick={() => setShowInviteModal(true)}>
                הזמן מתאמן
              </button>
            }
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {trainees.map((trainee) => (
              <button
                key={trainee.trainee_id}
                type="button"
                className="premium-card"
                style={{ border: "none", cursor: "pointer", textAlign: "right", padding: "14px 16px", display: "flex", alignItems: "center", gap: 14 }}
                onClick={() => setSelectedTrainee(trainee)}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: "50%",
                  background: "var(--coach-soft)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0
                }}>
                  <span className="material-symbols-outlined" style={{ color: "var(--coach-accent)", fontSize: 24 }}>person</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{trainee.username}</div>
                  <div style={{ fontSize: 12, color: "var(--on-surface-var)", marginTop: 2 }}>{trainee.email}</div>
                </div>
                <StatusBadge status="active" />
                <span className="material-symbols-outlined" style={{ color: "var(--outline)", fontSize: 20 }}>chevron_left</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Pending invitations */}
      {coachInvitations.length > 0 && (
        <div className="section animate-enter" style={{ animationDelay: "160ms" }}>
          <h2 style={{ marginBottom: 14 }}>
            <span className="material-symbols-outlined">mail</span>
            הזמנות שנשלחו
          </h2>
          {invitationsLoading ? (
            <LoadingSkeleton height={50} borderRadius={12} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {coachInvitations.slice(0, 10).map((inv) => (
                <div key={inv.id} className="premium-card" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{inv.trainee_email}</div>
                    <div style={{ fontSize: 12, color: "var(--on-surface-var)", marginTop: 2 }}>
                      {new Date(inv.created_at).toLocaleDateString("he-IL")}
                    </div>
                  </div>
                  <StatusBadge status={inv.status} />
                  {inv.status === "pending" && (
                    <button
                      type="button"
                      className="ghost"
                      style={{ fontSize: 12, padding: "4px 10px" }}
                      onClick={() => void cancelCoachInvitation(inv.id)}
                    >
                      בטל
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showInviteModal && (
        <InviteTraineeModal
          onClose={() => setShowInviteModal(false)}
          onSend={async (email, message) => {
            await sendCoachInvitation(email, message);
            setShowInviteModal(false);
          }}
        />
      )}
    </div>
  );
}
