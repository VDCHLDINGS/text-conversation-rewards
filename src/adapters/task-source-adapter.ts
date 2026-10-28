/**
 * ubiquity-os-marketplace/text-conversation-rewards#385 ($1,200)
 * GitHub Decoupling: Platform-agnostic Task & Conversation Ingestion Layer
 * Supports GitHub, Asana, and Google Sheets/CSV task sources with unified identity mapping.
 */

export type TaskPlatform = "github" | "asana" | "google-sheets" | "generic";

export interface NormalizedParticipant {
  canonicalId: string;
  displayName: string;
  platformHandles: Partial<Record<TaskPlatform, string>>;
  walletAddress?: string;
  role: "author" | "assignee" | "reviewer" | "collaborator" | "contributor";
}

export interface NormalizedComment {
  id: string;
  platform: TaskPlatform;
  authorId: string;
  body: string;
  createdAt: string;
  isSpecification?: boolean;
  isReviewComment?: boolean;
  commitId?: string;
  metadata?: Record<string, unknown>;
}

export interface NormalizedTaskContext {
  taskId: string;
  platform: TaskPlatform;
  title: string;
  specificationBody: string;
  status: "open" | "completed" | "cancelled";
  bountyAmountUsd: number;
  authorId: string;
  winningAssigneeIds: string[];
  previousAssigneeIds: string[];
  participants: Record<string, NormalizedParticipant>;
  comments: NormalizedComment[];
}

export interface TaskSourceAdapter<TRawInput = unknown> {
  readonly platform: TaskPlatform;
  normalizeTask(raw: TRawInput): Promise<NormalizedTaskContext>;
}

export class CrossPlatformIdentityRegistry {
  private _byCanonicalId = new Map<string, NormalizedParticipant>();
  private _handleToCanonical = new Map<string, string>();

  public registerParticipant(participant: NormalizedParticipant): void {
    this._byCanonicalId.set(participant.canonicalId, participant);
    for (const [platform, handle] of Object.entries(participant.platformHandles)) {
      if (handle) {
        this._handleToCanonical.set(`${platform}:${handle.toLowerCase()}`, participant.canonicalId);
      }
    }
  }

  public resolveCanonicalId(platform: TaskPlatform, handleOrId: string): string {
    const key = `${platform}:${handleOrId.toLowerCase()}`;
    return this._handleToCanonical.get(key) ?? `${platform}:${handleOrId}`;
  }

  public getParticipant(canonicalId: string): NormalizedParticipant | undefined {
    return this._byCanonicalId.get(canonicalId);
  }
}

export interface RawGitHubTaskInput {
  issueNumber: number;
  title: string;
  body: string;
  state: "open" | "closed";
  stateReason?: "completed" | "not_planned" | "reopened" | null;
  priceLabelUsd?: number;
  authorLogin: string;
  assignees: string[];
  previousAssignees?: string[];
  comments: Array<{
    id: string | number;
    userLogin: string;
    body: string;
    createdAt: string;
    isReview?: boolean;
    commitId?: string;
  }>;
}

export class GitHubTaskAdapter implements TaskSourceAdapter<RawGitHubTaskInput> {
  public readonly platform: TaskPlatform = "github";

  constructor(private readonly _identityRegistry = new CrossPlatformIdentityRegistry()) {}

  public async normalizeTask(raw: RawGitHubTaskInput): Promise<NormalizedTaskContext> {
    const participants: Record<string, NormalizedParticipant> = {};
    const ensureParticipant = (login: string, role: NormalizedParticipant["role"]): string => {
      const canonicalId = this._identityRegistry.resolveCanonicalId("github", login);
      if (!participants[canonicalId]) {
        participants[canonicalId] = this._identityRegistry.getParticipant(canonicalId) ?? {
          canonicalId,
          displayName: login,
          platformHandles: { github: login },
          role,
        };
      }
      return canonicalId;
    };

    const authorId = ensureParticipant(raw.authorLogin, "author");
    const winningAssigneeIds = (raw.assignees || []).map((a) => ensureParticipant(a, "assignee"));
    const previousAssigneeIds = (raw.previousAssignees || []).map((a) => ensureParticipant(a, "contributor"));

    const comments: NormalizedComment[] = [
      {
        id: `gh-spec-${raw.issueNumber}`,
        platform: "github",
        authorId,
        body: raw.body || "",
        createdAt: new Date(0).toISOString(),
        isSpecification: true,
      },
      ...(raw.comments || []).map((c) => ({
        id: String(c.id),
        platform: "github" as const,
        authorId: ensureParticipant(c.userLogin, c.isReview ? "reviewer" : "contributor"),
        body: c.body,
        createdAt: c.createdAt,
        isReviewComment: Boolean(c.isReview),
        commitId: c.commitId,
      })),
    ];

    return {
      taskId: `github:${raw.issueNumber}`,
      platform: "github",
      title: raw.title,
      specificationBody: raw.body || "",
      status: raw.state === "closed" ? (raw.stateReason === "not_planned" ? "cancelled" : "completed") : "open",
      bountyAmountUsd: raw.priceLabelUsd ?? 0,
      authorId,
      winningAssigneeIds,
      previousAssigneeIds,
      participants,
      comments,
    };
  }
}

export interface RawAsanaTaskInput {
  gid: string;
  name: string;
  notes: string;
  completed: boolean;
  bountyUsd?: number;
  createdByGid: string;
  assigneeGid?: string | null;
  stories: Array<{
    gid: string;
    type: "comment" | "system";
    createdByGid: string;
    text: string;
    createdAt: string;
  }>;
}

export class AsanaTaskAdapter implements TaskSourceAdapter<RawAsanaTaskInput> {
  public readonly platform: TaskPlatform = "asana";

  constructor(private readonly _identityRegistry = new CrossPlatformIdentityRegistry()) {}

  public async normalizeTask(raw: RawAsanaTaskInput): Promise<NormalizedTaskContext> {
    const participants: Record<string, NormalizedParticipant> = {};
    const ensureParticipant = (gid: string, role: NormalizedParticipant["role"]): string => {
      const canonicalId = this._identityRegistry.resolveCanonicalId("asana", gid);
      if (!participants[canonicalId]) {
        participants[canonicalId] = this._identityRegistry.getParticipant(canonicalId) ?? {
          canonicalId,
          displayName: gid,
          platformHandles: { asana: gid },
          role,
        };
      }
      return canonicalId;
    };

    const authorId = ensureParticipant(raw.createdByGid, "author");
    const winningAssigneeIds = raw.assigneeGid ? [ensureParticipant(raw.assigneeGid, "assignee")] : [];
    const comments: NormalizedComment[] = [
      {
        id: `asana-spec-${raw.gid}`,
        platform: "asana",
        authorId,
        body: raw.notes || "",
        createdAt: new Date(0).toISOString(),
        isSpecification: true,
      },
      ...(raw.stories || [])
        .filter((s) => s.type === "comment" && s.text?.trim())
        .map((s) => ({
          id: s.gid,
          platform: "asana" as const,
          authorId: ensureParticipant(s.createdByGid, "contributor"),
          body: s.text,
          createdAt: s.createdAt,
        })),
    ];

    return {
      taskId: `asana:${raw.gid}`,
      platform: "asana",
      title: raw.name,
      specificationBody: raw.notes || "",
      status: raw.completed ? "completed" : "open",
      bountyAmountUsd: raw.bountyUsd ?? 0,
      authorId,
      winningAssigneeIds,
      previousAssigneeIds: [],
      participants,
      comments,
    };
  }
}

export interface RawSheetTaskRow {
  rowId: string;
  title: string;
  specification: string;
  completed: boolean;
  bountyUsd: number;
  authorHandle: string;
  assigneeHandle?: string;
  discussionLog: Array<{ authorHandle: string; message: string; timestamp: string }>;
}

export class GoogleSheetsTaskAdapter implements TaskSourceAdapter<RawSheetTaskRow> {
  public readonly platform: TaskPlatform = "google-sheets";

  constructor(private readonly _identityRegistry = new CrossPlatformIdentityRegistry()) {}

  public async normalizeTask(raw: RawSheetTaskRow): Promise<NormalizedTaskContext> {
    const participants: Record<string, NormalizedParticipant> = {};
    const ensureParticipant = (handle: string, role: NormalizedParticipant["role"]): string => {
      const canonicalId = this._identityRegistry.resolveCanonicalId("google-sheets", handle);
      if (!participants[canonicalId]) {
        participants[canonicalId] = this._identityRegistry.getParticipant(canonicalId) ?? {
          canonicalId,
          displayName: handle,
          platformHandles: { "google-sheets": handle },
          role,
        };
      }
      return canonicalId;
    };

    const authorId = ensureParticipant(raw.authorHandle, "author");
    const winningAssigneeIds = raw.assigneeHandle ? [ensureParticipant(raw.assigneeHandle, "assignee")] : [];
    const comments: NormalizedComment[] = (raw.discussionLog || []).map((entry, idx) => ({
      id: `sheet-${raw.rowId}-${idx}`,
      platform: "google-sheets" as const,
      authorId: ensureParticipant(entry.authorHandle, "contributor"),
      body: entry.message,
      createdAt: entry.timestamp,
    }));

    return {
      taskId: `google-sheets:${raw.rowId}`,
      platform: "google-sheets",
      title: raw.title,
      specificationBody: raw.specification,
      status: raw.completed ? "completed" : "open",
      bountyAmountUsd: raw.bountyUsd,
      authorId,
      winningAssigneeIds,
      previousAssigneeIds: [],
      participants,
      comments,
    };
  }
}
