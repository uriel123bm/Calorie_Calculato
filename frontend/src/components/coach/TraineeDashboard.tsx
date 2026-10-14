import { useCallback, useEffect, useRef, useState } from "react";
import { useCoach } from "../../hooks/useCoach";
import { AnimatedProgressRing, EmptyState, LoadingSkeleton, StatCard } from "../ui";
import type { TraineeListItem } from "../../services/coachApi";
import { listGoalsForTrainee, proposeGoal } from "../../services/coachApi";
import type { CoachingGoal } from "../../services/coachApi";
import { TraineeWeeklyReport } from "./TraineeWeeklyReport";
import { TraineeProgressView } from "./TraineeProgressView";
import { NotifyTraineeModal } from "./NotifyTraineeModal";

interface TraineeDashboardProps {
  trainee: TraineeListItem;
  onBack: () => void;
}

interface DailyTrackerData {
  entries?: Array<{ name?: string; calories?: number; protein?: number; carbohydrates?: number; fat?: number }>;
  targetCalories?: number;
  stepsToday?: number;
  stepsGoal?: number;
}

function parseSyncData(json: string | null): unknown {
  if (!json) return null;
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return null;
  }
}

export function TraineeDashboard({ trainee, onBack }: TraineeDashboardProps) {
  const { traineeSync, traineeSyncLoading, loadTraineeSync } = useCoach();
  const [view, setView] = useState<"today" | "weekly" | "progress">("today");
  const [showNotify, setShowNotify] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [goals, setGoals] = useState<CoachingGoal[]>([]);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalType, setGoalType] = useState<"calories" | "protein" | "carbs" | "fat" | "steps">("calories");
  const [goalValue, setGoalValue] = useState("");
  const [goalNote, setGoalNote] = useState("");
  const [goalLoading, setGoalLoading] = useState(false);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadTraineeSync(trainee.trainee_id);
    setLastRefreshed(new Date());
    setIsRefreshing(false);
  }, [trainee.trainee_id, loadTraineeSync]);

  useEffect(() => {
    void refresh();
    listGoalsForTrainee(trainee.trainee_id)
      .then(setGoals)
      .catch(() => {});

    // Auto-refresh every 2 minutes while the coach has this dashboard open
    intervalRef.current = setInterval(() => { void refresh(); }, 120_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [trainee.trainee_id, refresh]);

  const trackerData = parseSyncData(traineeSync?.tracker ?? null) as DailyTrackerData | null;
  const entries = trackerData?.entries ?? [];
  const target = trackerData?.targetCalories ?? 0;
  const stepsToday = trackerData?.stepsToday ?? 0;
  const stepsGoal = trackerData?.stepsGoal ?? 10000;
  const totalCals = entries.reduce((s, e) => s + (e.calories ?? 0), 0);
  const totalProtein = entries.reduce((s, e) => s + (e.protein ?? 0), 0);
  const totalCarbs = entries.reduce((s, e) => s + (e.carbohydrates ?? 0), 0);
  const totalFat = entries.reduce((s, e) => s + (e.fat ?? 0), 0);
  const progressPct = target > 0 ? Math.min((totalCals / target) * 100, 100) : 0;
  const stepsPct = stepsGoal > 0 ? Math.min((stepsToday / stepsGoal) * 100, 100) : 0;

  const handleProposeGoal = async () => {
    const value = parseFloat(goalValue);
    if (isNaN(value) || value <= 0) return;
    setGoalLoading(true);
    try {
      const unit = goalType === "calories" ? "kcal" : goalType === "steps" ? "צעדים" : "g";
      const newGoal = await proposeGoal(trainee.trainee_id, {
        goal_type: goalType,
        target_value: value,
        unit,
        note: goalNote || undefined,
      });
      setGoals((prev) => [newGoal, ...prev]);
      setShowGoalForm(false);
      setGoalValue("");
      setGoalNote("");
    } catch {
      // error handled by hook
    } finally {
      setGoalLoading(false);
    }
  };

  return (
    <div className="page-container">
      {showNotify && (
        <NotifyTraineeModal
          traineeId={trainee.trainee_id}
          traineeName={trainee.username}
          onClose={() => setShowNotify(false)}
        />
      )}

      {/* Back header */}
      <div className="page-hero animate-enter" style={{ gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          className="ghost"
          onClick={onBack}
          aria-label="חזרה לרשימת מתאמנים"
          style={{ padding: "6px 10px" }}
        >
          <span className="material-symbols-outlined">arrow_forward</span>
        </button>
        <div style={{ marginRight: "auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {lastRefreshed && (
            <span style={{ fontSize: 11, color: "var(--on-surface-var)" }}>
              עודכן: {lastRefreshed.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            type="button"
            className="ghost"
            onClick={() => void refresh()}
            disabled={isRefreshing}
            aria-label="רענן נתונים"
            style={{ padding: "5px 10px", fontSize: 12 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16, animation: isRefreshing ? "spin 1s linear infinite" : "none" }}>
              refresh
            </span>
            {isRefreshing ? "טוען..." : "רענן"}
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => setShowNotify(true)}
            style={{ background: "var(--coach-accent)", fontSize: 13, padding: "6px 14px" }}
            title="שלח התראה למתאמן"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>notifications_active</span>
            שלח התראה
          </button>
        </div>
        <div
          style={{
            width: 44, height: 44, borderRadius: "50%",
            background: "var(--coach-soft)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
          }}
        >
          <span className="material-symbols-outlined" style={{ color: "var(--coach-accent)" }}>person</span>
        </div>
        <div>
          <h2 className="page-title" style={{ color: "var(--coach-accent)" }}>{trainee.username}</h2>
          <p className="page-subtitle">{trainee.email}</p>
        </div>
      </div>

      {/* View switcher */}
      <div style={{ display: "flex", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
        {(["today", "weekly", "progress"] as const).map((v) => (
          <button
            key={v}
            type="button"
            className={view === v ? "primary" : "ghost"}
            style={view === v
              ? { background: "var(--coach-accent)", fontSize: 13, padding: "6px 16px" }
              : { fontSize: 13, padding: "6px 16px" }}
            onClick={() => setView(v)}
          >
            {v === "today" ? "תזונה היום" : v === "weekly" ? "שבועי" : "גוף והתקדמות"}
          </button>
        ))}
      </div>

      {traineeSyncLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <LoadingSkeleton height={160} borderRadius={20} />
          <LoadingSkeleton height={80} borderRadius={16} />
          <LoadingSkeleton height={120} borderRadius={16} />
        </div>
      ) : view === "progress" ? (
        <TraineeProgressView
          sync={traineeSync ?? { tracker: null, history: null, meals: null, body: null, personal_plan: null, updated_at: null }}
          username={trainee.username}
        />
      ) : view === "weekly" ? (
        <TraineeWeeklyReport sync={traineeSync ?? { tracker: null, history: null, meals: null, body: null, personal_plan: null, updated_at: null }} targetCalories={target} />
      ) : !traineeSync || entries.length === 0 ? (
        <EmptyState
          icon="nutrition"
          title="אין נתוני תזונה להיום"
          message="המתאמן טרם רשם ארוחות להיום"
        />
      ) : (
        <>
          {/* Today's calorie summary */}
          <div className="section animate-enter" style={{ background: "var(--coach-soft)", borderColor: "var(--coach-border)" }}>
            <h2 style={{ color: "var(--coach-accent)", marginBottom: 16 }}>
              <span className="material-symbols-outlined">today</span>
              סיכום יומי — היום
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
              <AnimatedProgressRing
                value={progressPct}
                max={100}
                size={110}
                color="var(--coach-accent)"
                trackColor="var(--coach-border)"
                label={`${Math.round(totalCals)}`}
                ariaLabel={`${Math.round(totalCals)} קלוריות מתוך ${target}`}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 13, color: "var(--on-surface-var)" }}>קלוריות שנצרכו</div>
                <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "var(--font-head)", color: "var(--coach-accent)" }}>
                  {Math.round(totalCals).toLocaleString("he-IL")}
                </div>
                {target > 0 && (
                  <div style={{ fontSize: 13, color: "var(--on-surface-var)" }}>
                    יעד: {target.toLocaleString("he-IL")} קלוריות
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Macro + steps stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, animation: "slide-up-fade 300ms var(--ease-spring) 80ms both" }}>
            <StatCard icon="egg" value={Math.round(totalProtein)} label="חלבון (גרם)" />
            <StatCard icon="bakery_dining" value={Math.round(totalCarbs)} label="פחמימות (גרם)" />
            <StatCard icon="opacity" value={Math.round(totalFat)} label="שומן (גרם)" />
            <StatCard
              icon="directions_walk"
              value={stepsToday.toLocaleString("he-IL")}
              label={`צעדים (יעד: ${stepsGoal.toLocaleString("he-IL")})`}
              trendDir={stepsPct >= 100 ? "up" : "neutral"}
              trend={stepsPct >= 100 ? "✓ יעד הושג" : `${Math.round(stepsPct)}%`}
            />
          </div>

          {/* Meals logged today */}
          <div className="section animate-enter" style={{ animationDelay: "160ms" }}>
            <h2 style={{ marginBottom: 12 }}>
              <span className="material-symbols-outlined">lunch_dining</span>
              ארוחות שנרשמו ({entries.length})
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {entries.slice(0, 10).map((entry, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 14px", background: "var(--surface-alt)", borderRadius: "var(--radius-xs)"
                  }}
                >
                  <span style={{ fontSize: 14 }}>
                    {(entry as { name?: string }).name ?? "פריט"}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: 14, color: "var(--coach-accent)" }}>
                    {Math.round(entry.calories ?? 0)} קל׳
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Goals section */}
      <div className="section animate-enter" style={{ animationDelay: "240ms" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 style={{ margin: 0 }}>
            <span className="material-symbols-outlined">flag</span>
            יעדים שהוצעו
          </h2>
          <button
            type="button"
            className="primary"
            style={{ background: "var(--coach-accent)", fontSize: 13, padding: "6px 14px" }}
            onClick={() => setShowGoalForm(!showGoalForm)}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
            הצע יעד
          </button>
        </div>

        {showGoalForm && (
          <div style={{ background: "var(--coach-soft)", borderRadius: "var(--radius-sm)", padding: 16, marginBottom: 14, border: "1px solid var(--coach-border)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                סוג יעד
                <select
                  value={goalType}
                  onChange={(e) => setGoalType(e.target.value as typeof goalType)}
                  style={{ marginTop: 6, display: "block", width: "100%" }}
                >
                  <option value="calories">קלוריות יומיות</option>
                  <option value="protein">חלבון (גרם)</option>
                  <option value="carbs">פחמימות (גרם)</option>
                  <option value="fat">שומן (גרם)</option>
                  <option value="steps">צעדים יומיים</option>
                </select>
              </label>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                ערך יעד
                <input
                  type="number"
                  value={goalValue}
                  onChange={(e) => setGoalValue(e.target.value)}
                  placeholder="לדוגמה: 2000"
                  min={0}
                  style={{ marginTop: 6 }}
                />
              </label>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                הערה (אופציונלי)
                <input
                  type="text"
                  value={goalNote}
                  onChange={(e) => setGoalNote(e.target.value)}
                  placeholder="הסבר קצר למתאמן..."
                  maxLength={500}
                  style={{ marginTop: 6 }}
                />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="ghost" onClick={() => setShowGoalForm(false)}>ביטול</button>
                <button
                  type="button"
                  className="primary"
                  style={{ background: "var(--coach-accent)" }}
                  disabled={!goalValue || goalLoading}
                  onClick={() => void handleProposeGoal()}
                >
                  {goalLoading ? "שומר..." : "הצע יעד"}
                </button>
              </div>
            </div>
          </div>
        )}

        {goals.length === 0 ? (
          <EmptyState icon="flag_off" title="אין יעדים עדיין" message="הצע יעד ראשון למתאמן זה" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {goals.map((goal) => (
              <div
                key={goal.id}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "10px 14px", background: "var(--surface-card)", borderRadius: "var(--radius-xs)",
                  border: "1px solid var(--border)"
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {{
                      calories: "קלוריות יומיות",
                      protein: "חלבון",
                      carbs: "פחמימות",
                      fat: "שומן",
                      consistency: "עקביות דיווח",
                      steps: "צעדים יומיים",
                    }[goal.goal_type] ?? goal.goal_type}
                    {" "}{goal.target_value.toLocaleString("he-IL")} {goal.unit}
                  </div>
                  {goal.note && <div style={{ fontSize: 12, color: "var(--on-surface-var)", marginTop: 2 }}>{goal.note}</div>}
                </div>
                <span
                  className={`status-badge status-badge--${goal.status === "proposed" ? "pending" : goal.status === "accepted" ? "accepted" : "rejected"}`}
                  style={{ fontSize: 11 }}
                >
                  {goal.status === "proposed" ? "ממתין לאישור" : goal.status === "accepted" ? "אושר" : "נדחה"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
