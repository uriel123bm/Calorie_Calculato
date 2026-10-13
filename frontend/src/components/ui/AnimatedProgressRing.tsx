import { useEffect, useRef } from "react";

interface AnimatedProgressRingProps {
  /** Current value (0–max) */
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  /** Center label — defaults to percentage */
  label?: string;
  /** ARIA label for screen readers */
  ariaLabel?: string;
  className?: string;
}

export function AnimatedProgressRing({
  value,
  max = 100,
  size = 80,
  strokeWidth = 7,
  color = "var(--primary)",
  trackColor = "var(--surface-low)",
  label,
  ariaLabel,
  className = "",
}: AnimatedProgressRingProps) {
  const fillRef = useRef<SVGCircleElement>(null);
  const pct = Math.min(Math.max(value / max, 0), 1);

  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;
  const targetOffset = circumference * (1 - pct);

  useEffect(() => {
    const el = fillRef.current;
    if (!el) return;
    el.style.setProperty("--ring-full", String(circumference));
    el.style.setProperty("--ring-target", String(targetOffset));
    el.style.strokeDasharray = String(circumference);
    el.style.strokeDashoffset = String(targetOffset);
  }, [circumference, targetOffset]);

  const displayLabel = label ?? `${Math.round(pct * 100)}%`;

  return (
    <svg
      className={`progress-ring-svg ${className}`.trim()}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={ariaLabel ?? displayLabel}
    >
      {/* Track */}
      <circle
        className="ring-track"
        cx={cx}
        cy={cy}
        r={r}
        strokeWidth={strokeWidth}
        stroke={trackColor}
      />
      {/* Fill */}
      <circle
        ref={fillRef}
        className="ring-fill"
        cx={cx}
        cy={cy}
        r={r}
        strokeWidth={strokeWidth}
        stroke={color}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ strokeDasharray: circumference, strokeDashoffset: circumference }}
      />
      {/* Centre text */}
      <text
        x={cx}
        y={cy}
        dominantBaseline="central"
        textAnchor="middle"
        fontSize={size * 0.175}
        fontWeight={700}
        fill="currentColor"
        fontFamily="var(--font-head)"
      >
        {displayLabel}
      </text>
    </svg>
  );
}
