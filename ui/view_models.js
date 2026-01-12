// --- UI View Models ---
// Role: Transform raw storage data into UI-ready lists
// Logic: Hard/Soft separation, sorting rules

import { ActivityLevels } from '../signals/activity_levels.js';
import { MANAGEMENT_STATE, isManaged } from '../storage/management_state.js';

/**
 * Priorities for Hard List sorting
 */
const LEVEL_PRIORITY = {
  [ActivityLevels.TRANSACTION]: 3,
  [ActivityLevels.UGC]: 2,
  [ActivityLevels.ACCOUNT]: 1,
  [ActivityLevels.VIEW]: 0
};

/**
 * Builds the "Needs Management" (Hard) List
 * Rule: management_state implies Managed (SUGGESTED or PINNED)
 * Sort: Level Priority > Risk Score > Last Seen
 */
export function buildHardList(domainStates, activityStates, riskStates, overrides) {
  return Object.keys(activityStates)
    .filter(domain => {
      // Use the Management State stored in activity state (calculated by classifier)
      const state = activityStates[domain]?.management_state;
      
      // Fallback: If no management_state (legacy data), check overrides
      const isPinned = overrides[domain]?.pinned;
      
      return isManaged(state) || isPinned;
    })
    .map(domain => {
      const activity = activityStates[domain];
      const risk = riskStates[domain] || { score: 0 };
      const override = overrides[domain] || {};
      
      return {
        domain,
        level: activity.last_estimation_level,
        score: activity.risk_score || risk.score, // Use fresh score if available
        last_seen: activity.last_estimation_ts,
        reasons: risk.reasons || [],
        explanation: activity.explanation || "Detected activity", // Chapter 4 Explainability
        pinned: !!override.pinned,
        whitelisted: !!override.whitelisted,
        category: override.category,
        count_map: activity.counts_by_level,
        state: activity.management_state
      };
    })
    .sort((a, b) => {
      // 0. Pinned First
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;

      // 1. Level Priority
      const prioDiff = LEVEL_PRIORITY[b.level] - LEVEL_PRIORITY[a.level];
      if (prioDiff !== 0) return prioDiff;
      
      // 2. Risk Score
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) return scoreDiff;
      
      // 3. Recency
      return b.last_seen - a.last_seen;
    });
}

/**
 * Builds the "Review" (Soft) List
 * Rule: management_state implies Surfaced but NOT Managed (NEEDS_REVIEW)
 */
export function buildSoftList(domainStates, activityStates, riskStates, overrides, threshold = 25) {
  return Object.keys(activityStates)
    .filter(domain => {
      const activity = activityStates[domain];
      const state = activity?.management_state;
      const isIgnored = overrides[domain]?.ignored;

      // Logic: Must be surfaced (Review/Suggested/Pinned) but NOT Managed (Suggested/Pinned)
      // AND not ignored.
      // Essentially: state === NEEDS_REVIEW
      
      // For MVP transition: If state exists, use it. If not, fallback to legacy view check.
      if (state) {
        return !isIgnored && state === MANAGEMENT_STATE.NEEDS_REVIEW;
      }
      
      // Legacy Fallback (keeping for robustness during data migration)
      return !isIgnored && 
             activity?.last_estimation_level === ActivityLevels.VIEW &&
             (riskStates[domain]?.score || 0) >= threshold;
    })
    .map(domain => {
      const activity = activityStates[domain];
      const risk = riskStates[domain] || { score: 0 };
      const override = overrides[domain] || {};

      return {
        domain,
        level: activity.last_estimation_level,
        score: activity.risk_score || risk.score,
        last_seen: activity.last_estimation_ts,
        reasons: risk.reasons || [],
        explanation: activity.explanation,
        pinned: !!override.pinned,
        whitelisted: !!override.whitelisted,
        category: override.category,
        state: activity.management_state
      };
    })
    .sort((a, b) => {
      // 1. Risk Score
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) return scoreDiff;
      
      // 2. Recency
      return b.last_seen - a.last_seen;
    });
}

/**
 * Builds the Overview Stats
 */
export function buildOverviewStats(events, hardList, softList, policy) {
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const todayCount = events.filter(e => (e.ts || 0) >= startOfToday).length;

  return {
    todayCount,
    hardCount: hardList.length,
    softCount: softList.length,
    lastCleanup: policy.last_cleanup_ts
  };
}

/**
 * Checks if a domain is in the Hard list (to show "Managed" badge in Recent)
 */
export function isManagedDomain(domain, activityStates) {
  const state = activityStates[domain]?.management_state;
  return isManaged(state);
}
