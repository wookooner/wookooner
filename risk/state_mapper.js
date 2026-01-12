// --- Chapter 4: State Mapper ---
// Role: Decision Logic (State Machine) for Management State
// Inputs: Subtype (Level), Risk Score, Confidence, Context
// Output: MANAGEMENT_STATE

import { MANAGEMENT_STATE } from '../storage/management_state.js';
import { ActivityLevels } from '../signals/activity_levels.js';
import { EVIDENCE_TYPES } from '../signals/evidence_types.js';

/**
 * Maps classification results to a UI Management State.
 * @param {Object} params
 * @param {string} params.level - ActivityLevel
 * @param {number} params.score - Calculated Risk Score (0-100)
 * @param {number} params.confidence - Classification Confidence (0-1)
 * @param {string} [params.rp_domain] - If an RP was inferred
 * @param {string[]} [params.evidenceFlags] - Evidence detected
 * @param {number} [params.seenCount] - Total visit count (for frequency rules)
 * @param {boolean} [params.isPinned] - If user has pinned it (override)
 * @returns {string} MANAGEMENT_STATE enum value
 */
export function mapToManagementState({ level, score, confidence, rp_domain, evidenceFlags = [], seenCount = 0, isPinned = false }) {
  
  // 1. User Override (Highest Priority)
  if (isPinned) {
    return MANAGEMENT_STATE.PINNED;
  }

  // 2. SUGGESTED Rules (High Confidence & Impact)
  // Goal: Only "Definite" items.
  if (confidence >= 0.8) {
    // A. Transactions are inherently high value
    if (level === ActivityLevels.TRANSACTION) {
      return MANAGEMENT_STATE.SUGGESTED;
    }
    
    // B. Accounts (Login/SSO)
    // Fix: Prevent generic logins (Base 30 * 0.8 = 24) from becoming Suggested.
    // Requirement: Must have an inferred RP (SSO Context) OR Strong Auth Evidence (Redirect/Roundtrip).
    if (level === ActivityLevels.ACCOUNT) {
      const hasStrongAuth = evidenceFlags.includes(EVIDENCE_TYPES.REDIRECT_URI_MATCH) || 
                            evidenceFlags.includes(EVIDENCE_TYPES.TEMPORAL_CHAIN);
                            
      if (rp_domain || hasStrongAuth) {
        return MANAGEMENT_STATE.SUGGESTED;
      }
    }
  }

  // 3. NEEDS_REVIEW Rules (Candidate)
  // Goal: "Sensitive items worth checking" without spamming.
  
  // Guard: Minimum Confidence to bother user (unless frequency is massive)
  const decentConfidence = confidence >= 0.6;
  
  // Rule A: High Risk Score (>= 40)
  // This captures:
  // - Transactions (Base 70 * 0.6 = 42)
  // - High Conf UGC (Base 45 * 0.9 = 40.5)
  // - High Conf Account WITH frequency boost (30 + 10 = 40)
  if (level !== ActivityLevels.VIEW && decentConfidence) {
    if (score >= 40) {
      return MANAGEMENT_STATE.NEEDS_REVIEW;
    }
  }

  // Rule B: Habitual Usage (Frequency)
  // If user visits often (e.g., > 100 times), it's significant regardless of exact type.
  if (seenCount >= 100) {
    // Filter out pure noise if confidence is extremely low
    if (confidence > 0.3) {
      return MANAGEMENT_STATE.NEEDS_REVIEW;
    }
  }
  
  // Special Case: Extreme frequency Views (e.g. News sites visited daily)
  if (level === ActivityLevels.VIEW && seenCount >= 200) {
    return MANAGEMENT_STATE.NEEDS_REVIEW;
  }

  // 4. Default
  return MANAGEMENT_STATE.NONE;
}
