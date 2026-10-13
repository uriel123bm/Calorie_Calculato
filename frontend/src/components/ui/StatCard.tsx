interface StatCardProps {
  icon: string;
  value: number | string;
  label: string;
  /** e.g. "+120" or "-30" */
  trend?: string;
  trendDir?: "up" | "down" | "neutral";
  unit?: string;
  className?: string;
}

export function StatCard({ icon, value, label, trend, trendDir = "neutral", unit, className = "" }: StatCardProps) {
  const displayValue =
    typeof value === "number"
      ? value.toLocaleString("he-IL")
      : value;

  return (
    <div className={`stat-card animate-enter ${className}`.trim()}>
      <div className="stat-card__icon">
        <span className="material-symbols-outlined" aria-hidden="true">{icon}</span>
      </div>
      <div className="stat-card__value">
        {displayValue}
        {unit && <span style={{ fontSize: "14px", fontWeight: 500, marginRight: 4, opacity: 0.7 }}>{unit}</span>}
      </div>
      <div className="stat-card__label">{label}</div>
      {trend && (
        <span className={`stat-card__trend stat-card__trend--${trendDir}`}>
          {trendDir === "up" && "↑"}
          {trendDir === "down" && "↓"}
          {trend}
        </span>
      )}
    </div>
  );
}
