/**
 * useCoach — central hook for the coaching system.
 *
 * Manages coach profile state, trainee list, invitations (both coach and
 * trainee side), and per-trainee data access.
 *
 * State lives in a single <CoachProvider> so every screen (header, tab badge,
 * dashboard, invitations panel) sees the same coach profile and invitations.
 */
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  activateCoachProfile,
  acknowledgeAccessNotice as ackAccessNoticeApi,
  cancelInvitation,
  deactivateCoachProfile,
  endTraineeRelationship,
  getCoachProfile,
  getTraineeSyncData,
  listAccessNotices,
  listCoachInvitations,
  listMyRelationships,
  listTraineeInvitations,
  listTrainees,
  revokeCoachAccess,
  sendInvitation,
  updateCoachProfile,
  acceptInvitation,
  rejectInvitation,
} from "../services/coachApi";
import type {
  AccessNotice,
  CoachProfile,
  Invitation,
  Relationship,
  TraineeListItem,
  TraineeSyncBuckets,
} from "../services/coachApi";

export type { AccessNotice, CoachProfile, Invitation, Relationship, TraineeListItem, TraineeSyncBuckets };

export interface UseCoachResult {
  // Coach profile
  coachProfile: CoachProfile | null;
  isCoach: boolean;
  profileLoading: boolean;
  activateCoach: (bio?: string) => Promise<void>;
  deactivateCoach: () => Promise<void>;
  updateBio: (bio: string | null) => Promise<void>;

  // Coach's trainee list
  trainees: TraineeListItem[];
  traineesLoading: boolean;
  refreshTrainees: () => Promise<void>;
  /** Coach disconnects a trainee (relationship → ended). */
  removeTrainee: (relationshipId: string) => Promise<void>;

  // Coach invitations (sent by this coach)
  coachInvitations: Invitation[];
  invitationsLoading: boolean;
  sendCoachInvitation: (email: string, message?: string) => Promise<void>;
  /** Pending → cancel; other statuses → remove from the list. */
  cancelCoachInvitation: (id: string) => Promise<void>;
  refreshCoachInvitations: () => Promise<void>;

  // Trainee invitations (received by this user)
  myInvitations: Invitation[];
  myInvitationsLoading: boolean;
  acceptMyInvitation: (id: string) => Promise<void>;
  rejectMyInvitation: (id: string) => Promise<void>;
  refreshMyInvitations: () => Promise<void>;

  // Trainee relationships (active coaches for this user)
  myRelationships: Relationship[];
  revokeMyCoach: (relationshipId: string) => Promise<void>;

  // Selected trainee sync data (coach view)
  traineeSync: TraineeSyncBuckets | null;
  traineeSyncLoading: boolean;
  loadTraineeSync: (traineeId: string) => Promise<void>;

  /** Pending notice that the other party ended access (show modal). */
  pendingAccessNotice: AccessNotice | null;
  acknowledgeAccessNotice: () => Promise<void>;

  error: string | null;
  clearError: () => void;
}

function errorMessage(e: unknown): string {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === "string" && detail ? detail : "שגיאה בלתי צפויה";
}

const NOTICE_POLL_MS = 20_000;

function useCoachState(): UseCoachResult {
  const [coachProfile, setCoachProfile] = useState<CoachProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const [trainees, setTrainees] = useState<TraineeListItem[]>([]);
  const [traineesLoading, setTraineesLoading] = useState(false);

  const [coachInvitations, setCoachInvitations] = useState<Invitation[]>([]);
  const [invitationsLoading, setInvitationsLoading] = useState(false);

  const [myInvitations, setMyInvitations] = useState<Invitation[]>([]);
  const [myInvitationsLoading, setMyInvitationsLoading] = useState(false);

  const [myRelationships, setMyRelationships] = useState<Relationship[]>([]);

  const [traineeSync, setTraineeSync] = useState<TraineeSyncBuckets | null>(null);
  const [traineeSyncLoading, setTraineeSyncLoading] = useState(false);

  const [pendingAccessNotice, setPendingAccessNotice] = useState<AccessNotice | null>(null);
  const [pendingNoticeQueue, setPendingNoticeQueue] = useState<AccessNotice[]>([]);
  const knownNoticeIdsRef = useRef<Set<string>>(new Set());

  const [error, setError] = useState<string | null>(null);

  const isCoach = coachProfile !== null && coachProfile.is_active;

  // For inline actions: report the error in the panel and tell the caller
  // whether to apply the state change.
  const safeCall = useCallback(
    async <T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> => {
      try {
        return { ok: true, value: await fn() };
      } catch (e: unknown) {
        setError(errorMessage(e));
        return { ok: false };
      }
    },
    []
  );

  const refreshTrainees = useCallback(async () => {
    setTraineesLoading(true);
    const res = await safeCall(listTrainees);
    if (res.ok) setTrainees(res.value);
    setTraineesLoading(false);
  }, [safeCall]);

  const applyAccessNotices = useCallback((notices: AccessNotice[]) => {
    if (notices.length === 0) return;
    const fresh = notices.filter((n) => !knownNoticeIdsRef.current.has(n.id));
    for (const n of fresh) knownNoticeIdsRef.current.add(n.id);
    if (fresh.length > 0) {
      setPendingNoticeQueue((prev) => [...prev, ...fresh]);
    }
    // Drop ended pairs from local lists immediately so UI matches the notice.
    for (const notice of notices) {
      if (notice.kind === "coach_removed") {
        setMyRelationships((prev) =>
          prev.map((r) =>
            r.id === notice.relationship_id ? { ...r, status: "ended" as const } : r
          )
        );
      } else if (notice.kind === "trainee_revoked") {
        setTrainees((prev) =>
          prev.filter((t) => t.relationship_id !== notice.relationship_id)
        );
        setTraineeSync(null);
      }
    }
  }, []);

  const refreshAccessNotices = useCallback(async () => {
    try {
      const notices = await listAccessNotices();
      applyAccessNotices(notices);
    } catch {
      /* ignore transient network errors */
    }
  }, [applyAccessNotices]);

  // Promote next queued notice into the visible modal slot.
  useEffect(() => {
    if (pendingAccessNotice || pendingNoticeQueue.length === 0) return;
    const [next, ...rest] = pendingNoticeQueue;
    setPendingAccessNotice(next);
    setPendingNoticeQueue(rest);
  }, [pendingAccessNotice, pendingNoticeQueue]);

  // Load coach profile on mount
  useEffect(() => {
    setProfileLoading(true);
    getCoachProfile()
      .then(setCoachProfile)
      .catch(() => setCoachProfile(null))
      .finally(() => setProfileLoading(false));
  }, []);

  // Load trainee-side data on mount, and again when the app returns to the
  // foreground so new invitations / relationship changes show up.
  // Notices are applied after relationship refresh so list state matches the
  // server, then the modal can still mark rows ended / drop trainees.
  useEffect(() => {
    const load = async () => {
      listTraineeInvitations()
        .then(setMyInvitations)
        .catch(() => {});
      try {
        setMyRelationships(await listMyRelationships());
      } catch {
        /* ignore */
      }
      await refreshAccessNotices();
    };
    void load();
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshAccessNotices();
    }, NOTICE_POLL_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(poll);
    };
  }, [refreshAccessNotices]);

  // Coaches also refresh the trainee list when returning to the app, so a
  // revocation by the trainee removes them without waiting for remount.
  useEffect(() => {
    if (!isCoach) return;
    const load = async () => {
      await refreshTrainees();
      await refreshAccessNotices();
    };
    void load();
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [isCoach, refreshTrainees, refreshAccessNotices]);

  const activateCoach = useCallback(
    async (bio?: string) => {
      // Throws so the activation modal can show the error and stay open.
      setCoachProfile(await activateCoachProfile(bio));
    },
    []
  );

  const deactivateCoach = useCallback(async () => {
    const res = await safeCall(deactivateCoachProfile);
    if (!res.ok) return;
    setCoachProfile(null);
    setTrainees([]);
    setCoachInvitations([]);
  }, [safeCall]);

  const updateBio = useCallback(
    async (bio: string | null) => {
      const res = await safeCall(() => updateCoachProfile(bio));
      if (res.ok) setCoachProfile(res.value);
    },
    [safeCall]
  );

  const refreshCoachInvitations = useCallback(async () => {
    setInvitationsLoading(true);
    const res = await safeCall(listCoachInvitations);
    if (res.ok) setCoachInvitations(res.value);
    setInvitationsLoading(false);
  }, [safeCall]);

  const sendCoachInvitation = useCallback(
    async (email: string, message?: string) => {
      // Throws so the invite modal can show the error and stay open.
      const inv = await sendInvitation(email, message);
      setCoachInvitations((prev) => [inv, ...prev]);
    },
    []
  );

  const cancelCoachInvitation = useCallback(
    async (id: string) => {
      const current = coachInvitations.find((i) => i.id === id);
      const res = await safeCall(() => cancelInvitation(id));
      if (!res.ok) return;
      setCoachInvitations((prev) => {
        if (current?.status === "pending") {
          return prev.map((i) => (i.id === id ? { ...i, status: "cancelled" as const } : i));
        }
        return prev.filter((i) => i.id !== id);
      });
    },
    [safeCall, coachInvitations]
  );

  const removeTrainee = useCallback(
    async (relationshipId: string) => {
      const res = await safeCall(() => endTraineeRelationship(relationshipId));
      if (!res.ok) return;
      setTrainees((prev) => prev.filter((t) => t.relationship_id !== relationshipId));
      setTraineeSync(null);
    },
    [safeCall]
  );

  const refreshMyInvitations = useCallback(async () => {
    setMyInvitationsLoading(true);
    const res = await safeCall(listTraineeInvitations);
    if (res.ok) setMyInvitations(res.value);
    setMyInvitationsLoading(false);
  }, [safeCall]);

  const acceptMyInvitation = useCallback(
    async (id: string) => {
      const res = await safeCall(() => acceptInvitation(id));
      if (!res.ok) {
        // e.g. expired/cancelled meanwhile — show the server's current state.
        listTraineeInvitations().then(setMyInvitations).catch(() => {});
        return;
      }
      const rel = res.value;
      setMyInvitations((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status: "accepted" as const } : i))
      );
      // Reconnecting reactivates the existing relationship row (same id).
      setMyRelationships((prev) => [rel, ...prev.filter((r) => r.id !== rel.id)]);
    },
    [safeCall]
  );

  const rejectMyInvitation = useCallback(
    async (id: string) => {
      const res = await safeCall(() => rejectInvitation(id));
      if (!res.ok) return;
      setMyInvitations((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status: "rejected" as const } : i))
      );
    },
    [safeCall]
  );

  const revokeMyCoach = useCallback(
    async (relationshipId: string) => {
      const res = await safeCall(() => revokeCoachAccess(relationshipId));
      if (!res.ok) return;
      setMyRelationships((prev) =>
        prev.map((r) =>
          r.id === relationshipId ? { ...r, status: "revoked" as const } : r
        )
      );
    },
    [safeCall]
  );

  const loadTraineeSync = useCallback(
    async (traineeId: string) => {
      setTraineeSyncLoading(true);
      setTraineeSync(null);
      const res = await safeCall(() => getTraineeSyncData(traineeId));
      if (res.ok) setTraineeSync(res.value);
      setTraineeSyncLoading(false);
    },
    [safeCall]
  );

  const acknowledgeAccessNotice = useCallback(async () => {
    if (!pendingAccessNotice) return;
    const id = pendingAccessNotice.id;
    setPendingAccessNotice(null);
    try {
      await ackAccessNoticeApi(id);
    } catch {
      /* already dismissed locally; will retry on next poll if still pending */
    }
  }, [pendingAccessNotice]);

  return {
    coachProfile,
    isCoach,
    profileLoading,
    activateCoach,
    deactivateCoach,
    updateBio,

    trainees,
    traineesLoading,
    refreshTrainees,
    removeTrainee,

    coachInvitations,
    invitationsLoading,
    sendCoachInvitation,
    cancelCoachInvitation,
    refreshCoachInvitations,

    myInvitations,
    myInvitationsLoading,
    acceptMyInvitation,
    rejectMyInvitation,
    refreshMyInvitations,

    myRelationships,
    revokeMyCoach,

    traineeSync,
    traineeSyncLoading,
    loadTraineeSync,

    pendingAccessNotice,
    acknowledgeAccessNotice,

    error,
    clearError: () => setError(null),
  };
}

const CoachContext = createContext<UseCoachResult | null>(null);

export function CoachProvider({ children }: { children: ReactNode }) {
  return createElement(CoachContext.Provider, { value: useCoachState() }, children);
}

export function useCoach(): UseCoachResult {
  const ctx = useContext(CoachContext);
  if (!ctx) throw new Error("useCoach must be used inside <CoachProvider>");
  return ctx;
}
