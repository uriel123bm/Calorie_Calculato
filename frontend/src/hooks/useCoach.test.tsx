import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getCoachProfile: vi.fn(),
  activateCoachProfile: vi.fn(),
  listTraineeInvitations: vi.fn(),
  listMyRelationships: vi.fn(),
  listTrainees: vi.fn(),
  listCoachInvitations: vi.fn(),
  listAccessNotices: vi.fn(),
  acknowledgeAccessNotice: vi.fn(),
  listMyGoals: vi.fn(),
  acceptGoal: vi.fn(),
  rejectGoal: vi.fn(),
  revokeCoachAccess: vi.fn(),
  endTraineeRelationship: vi.fn(),
  cancelInvitation: vi.fn(),
  acceptInvitation: vi.fn(),
  sendInvitation: vi.fn(),
}));

vi.mock("../services/coachApi", () => ({
  ...api,
  deactivateCoachProfile: vi.fn(),
  getTraineeSyncData: vi.fn(),
  rejectInvitation: vi.fn(),
  updateCoachProfile: vi.fn(),
}));

const pushSyncNow = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const schedulePush = vi.hoisted(() => vi.fn());
vi.mock("../services/sync", () => ({ pushSyncNow, schedulePush }));

import { CoachProvider, useCoach, type UseCoachResult } from "./useCoach";

const PROFILE = { id: "p1", user_id: "u1", bio: null, is_active: true, created_at: "2026-11-01T00:00:00Z" };
const REL = { id: "r1", coach_id: "c1", trainee_id: "u1", status: "active", started_at: "2026-11-01T00:00:00Z", ended_at: null };

let actions: UseCoachResult;

function Badge() {
  const { isCoach } = useCoach();
  return <span>{isCoach ? "coach-mode" : "not-coach"}</span>;
}

function Panel() {
  actions = useCoach();
  return (
    <ul>
      {actions.myRelationships.map((r) => <li key={r.id}>{`${r.id}:${r.status}`}</li>)}
      {actions.trainees.map((t) => <li key={t.relationship_id}>trainee:{t.username}</li>)}
      {actions.coachInvitations.map((i) => <li key={i.id}>inv:{i.id}:{i.status}</li>)}
      {actions.error && <li>error:{actions.error}</li>}
    </ul>
  );
}

function renderCoach() {
  return render(
    <CoachProvider userId="u1">
      <Badge />
      <Panel />
    </CoachProvider>
  );
}

describe("CoachProvider", () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.getCoachProfile.mockRejectedValue({ response: { status: 403 } });
    api.listTraineeInvitations.mockResolvedValue([]);
    api.listMyRelationships.mockResolvedValue([REL]);
    api.listTrainees.mockResolvedValue([]);
    api.listCoachInvitations.mockResolvedValue([]);
    api.listAccessNotices.mockResolvedValue([]);
    api.acknowledgeAccessNotice.mockResolvedValue(undefined);
    api.listMyGoals.mockResolvedValue([]);
    api.acceptGoal.mockResolvedValue(undefined);
    api.rejectGoal.mockResolvedValue(undefined);
  });

  it("shares coach activation with every consumer", async () => {
    api.activateCoachProfile.mockResolvedValue(PROFILE);
    renderCoach();
    await screen.findByText("not-coach");

    await act(() => actions.activateCoach());

    expect(screen.getByText("coach-mode")).toBeInTheDocument();
  });

  it("rejects activation errors so the modal can show them", async () => {
    api.activateCoachProfile.mockRejectedValue({ response: { data: { detail: "פרופיל מאמן כבר קיים" } } });
    renderCoach();
    await screen.findByText("not-coach");

    await expect(actions.activateCoach()).rejects.toBeTruthy();
    expect(screen.getByText("not-coach")).toBeInTheDocument();
  });

  it("keeps the coach shown as active when revoking fails", async () => {
    api.revokeCoachAccess.mockRejectedValue({ response: { data: { detail: "קשר פעיל לא נמצא" } } });
    renderCoach();
    await screen.findByText("r1:active");

    await act(() => actions.revokeMyCoach("r1"));

    expect(screen.getByText("r1:active")).toBeInTheDocument();
    expect(screen.getByText("error:קשר פעיל לא נמצא")).toBeInTheDocument();
  });

  it("does not duplicate a relationship that is reactivated on reconnect", async () => {
    api.listMyRelationships.mockResolvedValue([{ ...REL, status: "revoked" }]);
    api.acceptInvitation.mockResolvedValue(REL);
    renderCoach();
    await screen.findByText("r1:revoked");

    await act(() => actions.acceptMyInvitation("inv1"));

    await waitFor(() => expect(screen.getAllByText(/^r1:/)).toHaveLength(1));
    expect(screen.getByText("r1:active")).toBeInTheDocument();
  });

  it("removes a trainee from the list after the coach ends the relationship", async () => {
    const TRAINEE = {
      relationship_id: "r1", trainee_id: "t1", username: "tal", email: "t@example.com",
      started_at: "2026-11-01T00:00:00Z", status: "active" as const,
    };
    const ACCEPTED_INV = {
      id: "i-accepted", coach_id: "c1", trainee_email: "t@example.com", trainee_id: "t1",
      status: "accepted" as const, message: null, created_at: "2026-11-01T00:00:00Z",
      expires_at: "2026-11-08T00:00:00Z",
    };
    api.getCoachProfile.mockResolvedValue(PROFILE);
    api.listTrainees.mockResolvedValue([TRAINEE]);
    api.listCoachInvitations.mockResolvedValue([ACCEPTED_INV]);
    api.endTraineeRelationship.mockResolvedValue(undefined);
    renderCoach();
    await screen.findByText("coach-mode");
    await act(() => actions.refreshTrainees());
    await act(() => actions.refreshCoachInvitations());
    await screen.findByText("trainee:tal");
    await screen.findByText("inv:i-accepted:accepted");

    await act(() => actions.removeTrainee("r1"));

    expect(screen.queryByText("trainee:tal")).not.toBeInTheDocument();
    expect(screen.queryByText(/inv:i-accepted:/)).not.toBeInTheDocument();
  });

  it("pushes local sync after accepting an invitation so the coach can see history", async () => {
    api.acceptInvitation.mockResolvedValue(REL);
    renderCoach();
    await screen.findByText("r1:active");

    await act(() => actions.acceptMyInvitation("inv1"));

    expect(pushSyncNow).toHaveBeenCalledWith("u1");
  });

  it("drops a non-pending invitation from the list when removed", async () => {
    const INV = {
      id: "i1", coach_id: "c1", trainee_email: "x@example.com", status: "rejected" as const,
      message: null, created_at: "2026-11-01T00:00:00Z", expires_at: "2026-11-08T00:00:00Z",
    };
    api.getCoachProfile.mockResolvedValue(PROFILE);
    api.listCoachInvitations.mockResolvedValue([INV]);
    api.cancelInvitation.mockResolvedValue(undefined);
    renderCoach();
    await screen.findByText("coach-mode");
    await act(() => actions.refreshCoachInvitations());
    await screen.findByText("inv:i1:rejected");

    await act(() => actions.cancelCoachInvitation("i1"));

    expect(screen.queryByText(/inv:i1:/)).not.toBeInTheDocument();
  });

  it("surfaces a coach_removed notice and marks the relationship ended", async () => {
    const NOTICE = {
      id: "n1",
      relationship_id: "r1",
      kind: "coach_removed" as const,
      actor_username: "coach1",
      message: "המאמן הסיר אותך",
      created_at: "2026-11-17T18:00:00Z",
    };
    api.listAccessNotices.mockResolvedValue([NOTICE]);
    api.listMyRelationships.mockResolvedValue([{ ...REL, status: "ended" }]);
    renderCoach();

    await waitFor(() => expect(actions.pendingAccessNotice?.id).toBe("n1"));
    expect(screen.getByText("r1:ended")).toBeInTheDocument();

    await act(() => actions.acknowledgeAccessNotice());
    expect(actions.pendingAccessNotice).toBeNull();
    expect(api.acknowledgeAccessNotice).toHaveBeenCalledWith("n1");
  });

  it("removes a trainee locally when a trainee_revoked notice arrives", async () => {
    const TRAINEE = {
      relationship_id: "r1", trainee_id: "t1", username: "tal", email: "t@example.com",
      started_at: "2026-11-01T00:00:00Z", status: "active" as const,
    };
    const NOTICE = {
      id: "n2",
      relationship_id: "r1",
      kind: "trainee_revoked" as const,
      actor_username: "tal",
      message: "ביטל גישה",
      created_at: "2026-11-17T18:00:00Z",
    };
    api.getCoachProfile.mockResolvedValue(PROFILE);
    api.listTrainees.mockResolvedValue([TRAINEE]);
    api.listAccessNotices.mockResolvedValue([]);
    renderCoach();
    await screen.findByText("coach-mode");
    await act(() => actions.refreshTrainees());
    await screen.findByText("trainee:tal");

    // Later poll: server trainee list is empty + pending notice for the coach.
    api.listTrainees.mockResolvedValue([]);
    api.listAccessNotices.mockResolvedValue([NOTICE]);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => expect(screen.queryByText("trainee:tal")).not.toBeInTheDocument());
    await waitFor(() => expect(actions.pendingAccessNotice?.kind).toBe("trainee_revoked"));
  });

  it("applies an accepted calorie goal into local tracker storage", async () => {
    const GOAL = {
      id: "g1",
      relationship_id: "r1",
      goal_type: "calories" as const,
      target_value: 2100,
      unit: "kcal",
      status: "proposed" as const,
      note: null,
      created_at: "2026-11-21T00:00:00Z",
      responded_at: null,
    };
    api.listMyGoals.mockResolvedValue([GOAL]);
    api.acceptGoal.mockResolvedValue(undefined);
    localStorage.clear();
    renderCoach();
    await waitFor(() => expect(actions.myGoals).toHaveLength(1));

    await act(() => actions.acceptMyGoal("g1"));

    expect(api.acceptGoal).toHaveBeenCalledWith("g1");
    const tracker = JSON.parse(localStorage.getItem("user_u1:dailyTracker:v1")!);
    expect(tracker.targetCalories).toBe(2100);
    expect(pushSyncNow).toHaveBeenCalledWith("u1");
  });
});
