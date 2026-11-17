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
  useState,
  type ReactNode,
} from "react";
import {
  activateCoachProfile,
  cancelInvitation,
  deactivateCoachProfile,
  getCoachProfile,
  getTraineeSyncData,
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
  CoachProfile,
  Invitation,
  Relationship,
  TraineeListItem,
  TraineeSyncBuckets,
} from "../services/coachApi";

export type { CoachProfile, Invitation, Relationship, TraineeListItem, TraineeSyncBuckets };

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

  // Coach invitations (sent by this coach)
  coachInvitations: Invitation[];
  invitationsLoading: boolean;
  sendCoachInvitation: (email: string, message?: string) => Promise<void>;
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

  error: string | null;
  clearError: () => void;
}

function errorMessage(e: unknown): string {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === "string" && detail ? detail : "שגיאה בלתי צפויה";
}

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

  const [error, setError] = useState<string | null>(null);

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
  useEffect(() => {
    const load = () => {
      listTraineeInvitations()
        .then(setMyInvitations)
        .catch(() => {});
      listMyRelationships()
        .then(setMyRelationships)
        .catch(() => {});
    };
    load();
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

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

  const refreshTrainees = useCallback(async () => {
    setTraineesLoading(true);
    const res = await safeCall(listTrainees);
    if (res.ok) setTrainees(res.value);
    setTraineesLoading(false);
  }, [safeCall]);

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
      const res = await safeCall(() => cancelInvitation(id));
      if (!res.ok) return;
      setCoachInvitations((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status: "cancelled" as const } : i))
      );
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

  return {
    coachProfile,
    isCoach: coachProfile !== null && coachProfile.is_active,
    profileLoading,
    activateCoach,
    deactivateCoach,
    updateBio,

    trainees,
    traineesLoading,
    refreshTrainees,

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
