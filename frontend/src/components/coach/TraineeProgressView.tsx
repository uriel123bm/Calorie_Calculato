/**
 * Comprehensive trainee progress view for coaches.
 * Shows body weight trends, circumference measurements, BMI, goal progress,
 * and workout history — all from the trainee's synced data blobs.
 */
import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Area,
  AreaChart,
} from "recharts";
import { EmptyState, StatCard } from "../ui";
import type { TraineeSyncBuckets } from "../../services/coachApi";

// ── Types (mirror frontend/src/types/index.ts) ─────────────
interface BodyCircumferences {
  waistCm?: number;
  hipsCm?: number;
  chestCm?: number;
}
interface WeightLogEntry {
  date: string;
  weightKg: number;
  circumferences?: BodyCircumferences;
}
interface BodyMetrics {
  name?: string;
  heightCm: number;
  startWeightKg: number;
  currentWeightKg: number;
  age?: number;
  sex?: "male" | "female" | "other";
  goal?: "lose" | "cut" | "maintain" | "gain";
  goalWeightKg?: number;
  log: WeightLogEntry[];
}
interface WorkoutEntry {
  id: string;
  type: string;
  durationMin: number;
  date: string;
}
interface WorkoutSync {
  entries?: WorkoutEntry[];
  targetSessions?: number;
}

// ── Helpers ────────────────────────────────────────────────
function parse<T>(json: string | null | undefined): T | null {
  if (!json) return null;
  try { return JSON.parse(json) as T; } catch { return null; }
}

function calcBmi(weightKg: number, heightCm: number): number | null {
  if (heightCm <= 0 || weightKg <= 0) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

function bmiLabel(bmi: number): { text: string; color: string } {
  if (bmi < 18.5) return { text: "תת-משקל", color: "#2196f3" };
  if (bmi < 25) return { text: "תקין ✓", color: "#4caf50" };
  if (bmi < 30) return { text: "עודף משקל", color: "#ff9800" };
  return { text: "השמנה", color: "#f44336" };
}

const GOAL_LABELS: Record<string, string> = {
  lose: "ירידה במשקל",
  cut: "חיטוב",
  maintain: "שמירה על משקל",
  gain: "עלייה במסה",
};

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("he-IL", { day: "numeric", month: "short" });
}

interface Props {
  sync: TraineeSyncBuckets;
  username: string;
}

export function TraineeProgressView({ sync, username }: Props) {
  const body = parse<BodyMetrics>(sync.body);
  const workoutSync = parse<WorkoutSync>(sync.workouts ?? null);

  // Build chart data from weight log (last 90 days)
  const weightChartData = useMemo(() => {
    if (!body?.log?.length) return [];
    return [...body.log]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-90)
      .map((entry) => ({
        date: fmtDate(entry.date),
        rawDate: entry.date,
        weight: entry.weightKg,
        waist: entry.circumferences?.waistCm,
        hips: entry.circumferences?.hipsCm,
        chest: entry.circumferences?.chestCm,
      }));
  }, [body]);

  // Circumference chart data (filter entries that have measurements)
  const circChartData = useMemo(() => {
    return weightChartData.filter(
      (d) => d.waist != null || d.hips != null || d.chest != null
    );
  }, [weightChartData]);

  // Workout sessions in last 30 days
  const recentWorkouts = useMemo(() => {
    const entries = workoutSync?.entries ?? [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutStr = cutoff.toISOString().slice(0, 10);
    return entries
      .filter((w) => w.date >= cutStr)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10);
  }, [workoutSync]);

  if (!body) {
    return (
      <EmptyState
        icon="monitor_weight"
        title="אין נתוני התקדמות"
        message={`${username} עדיין לא הגדיר נתוני גוף ומדידות`}
      />
    );
  }

  const latestEntry = body.log?.[body.log.length - 1];
  const firstEntry = body.log?.[0];
  const weightChange = latestEntry && firstEntry
    ? Math.round((latestEntry.weightKg - firstEntry.weightKg) * 10) / 10
    : null;
  const bmi = calcBmi(body.currentWeightKg, body.heightCm);
  const bmiInfo = bmi ? bmiLabel(bmi) : null;
  const latestCirc = latestEntry?.circumferences;
  const goalDelta = body.goalWeightKg
    ? Math.round((body.currentWeightKg - body.goalWeightKg) * 10) / 10
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Profile summary */}
      <div className="section animate-enter" style={{ background: "linear-gradient(135deg, #f0f7ff 0%, #e8f5e9 100%) !important" }}>
        <h2>
          <span className="material-symbols-outlined">person</span>
          פרופיל גוף — {username}
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px,1fr))", gap: 10 }}>
          <div style={statBoxStyle}>
            <div style={statLabelStyle}>גובה</div>
            <div style={statValueStyle}>{body.heightCm} ס"מ</div>
          </div>
          <div style={statBoxStyle}>
            <div style={statLabelStyle}>משקל נוכחי</div>
            <div style={{ ...statValueStyle, color: "var(--primary)" }}>{body.currentWeightKg} ק"ג</div>
          </div>
          <div style={statBoxStyle}>
            <div style={statLabelStyle}>משקל התחלתי</div>
            <div style={statValueStyle}>{body.startWeightKg} ק"ג</div>
          </div>
          {body.goalWeightKg && (
            <div style={statBoxStyle}>
              <div style={statLabelStyle}>משקל מטרה</div>
              <div style={{ ...statValueStyle, color: "var(--leaf)" }}>{body.goalWeightKg} ק"ג</div>
            </div>
          )}
          {bmi && (
            <div style={statBoxStyle}>
              <div style={statLabelStyle}>BMI</div>
              <div style={{ ...statValueStyle, color: bmiInfo?.color }}>{bmi}</div>
              <div style={{ fontSize: 11, color: bmiInfo?.color, fontWeight: 600 }}>{bmiInfo?.text}</div>
            </div>
          )}
          {body.goal && (
            <div style={statBoxStyle}>
              <div style={statLabelStyle}>מטרה</div>
              <div style={{ ...statValueStyle, fontSize: 13 }}>{GOAL_LABELS[body.goal] ?? body.goal}</div>
            </div>
          )}
        </div>
      </div>

      {/* Weight change stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px,1fr))", gap: 10 }}>
        <StatCard
          icon="monitor_weight"
          value={`${body.currentWeightKg}`}
          label="משקל נוכחי"
          unit="ק״ג"
        />
        {weightChange !== null && (
          <StatCard
            icon={weightChange <= 0 ? "trending_down" : "trending_up"}
            value={`${weightChange > 0 ? "+" : ""}${weightChange}`}
            label="שינוי משקל כולל"
            unit="ק״ג"
            trendDir={weightChange < 0 ? "up" : weightChange > 0 ? "down" : "neutral"}
            trend={weightChange < 0 ? "ירידה" : weightChange > 0 ? "עלייה" : "ללא שינוי"}
          />
        )}
        {goalDelta !== null && (
          <StatCard
            icon="flag"
            value={`${Math.abs(goalDelta)}`}
            label={goalDelta > 0 ? "מעל למטרה" : goalDelta < 0 ? "מתחת למטרה" : "הגיע למטרה!"}
            unit="ק״ג"
            trendDir={goalDelta <= 0 ? "up" : "neutral"}
          />
        )}
        <StatCard
          icon="fitness_center"
          value={recentWorkouts.length}
          label="אימונים (30 יום)"
        />
      </div>

      {/* Weight chart */}
      {weightChartData.length > 1 ? (
        <div className="section animate-enter" style={{ animationDelay: "80ms" }}>
          <h2>
            <span className="material-symbols-outlined">show_chart</span>
            גרף משקל לאורך זמן
          </h2>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={weightChartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0f5238" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#0f5238" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--on-surface-var)" }} axisLine={false} tickLine={false} />
              <YAxis
                domain={["auto", "auto"]}
                tick={{ fontSize: 10, fill: "var(--on-surface-var)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${v}`}
              />
              <Tooltip
                formatter={(v: unknown) => `${v as number} ק"ג`}
                contentStyle={{ fontSize: 13, borderRadius: 12, border: "1px solid var(--border)" }}
              />
              {body.goalWeightKg && (
                <ReferenceLine
                  y={body.goalWeightKg}
                  stroke="var(--leaf)"
                  strokeDasharray="6 3"
                  label={{ value: `מטרה ${body.goalWeightKg}`, position: "insideTopLeft", fontSize: 11, fill: "var(--leaf)" }}
                />
              )}
              <Area
                type="monotone"
                dataKey="weight"
                stroke="var(--primary)"
                strokeWidth={2.5}
                fill="url(#weightGrad)"
                dot={{ r: 3, fill: "var(--primary)", strokeWidth: 0 }}
                activeDot={{ r: 5, fill: "var(--primary)" }}
              />
            </AreaChart>
          </ResponsiveContainer>
          {body.goalWeightKg && (
            <p style={{ fontSize: 12, color: "var(--on-surface-var)", margin: "8px 0 0", textAlign: "center" }}>
              קו מקווקו = משקל מטרה ({body.goalWeightKg} ק"ג)
            </p>
          )}
        </div>
      ) : weightChartData.length === 1 ? (
        <div className="section" style={{ textAlign: "center", padding: "20px 16px" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 36, color: "var(--outline-var)" }}>timeline</span>
          <p style={{ fontSize: 14, color: "var(--on-surface-var)", margin: "8px 0 0" }}>
            מדידה אחת בלבד — הגרף יופיע לאחר מדידה נוספת
          </p>
        </div>
      ) : null}

      {/* Latest measurements */}
      {latestCirc && (latestCirc.waistCm || latestCirc.hipsCm || latestCirc.chestCm) && (
        <div className="section animate-enter" style={{ animationDelay: "120ms" }}>
          <h2>
            <span className="material-symbols-outlined">straighten</span>
            היקפים אחרונים
            <span style={{ fontSize: 12, fontWeight: 400, color: "var(--on-surface-var)", marginRight: 8 }}>
              {latestEntry ? fmtDate(latestEntry.date) : ""}
            </span>
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
            {latestCirc.waistCm && (
              <div style={{ ...statBoxStyle, borderRight: "3px solid #ff9800" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#ff9800" }}>crop_free</span>
                <div style={statLabelStyle}>מותניים</div>
                <div style={{ ...statValueStyle, color: "#f57c00" }}>{latestCirc.waistCm} ס"מ</div>
              </div>
            )}
            {latestCirc.hipsCm && (
              <div style={{ ...statBoxStyle, borderRight: "3px solid #9c27b0" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#9c27b0" }}>accessibility</span>
                <div style={statLabelStyle}>ירכיים</div>
                <div style={{ ...statValueStyle, color: "#7b1fa2" }}>{latestCirc.hipsCm} ס"מ</div>
              </div>
            )}
            {latestCirc.chestCm && (
              <div style={{ ...statBoxStyle, borderRight: "3px solid #2196f3" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: "#2196f3" }}>self_improvement</span>
                <div style={statLabelStyle}>חזה</div>
                <div style={{ ...statValueStyle, color: "#1976d2" }}>{latestCirc.chestCm} ס"מ</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Circumference chart */}
      {circChartData.length > 1 && (
        <div className="section animate-enter" style={{ animationDelay: "160ms" }}>
          <h2>
            <span className="material-symbols-outlined">straighten</span>
            גרף היקפים לאורך זמן
          </h2>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={circChartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--on-surface-var)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "var(--on-surface-var)" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid var(--border)" }}
                formatter={(v: unknown, name: unknown) => [
                  `${v as number} ס"מ`,
                  name === "waist" ? "מותניים" : name === "hips" ? "ירכיים" : "חזה",
                ] as [string, string]}
              />
              {circChartData.some((d) => d.waist) && (
                <Line type="monotone" dataKey="waist" stroke="#ff9800" strokeWidth={2} dot={false} name="waist" />
              )}
              {circChartData.some((d) => d.hips) && (
                <Line type="monotone" dataKey="hips" stroke="#9c27b0" strokeWidth={2} dot={false} name="hips" />
              )}
              {circChartData.some((d) => d.chest) && (
                <Line type="monotone" dataKey="chest" stroke="#2196f3" strokeWidth={2} dot={false} name="chest" />
              )}
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 8 }}>
            {circChartData.some((d) => d.waist) && <span style={{ fontSize: 12, color: "#ff9800" }}>● מותניים</span>}
            {circChartData.some((d) => d.hips) && <span style={{ fontSize: 12, color: "#9c27b0" }}>● ירכיים</span>}
            {circChartData.some((d) => d.chest) && <span style={{ fontSize: 12, color: "#2196f3" }}>● חזה</span>}
          </div>
        </div>
      )}

      {/* Full measurement history table */}
      {body.log && body.log.length > 0 && (
        <div className="section animate-enter" style={{ animationDelay: "200ms" }}>
          <h2>
            <span className="material-symbols-outlined">table_view</span>
            היסטוריית מדידות ({body.log.length})
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--on-surface-var)" }}>
                  <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600 }}>תאריך</th>
                  <th style={{ textAlign: "center", padding: "6px 8px", fontWeight: 600 }}>משקל</th>
                  <th style={{ textAlign: "center", padding: "6px 8px", fontWeight: 600 }}>מותניים</th>
                  <th style={{ textAlign: "center", padding: "6px 8px", fontWeight: 600 }}>ירכיים</th>
                  <th style={{ textAlign: "center", padding: "6px 8px", fontWeight: 600 }}>חזה</th>
                  <th style={{ textAlign: "center", padding: "6px 8px", fontWeight: 600 }}>שינוי</th>
                </tr>
              </thead>
              <tbody>
                {[...body.log].reverse().slice(0, 20).map((entry, i, arr) => {
                  const prevEntry = arr[i + 1];
                  const diff = prevEntry
                    ? Math.round((entry.weightKg - prevEntry.weightKg) * 10) / 10
                    : null;
                  return (
                    <tr key={entry.date} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "8px 8px", fontWeight: 500 }}>{fmtDate(entry.date)}</td>
                      <td style={{ textAlign: "center", fontWeight: 700, color: "var(--primary)" }}>
                        {entry.weightKg} ק"ג
                      </td>
                      <td style={{ textAlign: "center", color: "#f57c00" }}>
                        {entry.circumferences?.waistCm ? `${entry.circumferences.waistCm} ס"מ` : "—"}
                      </td>
                      <td style={{ textAlign: "center", color: "#7b1fa2" }}>
                        {entry.circumferences?.hipsCm ? `${entry.circumferences.hipsCm} ס"מ` : "—"}
                      </td>
                      <td style={{ textAlign: "center", color: "#1976d2" }}>
                        {entry.circumferences?.chestCm ? `${entry.circumferences.chestCm} ס"מ` : "—"}
                      </td>
                      <td style={{
                        textAlign: "center",
                        fontWeight: 600,
                        color: diff === null ? "var(--on-surface-var)" :
                          diff < 0 ? "#4caf50" : diff > 0 ? "#f44336" : "var(--on-surface-var)",
                      }}>
                        {diff === null ? "—" : diff === 0 ? "±0" : `${diff > 0 ? "+" : ""}${diff}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Workout sessions */}
      {recentWorkouts.length > 0 && (
        <div className="section animate-enter" style={{ animationDelay: "240ms" }}>
          <h2>
            <span className="material-symbols-outlined">fitness_center</span>
            אימונים אחרונים (30 יום)
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recentWorkouts.map((w) => (
              <div key={w.id} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 14px",
                background: "var(--surface-low)",
                borderRadius: "var(--radius-xs)",
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: "var(--primary-soft)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--primary)" }}>
                    fitness_center
                  </span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{w.type || "אימון"}</div>
                  <div style={{ fontSize: 12, color: "var(--on-surface-var)" }}>{fmtDate(w.date)}</div>
                </div>
                <div style={{
                  fontSize: 13, fontWeight: 700, color: "var(--primary)",
                  background: "var(--primary-soft)", padding: "3px 10px", borderRadius: "var(--radius-pill)",
                }}>
                  {w.durationMin} דק'
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty workout state */}
      {recentWorkouts.length === 0 && (
        <div className="section" style={{ padding: "20px 16px", textAlign: "center" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 36, color: "var(--outline-var)" }}>fitness_center</span>
          <p style={{ fontSize: 13, color: "var(--on-surface-var)", margin: "8px 0 0" }}>
            לא נרשמו אימונים ב-30 הימים האחרונים
          </p>
        </div>
      )}
    </div>
  );
}

// ── Style helpers ─────────────────────────────────────────
const statBoxStyle: React.CSSProperties = {
  background: "var(--surface-low)",
  borderRadius: 14,
  padding: "12px 14px",
  display: "flex",
  flexDirection: "column",
  gap: 4,
  alignItems: "flex-start",
};
const statLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--on-surface-var)",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};
const statValueStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
  fontFamily: "var(--font-head)",
  color: "var(--on-surface)",
  letterSpacing: "-0.5px",
  lineHeight: 1.1,
};
