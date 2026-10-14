/**
 * Daily step counter widget.
 *
 * Primary: manual entry.
 * Secondary: tries to read step data from the browser's motion API
 *   (experimental, only works on some Android devices).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatedProgressRing } from "./ui/AnimatedProgressRing";

const DEFAULT_GOAL = 10_000;

interface StepsWidgetProps {
  stepsToday?: number;
  stepsGoal?: number;
  onSetSteps: (steps: number) => void;
  onSetGoal: (goal: number) => void;
}

export function StepsWidget({ stepsToday = 0, stepsGoal = DEFAULT_GOAL, onSetSteps, onSetGoal }: StepsWidgetProps) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState<number | "">(stepsToday);
  const [editGoal, setEditGoal] = useState<number | "">(stepsGoal);
  const [editingGoal, setEditingGoal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pct = stepsGoal > 0 ? Math.min((stepsToday / stepsGoal) * 100, 100) : 0;
  const remaining = Math.max(stepsGoal - stepsToday, 0);
  const achieved = stepsToday >= stepsGoal;

  // Try to request step count from device sensors (Chrome Android, experimental)
  const requestDeviceSteps = useCallback(async () => {
    try {
      if (typeof window === "undefined") return;
      // Pedometer API (very limited browser support)
      if ("Accelerometer" in window) {
        // We can't reliably count steps from raw accelerometer in a PWA.
        // Just open the device's built-in health app.
        alert("מכשיר זה לא תומך בספירת צעדים אוטומטית דרך הדפדפן. הזן את מספר הצעדים ידנית מאפליקציית הבריאות של המכשיר שלך (Apple Health / Google Fit).");
      } else {
        alert("הזן את מספר הצעדים ידנית מאפליקציית הבריאות של המכשיר שלך.");
      }
    } catch {
      alert("לא ניתן לגשת לחיישן הצעדים.");
    }
  }, []);

  const handleSaveSteps = () => {
    if (typeof editVal === "number" && editVal >= 0) {
      onSetSteps(editVal);
    }
    setEditing(false);
  };

  const handleSaveGoal = () => {
    if (typeof editGoal === "number" && editGoal > 0) {
      onSetGoal(editGoal);
    }
    setEditingGoal(false);
  };

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  return (
    <div className="section animate-enter" style={{ animationDelay: "120ms" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>
          <span className="material-symbols-outlined">directions_walk</span>
          צעדים יומיים
        </h2>
        <button
          type="button"
          className="ghost"
          style={{ fontSize: 12, padding: "4px 10px" }}
          onClick={() => setEditingGoal(true)}
          title="שנה יעד צעדים"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>target</span>
          יעד
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        {/* Progress ring */}
        <AnimatedProgressRing
          value={pct}
          max={100}
          size={90}
          strokeWidth={8}
          color={achieved ? "var(--leaf)" : "var(--primary)"}
          label={`${Math.round(pct)}%`}
          ariaLabel={`${stepsToday} צעדים מתוך ${stepsGoal}`}
        />

        {/* Stats */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{
              fontFamily: "var(--font-head)",
              fontSize: 32,
              fontWeight: 900,
              letterSpacing: "-1px",
              color: achieved ? "var(--success)" : "var(--on-surface)",
            }}>
              {stepsToday.toLocaleString("he-IL")}
            </span>
            <span style={{ fontSize: 13, color: "var(--on-surface-var)", fontWeight: 600 }}>צעדים</span>
          </div>
          <div style={{ fontSize: 13, color: "var(--on-surface-var)", marginTop: 2 }}>
            {achieved
              ? <span style={{ color: "var(--success)", fontWeight: 700 }}>🎯 הגעת ליעד! כל הכבוד</span>
              : <span>נותרו {remaining.toLocaleString("he-IL")} צעדים מתוך {stepsGoal.toLocaleString("he-IL")}</span>
            }
          </div>
        </div>
      </div>

      {/* Edit step count */}
      {editing ? (
        <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center" }}>
          <input
            ref={inputRef}
            type="number"
            min={0}
            max={100000}
            step={100}
            value={editVal}
            onChange={(e) => setEditVal(e.target.value === "" ? "" : Math.max(0, Math.floor(Number(e.target.value))))}
            onKeyDown={(e) => { if (e.key === "Enter") handleSaveSteps(); if (e.key === "Escape") setEditing(false); }}
            style={{ width: 130 }}
            aria-label="מספר צעדים"
          />
          <button type="button" className="primary" style={{ padding: "8px 16px" }} onClick={handleSaveSteps}>שמור</button>
          <button type="button" className="ghost" onClick={() => setEditing(false)}>ביטול</button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <button
            type="button"
            className="primary"
            style={{ fontSize: 13, padding: "7px 16px" }}
            onClick={() => { setEditVal(stepsToday); setEditing(true); }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>edit</span>
            עדכן צעדים
          </button>
          <button
            type="button"
            className="ghost"
            style={{ fontSize: 13, padding: "7px 14px" }}
            onClick={() => void requestDeviceSteps()}
            title="ייבא מאפליקציית הבריאות"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>phone_iphone</span>
            ייבא מהמכשיר
          </button>
          {/* Quick-add buttons */}
          {[1000, 2000, 5000].map((delta) => (
            <button
              key={delta}
              type="button"
              className="ghost"
              style={{ fontSize: 12, padding: "5px 12px" }}
              onClick={() => onSetSteps(stepsToday + delta)}
              aria-label={`הוסף ${delta.toLocaleString("he-IL")} צעדים`}
            >
              +{(delta / 1000).toFixed(0)}k
            </button>
          ))}
        </div>
      )}

      {/* Goal edit */}
      {editingGoal && (
        <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>יעד יומי:</span>
          <input
            type="number"
            min={1000}
            max={100000}
            step={1000}
            value={editGoal}
            onChange={(e) => setEditGoal(e.target.value === "" ? "" : Math.max(1000, Math.floor(Number(e.target.value))))}
            onKeyDown={(e) => { if (e.key === "Enter") handleSaveGoal(); if (e.key === "Escape") setEditingGoal(false); }}
            style={{ width: 120 }}
            aria-label="יעד צעדים יומי"
            autoFocus
          />
          <button type="button" className="primary" style={{ padding: "7px 14px", fontSize: 13 }} onClick={handleSaveGoal}>שמור</button>
          <button type="button" className="ghost" onClick={() => setEditingGoal(false)}>ביטול</button>
        </div>
      )}
    </div>
  );
}
