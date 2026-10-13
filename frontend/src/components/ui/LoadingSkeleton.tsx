interface LoadingSkeletonProps {
  width?: number | string;
  height?: number | string;
  borderRadius?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

import type React from "react";

export function LoadingSkeleton({
  width = "100%",
  height = 20,
  borderRadius = 10,
  className = "",
  style,
}: LoadingSkeletonProps) {
  return (
    <div
      className={`skeleton ${className}`.trim()}
      style={{
        width,
        height,
        borderRadius,
        ...style,
      }}
      aria-hidden="true"
    />
  );
}

/** A pre-built skeleton for a StatCard */
export function StatCardSkeleton() {
  return (
    <div className="stat-card" style={{ gap: 8 }}>
      <LoadingSkeleton width={36} height={36} borderRadius={10} />
      <LoadingSkeleton width="60%" height={26} borderRadius={8} />
      <LoadingSkeleton width="80%" height={14} borderRadius={6} />
    </div>
  );
}

/** A pre-built skeleton for a PremiumCard row */
export function CardRowSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="premium-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <LoadingSkeleton key={i} width={i === 0 ? "70%" : "100%"} height={16} borderRadius={6} />
      ))}
    </div>
  );
}
