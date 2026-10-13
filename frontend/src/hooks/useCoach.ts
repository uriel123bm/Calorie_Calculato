/**
 * useCoach — central hook for the coaching system.
 *
 * Manages coach profile state, trainee list, invitations (both coach and
 * trainee side), and per-trainee data access.
 */
import { useCallback, useEffect, useState } from "react";
import {
  activateCoachProfile,
  cancelInvitation,
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

interface UseCoachResult {
  // Coach profile
  coachProfile: CoachProfile | null;
  isCoach: boolean;
  profileLoading: boolean;
  activateCoach: (bio?: string) => Promise<void>;
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

export function useCoach(): UseCoachResult {
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

  const safeCall = useCallback(async <T>(fn: () => Promise<T>): Promise<T | null> => {
    try {
      return await fn();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "שגיאה בלתי צפויה";
      setError(String(msg));
      return null;
    }
  }, []);

  // Load coach profile on mount
  useEffect(() => {
    setProfileLoading(true);
    getCoachProfile()
      .then(setCoachProfile)
      .catch(() => setCoachProfile(null))
      .finally(() => setProfileLoading(false));
  }, []);

  // Load trainee-side data on mount
  useEffect(() => {
    listTraineeInvitations()
      .then(setMyInvitations)
      .catch(() => {});
    listMyRelationships()
      .then(setMyRelationships)
      .catch(() => {});
  }, []);

  const activateCoach = useCallback(
    async (bio?: string) => {
      const profile = await safeCall(() => activateCoachProfile(bio));
      if (profile) setCoachProfile(profile);
    },
    [safeCall]
  );

  const updateBio = useCallback(
    async (bio: string | null) => {
      const profile = await safeCall(() => updateCoachProfile(bio));
      if (profile) setCoachProfile(profile);
    },
    [safeCall]
  );

  const refreshTrainees = useCallback(async () => {
    setTraineesLoading(true);
    const list = await safeCall(listTrainees);
    if (list) setTrainees(list);
    setTraineesLoading(false);
  }, [safeCall]);

  const refreshCoachInvitations = useCallback(async () => {
    setInvitationsLoading(true);
    const list = await safeCall(listCoachInvitations);
    if (list) setCoachInvitations(list);
    setInvitationsLoading(false);
  }, [safeCall]);

  const sendCoachInvitation = useCallback(
    async (email: string, message?: string) => {
      const inv = await safeCall(() => sendInvitation(email, message));
      if (inv) {
        setCoachInvitations((prev) => [inv, ...prev]);
      }
    },
    [safeCall]
  );

  const cancelCoachInvitation = useCallback(
    async (id: string) => {
      await safeCall(() => cancelInvitation(id));
      setCoachInvitations((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status: "cancelled" as const } : i))
      );
    },
    [safeCall]
  );

  const refreshMyInvitations = useCallback(async () => {
    setMyInvitationsLoading(true);
    const list = await safeCall(listTraineeInvitations);
    if (list) setMyInvitations(list);
    setMyInvitationsLoading(false);
  }, [safeCall]);

  const acceptMyInvitation = useCallback(
    async (id: string) => {
      const rel = await safeCall(() => acceptInvitation(id));
      if (rel) {
        setMyInvitations((prev) =>
          prev.map((i) => (i.id === id ? { ...i, status: "accepted" as const } : i))
        );
        setMyRelationships((prev) => [rel, ...prev]);
      }
    },
    [safeCall]
  );

  const rejectMyInvitation = useCallback(
    async (id: string) => {
      await safeCall(() => rejectInvitation(id));
      setMyInvitations((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status: "rejected" as const } : i))
      );
    },
    [safeCall]
  );

  const revokeMyCoach = useCallback(
    async (relationshipId: string) => {
      await safeCall(() => revokeCoachAccess(relationshipId));
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
      const data = await safeCall(() => getTraineeSyncData(traineeId));
      if (data) setTraineeSync(data);
      setTraineeSyncLoading(false);
    },
    [safeCall]
  );

  return {
    coachProfile,
    isCoach: coachProfile !== null && coachProfile.is_active,
    profileLoading,
    activateCoach,
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
