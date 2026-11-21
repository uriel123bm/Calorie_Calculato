import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const listTraineeInvitations = vi.hoisted(() => vi.fn());

vi.mock("../../services/coachApi", () => ({
  listTraineeInvitations,
  getCoachProfile: vi.fn().mockRejectedValue({ response: { status: 403 } }),
  listMyRelationships: vi.fn().mockResolvedValue([]),
  listCoachInvitations: vi.fn().mockResolvedValue([]),
  listTrainees: vi.fn().mockResolvedValue([]),
  listAccessNotices: vi.fn().mockResolvedValue([]),
  acknowledgeAccessNotice: vi.fn().mockResolvedValue(undefined),
  listMyGoals: vi.fn().mockResolvedValue([]),
  acceptGoal: vi.fn(),
  rejectGoal: vi.fn(),
}));

import { CoachProvider } from "../../hooks/useCoach";
import { CoachTabContent } from "./CoachTabContent";

const INVITE = {
  id: "i1", coach_id: "c1", trainee_email: "t@example.com", status: "pending",
  message: null, coach_username: "coach", created_at: "2026-11-17T08:00:00Z", expires_at: "2026-11-24T08:00:00Z",
};

describe("CoachTabContent", () => {
  it("shows invitations that arrived after the app loaded when the tab is opened", async () => {
    listTraineeInvitations.mockResolvedValueOnce([]).mockResolvedValue([INVITE]);
    const { rerender } = render(<CoachProvider userId="u1"><div /></CoachProvider>);
    await vi.waitFor(() => expect(listTraineeInvitations).toHaveBeenCalledTimes(1));

    rerender(<CoachProvider userId="u1"><CoachTabContent /></CoachProvider>);

    expect(await screen.findByRole("button", { name: /אשר הזמנה/ })).toBeInTheDocument();
  });
});
