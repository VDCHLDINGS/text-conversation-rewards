/**
 * ubiquity-os-marketplace/text-conversation-rewards#223 ($75) & #340 ($600)
 * - #223: Relevance Scoring Prompt Refinement (penalizes off-topic meta-chatter, administrative ack, and non-substantive comments < 0.2)
 * - #340: Specialized Prompts (3-axis evaluation: specRelevance, contributorHelpfulness, researchUtility with configurable weights)
 */

export interface SpecializedPromptWeights {
  specRelevance: number;
  contributorHelpfulness: number;
  researchUtility: number;
}

export interface SpecializedCommentScores {
  specRelevance: number;
  contributorHelpfulness: number;
  researchUtility: number;
  weightedScore: number;
}

export const DEFAULT_SPECIALIZED_WEIGHTS: SpecializedPromptWeights = {
  specRelevance: 0.5,
  contributorHelpfulness: 0.25,
  researchUtility: 0.25,
};

export const REFINED_RELEVANCE_SYSTEM_PROMPT = `You are an expert open-source engineering evaluator.
Score each comment from 0.0 to 1.0 based strictly on substantive technical contribution toward solving the issue specification.
CRITICAL PENALTY RULES (#223):
1. Off-topic tangents, casual banter, generic status updates ("working on this", "will check"), or meta-discussion about bots/rewards MUST receive a score <= 0.15.
2. Repetitive restatements of the issue description without original code, root-cause analysis, or actionable reproduction steps MUST receive a score <= 0.20.
3. High scores (>= 0.70) are reserved for comments containing concrete root-cause analysis, working code snippets, architectural insights, or direct answers unblocking the specification.`;

export const SPECIALIZED_PROMPTS = {
  specRelevance:
    "Prompt 1 (Spec Relevance): Rank from 0.0 to 1.0 how directly relevant each comment is to solving the technical issue specification.",
  contributorHelpfulness:
    "Prompt 2 (Contributor Helpfulness): Rank from 0.0 to 1.0 how helpful each comment is in answering contributor questions and unblocking implementation.",
  researchUtility:
    "Prompt 3 (Research & Insights): Rank from 0.0 to 1.0 how useful each comment is for adding original research, benchmarks, edge cases, and architectural insights to the project.",
};

export function normalizeWeights(weights: Partial<SpecializedPromptWeights> = {}): SpecializedPromptWeights {
  const merged: SpecializedPromptWeights = {
    specRelevance: weights.specRelevance ?? DEFAULT_SPECIALIZED_WEIGHTS.specRelevance,
    contributorHelpfulness: weights.contributorHelpfulness ?? DEFAULT_SPECIALIZED_WEIGHTS.contributorHelpfulness,
    researchUtility: weights.researchUtility ?? DEFAULT_SPECIALIZED_WEIGHTS.researchUtility,
  };
  const sum = merged.specRelevance + merged.contributorHelpfulness + merged.researchUtility;
  if (sum <= 0) {
    return { ...DEFAULT_SPECIALIZED_WEIGHTS };
  }
  return {
    specRelevance: merged.specRelevance / sum,
    contributorHelpfulness: merged.contributorHelpfulness / sum,
    researchUtility: merged.researchUtility / sum,
  };
}

export function clampScore(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.min(1, Math.max(0, val));
}

export function computeWeightedSpecializedScore(
  scores: Omit<SpecializedCommentScores, "weightedScore">,
  weights: Partial<SpecializedPromptWeights> = {}
): SpecializedCommentScores {
  const norm = normalizeWeights(weights);
  const specRelevance = clampScore(scores.specRelevance);
  const contributorHelpfulness = clampScore(scores.contributorHelpfulness);
  const researchUtility = clampScore(scores.researchUtility);
  const weightedScore = Number(
    (
      specRelevance * norm.specRelevance +
      contributorHelpfulness * norm.contributorHelpfulness +
      researchUtility * norm.researchUtility
    ).toFixed(4)
  );
  return {
    specRelevance,
    contributorHelpfulness,
    researchUtility,
    weightedScore,
  };
}

/**
 * Deterministic heuristic & LLM fallback evaluator for #223 & #340
 */
export function evaluateCommentRelevanceHeuristic(
  commentBody: string,
  issueSpec: string,
  weights: Partial<SpecializedPromptWeights> = {}
): SpecializedCommentScores {
  const body = (commentBody || "").trim();
  const lower = body.toLowerCase();

  // Detect meta-chatter / low-value status updates (#223)
  const isMetaChatter =
    body.length < 25 ||
    /^(thanks|thank you|working on it|looking into this|can i work on this|assigned|bump|lgtm|following)\b/i.test(lower) ||
    (lower.includes("bot") && lower.includes("reward") && !lower.includes("function") && !lower.includes("src/"));

  if (isMetaChatter) {
    return computeWeightedSpecializedScore(
      { specRelevance: 0.08, contributorHelpfulness: 0.05, researchUtility: 0.05 },
      weights
    );
  }

  const specTokens = new Set(
    (issueSpec || "")
      .toLowerCase()
      .split(/[^a-z0-9_]+/)
      .filter((t) => t.length >= 4)
  );
  const bodyTokens = lower.split(/[^a-z0-9_]+/).filter((t) => t.length >= 4);
  const overlapCount = bodyTokens.filter((t) => specTokens.has(t)).length;
  const overlapRatio = specTokens.size > 0 ? Math.min(1, overlapCount / Math.max(4, specTokens.size * 0.4)) : 0.3;

  const hasCodeOrPath = /```|`[^`]+`|\b(src\/|function\b|const\b|interface\b|class\b|https?:\/\/)/i.test(body);
  const hasAnswerSignal = /\b(because|you can|try using|the issue is|fix this by|workaround|here is how)\b/i.test(lower);
  const hasResearchSignal = /\b(benchmark|docs|specification|rfc|edge case|root cause|analysis|reference|comparison)\b/i.test(lower);

  const specRelevance = clampScore(overlapRatio * 0.65 + (hasCodeOrPath ? 0.35 : 0));
  const contributorHelpfulness = clampScore((hasAnswerSignal ? 0.55 : 0.15) + overlapRatio * 0.35);
  const researchUtility = clampScore((hasResearchSignal ? 0.55 : 0.1) + (hasCodeOrPath ? 0.25 : 0) + overlapRatio * 0.2);

  return computeWeightedSpecializedScore(
    { specRelevance, contributorHelpfulness, researchUtility },
    weights
  );
}
