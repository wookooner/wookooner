// --- Chapter 5: Risk Calculation Job ---
// Role: Logic Engine (Activity + Stats + Overrides -> Risk Score)
// Calculates "Management Necessity Score" (0-100)

import { ActivityLevels } from '../signals/activity_levels.js';
import { RISK_REASONS, CATEGORIES } from '../signals/risk_reasons.js';
import { ACTIVITY_STATE_KEY } from '../storage/activity_state.js';
import { DOMAIN_STATE_KEY } from '../storage/domain_state.js';
import { USER_OVERRIDES_KEY } from '../storage/user_overrides.js';
import { updateRiskRecord } from '../storage/risk_state.js';

/**
 * Calculates and updates the risk score for a specific domain.
 * Fetches necessary dependencies (Activity, Stats, Overrides) internally.
 * @param {string} domain 
 * @param {Object} storageAPI 
 */
export async function updateRiskForDomain(domain, storageAPI) {
  // 1. Fetch Dependencies
  const data = await storageAPI.get([
    ACTIVITY_STATE_KEY,
    DOMAIN_STATE_KEY,
    USER_OVERRIDES_KEY
  ]);

  const activityState = data[ACTIVITY_STATE_KEY]?.[domain];
  const domainState = data[DOMAIN_STATE_KEY]?.[domain];
  const override = data[USER_OVERRIDES_KEY]?.[domain];

  // If ignored, remove risk record or set to 0. We'll set to 0 and mark confidence low.
  if (override?.ignored) {
    await updateRiskRecord(domain, {
      score: 0,
      confidence: "high",
      reasons: [],
      last_updated_ts: Date.now()
    }, storageAPI);
    return;
  }

  // 2. Base Score from Activity Level
  let score = 5; // Default View baseline
  const reasons = [];
  const level = activityState?.last_estimation_level || ActivityLevels.VIEW;

  switch (level) {
    case ActivityLevels.TRANSACTION:
      score = 70;
      reasons.push(RISK_REASONS.LEVEL_TRANSACTION);
      break;
    case ActivityLevels.UGC:
      score = 45;
      reasons.push(RISK_REASONS.LEVEL_UGC);
      break;
    case ActivityLevels.ACCOUNT:
      score = 30;
      reasons.push(RISK_REASONS.LEVEL_ACCOUNT);
      break;
    default:
      score = 5; 
      break;
  }

  // 3. Frequency Boost
  const totalVisits = domainState?.visit_count_total || 0;
  if (totalVisits > 200) {
    score += 10;
    reasons.push(RISK_REASONS.FREQUENT_VISITOR);
  } else if (totalVisits > 50) {
    score += 5;
  }

  // 4. Category Boosts
  if (override?.category) {
    switch (override.category) {
      case CATEGORIES.FINANCE:
        score += 20;
        reasons.push(RISK_REASONS.CAT_FINANCE);
        break;
      case CATEGORIES.AUTH:
        score += 15;
        reasons.push(RISK_REASONS.CAT_AUTH);
        break;
      case CATEGORIES.SHOPPING:
        score += 10;
        reasons.push(RISK_REASONS.CAT_SHOPPING);
        break;
    }
  }

  // 5. User Controls (Cuts)
  if (override?.whitelisted) {
    score = Math.max(0, score - 30);
    reasons.push(RISK_REASONS.USER_WHITELISTED);
  }
  
  if (override?.pinned) {
    // Pinned items might be high importance, but we don't necessarily increase risk score.
    // It's a retention signal primarily.
    reasons.push(RISK_REASONS.USER_PINNED);
  }

  // 6. Clamp (0-100)
  score = Math.min(100, Math.max(0, score));

  // 7. Save
  await updateRiskRecord(domain, {
    score,
    confidence: "medium", // MVP fixed confidence
    reasons,
    last_updated_ts: Date.now()
  }, storageAPI);
}
