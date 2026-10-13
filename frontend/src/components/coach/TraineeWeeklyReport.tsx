/**
 * Weekly nutrition report for a trainee, rendered in the coach's view.
 *
 * Parses the trainee's `history` blob (same format as the app's own
 * daily history) and computes per-day and weekly-aggregate summaries.
 */
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState } from "../ui";
import type { TraineeSyncBuckets } from "../../services/coachApi";

interface DayEntry {
  calories?: number;
  protein?: number;
  carbohydrates?: number;
  fat?: number;
}

interface HistoryBlob {
  [date: string]: {
    entries?: DayEntry[];
    targetCalories?: number;
  };
}

interface ChartDay {
  label: string;
  date: string;
  calories: number;
  target: number;
  protein: number;
  carbs: number;
  fat: number;
  logged: boolean;
}

function parseHistory(json: string | null | undefined): HistoryBlob {
  if (!json) return {};
  try {
    return JSON.parse(json) as HistoryBlob;
  } catch {
    return {};
  }
}

function getLastNDays(n: number): string[] {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

const DAY_NAMES = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];

interface Props {
  sync: TraineeSyncBuckets;
  targetCalories?: number;
}

export function TraineeWeeklyReport({ sync, targetCalories = 0 }: Props) {
  const history = useMemo(() => parseHistory(sync.history), [sync.history]);

  const last7 = useMemo<ChartDay[]>(() => {
    return getLastNDays(7).map((date) => {
      const day = history[date];
      const entries = day?.entries ?? [];
      const logged = entries.length > 0;
      const calories = entries.reduce((s, e) => s + (e.calories ?? 0), 0);
      const protein = entries.reduce((s, e) => s + (e.protein ?? 0), 0);
      const carbs = entries.reduce((s, e) => s + (e.carbohydrates ?? 0), 0);
      const fat = entries.reduce((s, e) => s + (e.fat ?? 0), 0);
      const d = new Date(date + "T00:00:00");
      return {
        label: DAY_NAMES[d.getDay()] ?? date.slice(8),
        date,
        calories: Math.round(calories),
        target: day?.targetCalories ?? targetCalories,
        protein: Math.round(protein),
        carbs: Math.round(carbs),
        fat: Math.round(fat),
        logged,
      };
    });
  }, [history, targetCalories]);

  const loggedDays = last7.filter((d) => d.logged);
  const avgCalories =
    loggedDays.length > 0
      ? Math.round(loggedDays.reduce((s, d) => s + d.calories, 0) / loggedDays.length)
      : 0;
  const adherence = Math.round((loggedDays.length / 7) * 100);

  if (Object.keys(history).length === 0) {
    return (
      <EmptyState
        icon="bar_chart"
        title="אין נתוני היסטוריה"
        message="המתאמן טרם סינכרן נתוני היסטוריה"
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Weekly summary chips */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
        <div className="stat-card" style={{ textAlign: "center" }}>
          <div className="stat-card__value" style={{ fontSize: 22 }}>{loggedDays.length}/7</div>
          <div className="stat-card__label">ימי דיווח</div>
        </div>
        <div className="stat-card" style={{ textAlign: "center" }}>
          <div className="stat-card__value" style={{ fontSize: 22 }}>{adherence}%</div>
          <div className="stat-card__label">עקביות</div>
        </div>
        <div className="stat-card" style={{ textAlign: "center" }}>
          <div className="stat-card__value" style={{ fontSize: 22 }}>{avgCalories.toLocaleString("he-IL")}</div>
          <div className="stat-card__label">ממוצע יומי</div>
        </div>
      </div>

      {/* Calorie bar chart */}
      <div className="section" style={{ padding: "16px 12px" }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
          <span className="material-symbols-outlined" style={{ verticalAlign: "middle", fontSize: 18, marginLeft: 6 }}>bar_chart</span>
          קלוריות — 7 ימים אחרונים
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={last7} margin={{ top: 0, right: 0, left: -20, bottom: 0 }} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--on-surface-var)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "var(--on-surface-var)" }} axisLine={false} tickLine={false} />
            <Tooltip
              formatter={(v: unknown) => `${Number(v ?? 0).toLocaleString("he-IL")} קל׳`}
              contentStyle={{ fontSize: 13, borderRadius: 12, border: "1px solid var(--border)" }}
            />
            <Bar dataKey="calories" radius={[6, 6, 0, 0]}>
              {last7.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.logged ? "var(--coach-accent)" : "var(--surface-low)"}
                  opacity={d.logged ? 1 : 0.5}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Day-by-day breakdown table */}
      <div className="section" style={{ padding: "14px 16px" }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
          <span className="material-symbols-outlined" style={{ verticalAlign: "middle", fontSize: 18, marginLeft: 6 }}>table_view</span>
          פירוט יומי
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--on-surface-var)" }}>
                <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600 }}>יום</th>
                <th style={{ textAlign: "center", padding: "6px 8px", fontWeight: 600 }}>קלוריות</th>
                <th style={{ textAlign: "center", padding: "6px 8px", fontWeight: 600 }}>חלבון</th>
                <th style={{ textAlign: "center", padding: "6px 8px", fontWeight: 600 }}>פח׳</th>
                <th style={{ textAlign: "center", padding: "6px 8px", fontWeight: 600 }}>שומן</th>
              </tr>
            </thead>
            <tbody>
              {last7.map((d, i) => (
                <tr
                  key={i}
                  style={{
                    borderBottom: "1px solid var(--border)",
                    background: d.logged ? "transparent" : "var(--surface-alt)",
                    opacity: d.logged ? 1 : 0.6,
                  }}
                >
                  <td style={{ padding: "8px 8px" }}>
                    {d.label}{" "}
                    <span style={{ fontSize: 11, color: "var(--on-surface-var)" }}>
                      {d.date.slice(8)}/{d.date.slice(5, 7)}
                    </span>
                    {!d.logged && (
                      <span style={{ fontSize: 10, color: "var(--warn)", marginRight: 4 }}>לא דווח</span>
                    )}
                  </td>
                  <td style={{ textAlign: "center", fontWeight: 600, color: d.calories > 0 ? "var(--coach-accent)" : "var(--on-surface-var)" }}>
                    {d.logged ? d.calories.toLocaleString("he-IL") : "—"}
                  </td>
                  <td style={{ textAlign: "center" }}>{d.logged ? `${d.protein}g` : "—"}</td>
                  <td style={{ textAlign: "center" }}>{d.logged ? `${d.carbs}g` : "—"}</td>
                  <td style={{ textAlign: "center" }}>{d.logged ? `${d.fat}g` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
