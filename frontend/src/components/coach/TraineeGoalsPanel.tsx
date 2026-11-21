/**
 * Trainee-facing list of goals proposed by their coach(es).
 * Accept applies the target into the daily tracker / macro settings.
 */
import { useCoach } from "../../hooks/useCoach";
import { EmptyState, LoadingSkeleton, StatusBadge } from "../ui";
import type { CoachingGoal, GoalType } from "../../services/coachApi";

const GOAL_LABELS: Record<GoalType, string> = {
  calories: "קלוריות יומיות",
  protein: "חלבון",
  carbs: "פחמימות",
  fat: "שומן",
  consistency: "עקביות",
  steps: "צעדים",
};

function formatGoalValue(goal: CoachingGoal): string {
  const n = Math.round(goal.target_value);
  if (goal.goal_type === "calories") return `${n.toLocaleString("he-IL")} קל׳`;
  if (goal.goal_type === "steps") return `${n.toLocaleString("he-IL")} צעדים`;
  return `${n} ${goal.unit || "g"}`;
}

export function TraineeGoalsPanel() {
  const {
    myGoals,
    myGoalsLoading,
    acceptMyGoal,
    rejectMyGoal,
    refreshMyGoals,
    error,
    clearError,
  } = useCoach();

  const proposed = myGoals.filter((g) => g.status === "proposed");
  const recent = myGoals.filter((g) => g.status !== "proposed").slice(0, 5);

  return (
    <div className="section animate-enter">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>
          <span className="material-symbols-outlined">flag</span>
          יעדים מהמאמן
        </h2>
        <button
          type="button"
          className="ghost"
          onClick={() => void refreshMyGoals()}
          aria-label="רענן יעדים"
          style={{ padding: "4px 10px", fontSize: 13 }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
        </button>
      </div>

      {error && (
        <div style={{ background: "#fce8e8", color: "var(--danger)", borderRadius: "var(--radius-xs)", padding: "8px 12px", fontSize: 13, marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
          {error}
          <button type="button" className="ghost" onClick={clearError} style={{ padding: "0 6px" }}>✕</button>
        </div>
      )}

      {myGoalsLoading ? (
        <LoadingSkeleton height={80} borderRadius={14} />
      ) : proposed.length === 0 ? (
        <EmptyState
          icon="flag"
          title="אין יעדים ממתינים"
          message="כשהמאמן יציע יעד, הוא יופיע כאן לאישור"
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {proposed.map((goal) => (
            <div
              key={goal.id}
              className="premium-card"
              style={{ background: "var(--coach-soft)", borderColor: "var(--coach-border)", padding: "14px 16px" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>
                    {GOAL_LABELS[goal.goal_type] ?? goal.goal_type}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "var(--coach-accent)", marginTop: 4 }}>
                    {formatGoalValue(goal)}
                  </div>
                  {goal.note && (
                    <div style={{ fontSize: 13, marginTop: 8, color: "var(--on-surface-var)", fontStyle: "italic" }}>
                      {goal.note}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="primary"
                    style={{ background: "var(--coach-accent)", fontSize: 13, padding: "6px 12px" }}
                    onClick={() => void acceptMyGoal(goal.id)}
                  >
                    אשר
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    style={{ fontSize: 13, padding: "6px 12px", color: "var(--danger)", borderColor: "var(--danger)" }}
                    onClick={() => void rejectMyGoal(goal.id)}
                  >
                    דחה
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--on-surface-var)" }}>יעדים אחרונים</div>
          {recent.map((goal) => (
            <div key={goal.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 13 }}>
              <span>
                {GOAL_LABELS[goal.goal_type] ?? goal.goal_type}: {formatGoalValue(goal)}
              </span>
              <StatusBadge status={goal.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
