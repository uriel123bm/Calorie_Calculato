/**
 * Daily step counter.
 *
 * Counts steps from the phone motion sensor while this page is open, and
 * keeps manual entry for the total from Apple Health / Google Fit. Web apps
 * cannot read those health stores in the background.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatedProgressRing } from "./ui/AnimatedProgressRing";

const DEFAULT_GOAL = 10_000;
const AUTO_KEY = "steps-auto-listen";
const STEP_GAP_MS = 320;
const STEP_THRESHOLD = 1.35;

interface StepsWidgetProps {
  stepsToday?: number;
  stepsGoal?: number;
  onSetSteps: (steps: number) => void;
  onSetGoal: (goal: number) => void;
}

type MotionEventWithPermission = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

export function StepsWidget({
  stepsToday = 0,
  stepsGoal = DEFAULT_GOAL,
  onSetSteps,
  onSetGoal,
}: StepsWidgetProps) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState<number | "">(stepsToday);
  const [editGoal, setEditGoal] = useState<number | "">(stepsGoal);
  const [editingGoal, setEditingGoal] = useState(false);
  const [listening, setListening] = useState(false);
  const [sensorNote, setSensorNote] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const liveSteps = useRef(stepsToday);
  const listeningRef = useRef(false);
  const onSetStepsRef = useRef(onSetSteps);

  liveSteps.current = listeningRef.current ? liveSteps.current : stepsToday;
  onSetStepsRef.current = onSetSteps;

  const pct = stepsGoal > 0 ? Math.min((stepsToday / stepsGoal) * 100, 100) : 0;
  const remaining = Math.max(stepsGoal - stepsToday, 0);
  const achieved = stepsToday >= stepsGoal && stepsGoal > 0;

  const applySteps = useCallback((next: number) => {
    const safe = Math.max(0, Math.floor(next));
    liveSteps.current = safe;
    onSetStepsRef.current(safe);
  }, []);

  const stopListening = useCallback(() => {
    listeningRef.current = false;
    setListening(false);
    try {
      localStorage.removeItem(AUTO_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!listening) return;
    let gravity = 9.8;
    let lastStepAt = 0;
    let sawMotion = false;
    const started = Date.now();

    const onMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;
      if (!acc || acc.x == null || acc.y == null || acc.z == null) return;
      sawMotion = true;
      const mag = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
      gravity = gravity * 0.9 + mag * 0.1;
      const linear = mag - gravity;
      const now = Date.now();
      if (linear > STEP_THRESHOLD && now - lastStepAt > STEP_GAP_MS) {
        lastStepAt = now;
        applySteps(liveSteps.current + 1);
      }
    };

    window.addEventListener("devicemotion", onMotion);
    const quietTimer = window.setTimeout(() => {
      if (!sawMotion && Date.now() - started >= 7000) {
        setSensorNote("המכשיר לא שולח נתוני תנועה לדפדפן. אפשר להזין את מספר הצעדים ידנית.");
      }
    }, 8000);

    return () => {
      window.removeEventListener("devicemotion", onMotion);
      window.clearTimeout(quietTimer);
    };
  }, [listening, applySteps]);

  const startListening = useCallback(async () => {
    try {
      const motion = DeviceMotionEvent as MotionEventWithPermission;
      if (typeof motion.requestPermission === "function") {
        const result = await motion.requestPermission();
        if (result !== "granted") {
          setSensorNote("הדפדפן חסם את חיישן התנועה. אפשר להזין צעדים ידנית.");
          return;
        }
      }
      listeningRef.current = true;
      liveSteps.current = stepsToday;
      setListening(true);
      setSensorNote("סופר צעדים כל עוד האפליקציה פתוחה. צעדים שנצברו ברקע באפליקציית הבריאות אפשר להוסיף ידנית.");
      try {
        localStorage.setItem(AUTO_KEY, "1");
      } catch {
        /* ignore */
      }
    } catch {
      setSensorNote("לא ניתן להפעיל ספירה אוטומטית במכשיר הזה. הזינו את הצעדים ידנית.");
    }
  }, [stepsToday]);

  useEffect(() => {
    let enabled = false;
    try {
      enabled = localStorage.getItem(AUTO_KEY) === "1";
    } catch {
      enabled = false;
    }
    const motion = DeviceMotionEvent as MotionEventWithPermission;
    if (enabled && typeof motion.requestPermission !== "function") {
      listeningRef.current = true;
      setListening(true);
      setSensorNote("ספירה אוטומטית פעילה כל עוד האפליקציה פתוחה.");
    }
  }, []);

  const handleSaveSteps = () => {
    if (typeof editVal === "number" && editVal >= 0) applySteps(editVal);
    setEditing(false);
  };

  const handleSaveGoal = () => {
    if (typeof editGoal === "number" && editGoal > 0) onSetGoal(editGoal);
    setEditingGoal(false);
  };

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  return (
    <div className="section animate-enter steps-widget" style={{ animationDelay: "80ms" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 8 }}>
        <h2 style={{ margin: 0 }}>
          <span className="material-symbols-outlined">directions_walk</span>
          צעדים יומיים
        </h2>
        <button
          type="button"
          className="ghost"
          style={{ fontSize: 12, padding: "4px 10px" }}
          onClick={() => {
            setEditGoal(stepsGoal);
            setEditingGoal(true);
          }}
          title="שנה יעד צעדים"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>target</span>
          יעד
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <AnimatedProgressRing
          value={pct}
          max={100}
          size={90}
          strokeWidth={8}
          color={achieved ? "var(--leaf)" : "var(--primary)"}
          label={`${Math.round(pct)}%`}
          ariaLabel={`${stepsToday} צעדים מתוך ${stepsGoal}`}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span
              style={{
                fontFamily: "var(--font-head)",
                fontSize: 32,
                fontWeight: 900,
                letterSpacing: "-1px",
                color: achieved ? "var(--success)" : "var(--on-surface)",
              }}
            >
              {stepsToday.toLocaleString("he-IL")}
            </span>
            <span style={{ fontSize: 13, color: "var(--on-surface-var)", fontWeight: 600 }}>צעדים</span>
          </div>
          <div style={{ fontSize: 13, color: "var(--on-surface-var)", marginTop: 2 }}>
            {achieved ? (
              <span style={{ color: "var(--success)", fontWeight: 700 }}>הגעת ליעד</span>
            ) : (
              <span>
                נותרו {remaining.toLocaleString("he-IL")} צעדים מתוך {stepsGoal.toLocaleString("he-IL")}
              </span>
            )}
          </div>
          {listening && (
            <div style={{ fontSize: 12, color: "var(--primary)", fontWeight: 700, marginTop: 4 }}>
              ספירה אוטומטית פעילה
            </div>
          )}
        </div>
      </div>

      {sensorNote && (
        <p className="hint" style={{ margin: "12px 0 0" }}>
          {sensorNote}
        </p>
      )}

      {editing ? (
        <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
          <input
            ref={inputRef}
            type="number"
            min={0}
            max={100000}
            step={100}
            value={editVal}
            onChange={(e) => setEditVal(e.target.value === "" ? "" : Math.max(0, Math.floor(Number(e.target.value))))}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveSteps();
              if (e.key === "Escape") setEditing(false);
            }}
            style={{ width: 130 }}
            aria-label="מספר צעדים"
          />
          <button type="button" className="primary" style={{ padding: "8px 16px" }} onClick={handleSaveSteps}>
            שמור
          </button>
          <button type="button" className="ghost" onClick={() => setEditing(false)}>
            ביטול
          </button>
        </div>
      ) : (
        <div className="steps-widget__actions">
          <button
            type="button"
            className="primary"
            onClick={() => {
              setEditVal(stepsToday);
              setEditing(true);
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>edit</span>
            עדכן צעדים
          </button>
          <button
            type="button"
            className={listening ? "primary" : "ghost"}
            onClick={() => {
              if (listening) {
                stopListening();
                setSensorNote(null);
              } else {
                void startListening();
              }
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
              {listening ? "stop_circle" : "sensors"}
            </span>
            {listening ? "עצור ספירה" : "ספירה אוטומטית"}
          </button>
          {[1000, 2000, 5000].map((delta) => (
            <button
              key={delta}
              type="button"
              className="ghost"
              onClick={() => applySteps(stepsToday + delta)}
              aria-label={`הוסף ${delta.toLocaleString("he-IL")} צעדים`}
            >
              +{(delta / 1000).toFixed(0)}k
            </button>
          ))}
        </div>
      )}

      {editingGoal && (
        <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>יעד יומי:</span>
          <input
            type="number"
            min={1000}
            max={100000}
            step={1000}
            value={editGoal}
            onChange={(e) =>
              setEditGoal(e.target.value === "" ? "" : Math.max(1000, Math.floor(Number(e.target.value))))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveGoal();
              if (e.key === "Escape") setEditingGoal(false);
            }}
            style={{ width: 120 }}
            aria-label="יעד צעדים יומי"
            autoFocus
          />
          <button type="button" className="primary" style={{ padding: "7px 14px", fontSize: 13 }} onClick={handleSaveGoal}>
            שמור
          </button>
          <button type="button" className="ghost" onClick={() => setEditingGoal(false)}>
            ביטול
          </button>
        </div>
      )}
    </div>
  );
}
