import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getCoachProfile: vi.fn(),
  activateCoachProfile: vi.fn(),
  listTraineeInvitations: vi.fn(),
  listMyRelationships: vi.fn(),
  revokeCoachAccess: vi.fn(),
  acceptInvitation: vi.fn(),
  sendInvitation: vi.fn(),
}));

vi.mock("../services/coachApi", () => ({
  ...api,
  cancelInvitation: vi.fn(),
  deactivateCoachProfile: vi.fn(),
  getTraineeSyncData: vi.fn(),
  listCoachInvitations: vi.fn().mockResolvedValue([]),
  listTrainees: vi.fn().mockResolvedValue([]),
  rejectInvitation: vi.fn(),
  updateCoachProfile: vi.fn(),
}));

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
      {actions.error && <li>error:{actions.error}</li>}
    </ul>
  );
}

function renderCoach() {
  return render(
    <CoachProvider>
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
});
