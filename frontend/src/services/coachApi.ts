/**
 * API service layer for the Coach–Trainee Management System.
 *
 * All requests include the Bearer access token via the shared axios client
 * interceptor defined in api.ts.
 */
import { client } from "./api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InvitationStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "expired"
  | "cancelled"
  | "revoked";

export type RelationshipStatus = "active" | "revoked" | "ended";
export type GoalStatus = "proposed" | "accepted" | "rejected" | "superseded";
export type GoalType = "calories" | "protein" | "carbs" | "fat" | "consistency" | "steps";

export interface CoachProfile {
  id: string;
  user_id: string;
  bio: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Invitation {
  id: string;
  coach_id: string;
  trainee_email: string;
  trainee_id: string | null;
  status: InvitationStatus;
  expires_at: string;
  created_at: string;
  responded_at: string | null;
  message: string | null;
  coach_username?: string | null;
  coach_email?: string | null;
}

export interface Relationship {
  id: string;
  coach_id: string;
  trainee_id: string;
  status: RelationshipStatus;
  started_at: string;
  ended_at: string | null;
}

export interface TraineeListItem {
  relationship_id: string;
  trainee_id: string;
  username: string;
  email: string;
  started_at: string;
  status: RelationshipStatus;
}

export interface TraineeProfile {
  id: string;
  username: string;
  email: string;
  created_at: string;
}

export interface TraineeSyncBuckets {
  tracker: string | null;
  history: string | null;
  meals: string | null;
  body: string | null;
  workouts?: string | null;
  personal_plan: string | null;
  updated_at: string | null;
}

export interface CoachingGoal {
  id: string;
  relationship_id: string;
  goal_type: GoalType;
  target_value: number;
  unit: string;
  status: GoalStatus;
  note: string | null;
  created_at: string;
  responded_at: string | null;
}

// ---------------------------------------------------------------------------
// Coach profile
// ---------------------------------------------------------------------------

export async function activateCoachProfile(bio?: string): Promise<CoachProfile> {
  const r = await client.post<CoachProfile>("/coach/profile", { bio: bio ?? null });
  return r.data;
}

export async function getCoachProfile(): Promise<CoachProfile> {
  const r = await client.get<CoachProfile>("/coach/profile");
  return r.data;
}

export async function updateCoachProfile(bio: string | null): Promise<CoachProfile> {
  const r = await client.patch<CoachProfile>("/coach/profile", { bio });
  return r.data;
}

export async function deactivateCoachProfile(): Promise<void> {
  await client.delete("/coach/profile");
}

// ---------------------------------------------------------------------------
// Invitations — coach side
// ---------------------------------------------------------------------------

export async function sendInvitation(traineeEmail: string, message?: string): Promise<Invitation> {
  const r = await client.post<Invitation>("/coach/invitations", {
    trainee_email: traineeEmail,
    message: message ?? null,
  });
  return r.data;
}

export async function listCoachInvitations(): Promise<Invitation[]> {
  const r = await client.get<Invitation[]>("/coach/invitations");
  return r.data;
}

export async function cancelInvitation(invitationId: string): Promise<void> {
  await client.delete(`/coach/invitations/${invitationId}`);
}

// ---------------------------------------------------------------------------
// Invitations — trainee side
// ---------------------------------------------------------------------------

export async function listTraineeInvitations(): Promise<Invitation[]> {
  const r = await client.get<Invitation[]>("/trainee/invitations");
  return r.data;
}

export async function acceptInvitation(invitationId: string): Promise<Relationship> {
  const r = await client.post<Relationship>(`/trainee/invitations/${invitationId}/accept`);
  return r.data;
}

export async function rejectInvitation(invitationId: string): Promise<void> {
  await client.post(`/trainee/invitations/${invitationId}/reject`);
}

// ---------------------------------------------------------------------------
// Relationships — trainee side
// ---------------------------------------------------------------------------

export async function listMyRelationships(): Promise<Relationship[]> {
  const r = await client.get<Relationship[]>("/trainee/relationships");
  return r.data;
}

export async function revokeCoachAccess(relationshipId: string): Promise<void> {
  await client.post(`/trainee/relationships/${relationshipId}/revoke`);
}

// ---------------------------------------------------------------------------
// Coach — trainee management
// ---------------------------------------------------------------------------

export async function listTrainees(): Promise<TraineeListItem[]> {
  const r = await client.get<TraineeListItem[]>("/coach/trainees");
  return r.data;
}

export async function getTraineeProfile(traineeId: string): Promise<TraineeProfile> {
  const r = await client.get<TraineeProfile>(`/coach/trainees/${traineeId}/profile`);
  return r.data;
}

export async function getTraineeSyncData(traineeId: string): Promise<TraineeSyncBuckets> {
  const r = await client.get<TraineeSyncBuckets>(`/coach/trainees/${traineeId}/sync`);
  return r.data;
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Coach push notifications to trainee
// ---------------------------------------------------------------------------

export interface NotifyTraineePayload {
  title: string;
  body: string;
  tag?: string;
}

export async function notifyTrainee(
  traineeId: string,
  payload: NotifyTraineePayload
): Promise<void> {
  await client.post(`/coach/trainees/${traineeId}/notify`, {
    title: payload.title,
    body: payload.body,
    tag: payload.tag ?? "coach-message",
  });
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export async function proposeGoal(
  traineeId: string,
  goal: { goal_type: GoalType; target_value: number; unit: string; note?: string }
): Promise<CoachingGoal> {
  const r = await client.post<CoachingGoal>(`/coach/trainees/${traineeId}/goals`, goal);
  return r.data;
}

export async function listGoalsForTrainee(traineeId: string): Promise<CoachingGoal[]> {
  const r = await client.get<CoachingGoal[]>(`/coach/trainees/${traineeId}/goals`);
  return r.data;
}

export async function listMyGoals(): Promise<CoachingGoal[]> {
  const r = await client.get<CoachingGoal[]>("/trainee/goals");
  return r.data;
}

export async function acceptGoal(goalId: string): Promise<void> {
  await client.post(`/trainee/goals/${goalId}/accept`);
}

export async function rejectGoal(goalId: string): Promise<void> {
  await client.post(`/trainee/goals/${goalId}/reject`);
}
