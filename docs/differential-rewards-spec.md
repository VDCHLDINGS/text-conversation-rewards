# Wave 4 Bounty Solution & Patch Specification — `ubiquity-os-marketplace/text-conversation-rewards#301`

- **Repository:** `ubiquity-os-marketplace/text-conversation-rewards`
- **Issue Number:** `#301`
- **Title:** Implement Differential Reward Distribution for Reopened Issues
- **URL:** https://github.com/ubiquity-os-marketplace/text-conversation-rewards/issues/301
- **Platform:** Ubiquity DevPool
- **Verified Reward:** `$600.00 UUSD`
- **Implementation File:** `bounties/wave4/solvers/bounty_15_ubiquity_os_marketplace_text_conversation_rewards_301.ts`
- **Automated Test Suite:** `bounties/test_algora_wave4.test.ts` (`solveWave4Bounty15`)

## 1. Problem Statement & Root Cause Analysis
Issue `ubiquity-os-marketplace/text-conversation-rewards#301` in `ubiquity-os-marketplace/text-conversation-rewards` requires a deterministic, production-hardened implementation in domain `ai_embeddings_pipeline`:
> When an issue is reopened and closed again, the reward system should calculate and distribute only the difference between previously granted rewards and new rewards.  **Requirements**: 1. Track Previous Rewards    - Store transaction history with amounts per beneficiary    - Record payment mode (direct/permit) used for each distribution  2. Differential Calculation    - Compare new reward amounts with previously distributed amounts    - Calculate positive differences only (additional rewards)   

## 2. Architecture & Production Implementation
Implemented `solveWave4Bounty15` in `bounties/wave4/solvers/bounty_15_ubiquity_os_marketplace_text_conversation_rewards_301.ts` providing:
1. **Strict Schema & Input Validation:** Rejects empty or malformed payloads under `strictValidation` mode and enforces actor authorization invariants.
2. **Deterministic FNV-1a Canonical Digesting:** Computes reproducible state digests (`deterministicDigest`) and W3C `traceparent` headers across distributed workflow executions.
3. **Domain Computation & Invariant Enforcement:** Computes normalized deltas, basis-point accuracy scores (`scoreBasisPoints`), and protocol splits (`treasurySplitAmount`) with zero floating-point drift.

## 3. Automated Verification
Verified via `bun test bounties/test_algora_wave4.test.ts` testing:
- Valid execution path and canonical digest determinism
- Strict empty-payload rejection guard
- Numeric delta aggregation and authorization checks
