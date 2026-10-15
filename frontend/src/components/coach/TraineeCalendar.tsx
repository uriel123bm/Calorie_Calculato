/**
 * Month calendar for a coach. Each day with meals or steps can be opened
 * to see exactly what the trainee logged.
 */
import { useMemo, useState } from "react";
import type { TraineeSyncBuckets } from "../../services/coachApi";
import { todayStr } from "../../utils/date";
import { coachDayHasData, parseCoachDays, sumMeals, type CoachDay } from "../../utils/coachDays";

const WEEKDAYS = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];
const MONTHS = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

function isoInMonth(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatDayHeading(iso: string): string {
  const [y, m, d] = iso.split("-");
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  const weekday = WEEKDAYS[date.getDay()] ?? "";
  return `${weekday} ${d}/${m}/${y}`;
}

interface Props {
  sync: TraineeSyncBuckets;
}

export function TraineeCalendar({ sync }: Props) {
  const today = todayStr();
  const days = useMemo(() => parseCoachDays(sync), [sync]);
  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(today);

  const year = viewMonth.getFullYear();
  const monthIndex = viewMonth.getMonth();
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();

  const cells = useMemo(() => {
    const out: Array<string | null> = [];
    for (let i = 0; i < firstWeekday; i++) out.push(null);
    for (let day = 1; day <= lastDay; day++) out.push(isoInMonth(year, monthIndex, day));
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [year, monthIndex, lastDay, firstWeekday]);

  const selected: CoachDay | undefined = days.get(selectedDate);
  const totals = sumMeals(selected?.entries ?? []);
  const loggedCount = useMemo(
    () => Array.from(days.values()).filter((day) => coachDayHasData(day)).length,
    [days]
  );
  const thisMonth = new Date();
  const canGoNext =
    year < thisMonth.getFullYear() ||
    (year === thisMonth.getFullYear() && monthIndex < thisMonth.getMonth());

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section className="section journal-calendar-section">
        <h2>
          <span className="material-symbols-outlined">calendar_month</span>
          לוח שנה
        </h2>
        <p className="hint journal-calendar-hint">
          לחצו על יום כדי לראות מה {loggedCount > 0 ? "המתאמן אכל ודיווח" : "נרשם"}. ימים עם דיווח מסומנים.
        </p>

        <div className="journal-cal-nav">
          <button
            type="button"
            className="ghost journal-cal-nav-btn"
            onClick={() => setViewMonth(new Date(year, monthIndex - 1, 1))}
            aria-label="חודש קודם"
          >
            <span className="material-symbols-outlined">chevron_right</span>
          </button>
          <div className="journal-cal-title-wrap">
            <strong className="journal-cal-title">
              {MONTHS[monthIndex]} {year}
            </strong>
            <button
              type="button"
              className="ghost journal-cal-today-link"
              onClick={() => {
                const now = new Date();
                setViewMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                setSelectedDate(today);
              }}
            >
              היום
            </button>
          </div>
          <button
            type="button"
            className="ghost journal-cal-nav-btn"
            onClick={() => canGoNext && setViewMonth(new Date(year, monthIndex + 1, 1))}
            aria-label="חודש הבא"
            disabled={!canGoNext}
          >
            <span className="material-symbols-outlined">chevron_left</span>
          </button>
        </div>

        <div className="journal-cal-weekdays" aria-hidden="true">
          {WEEKDAYS.map((label) => (
            <div key={label} className="journal-cal-weekday">
              {label}
            </div>
          ))}
        </div>

        <div className="journal-cal-grid" role="grid" aria-label="לוח שנה של המתאמן">
          {cells.map((date, idx) => {
            if (!date) {
              return <div key={`pad-${idx}`} className="journal-cal-day journal-cal-day--empty" />;
            }
            const day = days.get(date);
            const hasData = coachDayHasData(day);
            const isFuture = date > today;
            const isSelected = date === selectedDate;
            return (
              <button
                key={date}
                type="button"
                className={[
                  "journal-cal-day",
                  hasData ? "journal-cal-day--data" : "",
                  date === today ? "journal-cal-day--today" : "",
                  isSelected ? "journal-cal-day--selected" : "",
                ].filter(Boolean).join(" ")}
                disabled={isFuture}
                aria-pressed={isSelected}
                aria-label={formatDayHeading(date)}
                onClick={() => setSelectedDate(date)}
              >
                <span className="journal-cal-day-num">{Number(date.slice(8, 10))}</span>
                {hasData && <span className="journal-cal-dot" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </section>

      <section className="section" aria-live="polite">
        <h2>
          <span className="material-symbols-outlined">restaurant</span>
          {formatDayHeading(selectedDate)}
          {selectedDate === today ? " · היום" : ""}
        </h2>

        {!coachDayHasData(selected) ? (
          <p className="hint" style={{ margin: 0 }}>
            אין דיווח ארוחות או צעדים ביום הזה.
          </p>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 14 }}>
              <div className="stat-card" style={{ textAlign: "center" }}>
                <div className="stat-card__value" style={{ fontSize: 22 }}>
                  {Math.round(totals.calories).toLocaleString("he-IL")}
                </div>
                <div className="stat-card__label">
                  קלוריות{selected?.targetCalories ? ` / ${selected.targetCalories.toLocaleString("he-IL")}` : ""}
                </div>
              </div>
              <div className="stat-card" style={{ textAlign: "center" }}>
                <div className="stat-card__value" style={{ fontSize: 22 }}>
                  {(selected?.stepsToday ?? 0).toLocaleString("he-IL")}
                </div>
                <div className="stat-card__label">
                  צעדים{selected?.stepsGoal ? ` / ${selected.stepsGoal.toLocaleString("he-IL")}` : ""}
                </div>
              </div>
              <div className="stat-card" style={{ textAlign: "center" }}>
                <div className="stat-card__value" style={{ fontSize: 20 }}>{Math.round(totals.protein)}g</div>
                <div className="stat-card__label">חלבון</div>
              </div>
              <div className="stat-card" style={{ textAlign: "center" }}>
                <div className="stat-card__value" style={{ fontSize: 20 }}>{Math.round(totals.carbohydrates)}g</div>
                <div className="stat-card__label">פחמימות</div>
              </div>
            </div>

            {selected && selected.entries.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {selected.entries.map((meal, i) => (
                  <div
                    key={`${meal.name}-${i}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "center",
                      padding: "10px 14px",
                      background: "var(--surface-alt)",
                      borderRadius: "var(--radius-xs)",
                    }}
                  >
                    <span style={{ fontSize: 14 }}>{meal.name}</span>
                    <span style={{ fontWeight: 700, fontSize: 14, color: "var(--coach-accent)", whiteSpace: "nowrap" }}>
                      {Math.round(meal.calories).toLocaleString("he-IL")} קל׳
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="hint" style={{ margin: 0 }}>אין ארוחות ביום הזה. נרשמו צעדים בלבד.</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
