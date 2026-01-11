// --- Chapter 0: Confidence Contract ---
// Role: Arithmetic & Rules for Evidence Accumulation
// Enforces: Clamp [0,1], Deduplication, Aux Capping

import { EVIDENCE_TYPES } from '../signals/evidence_types.js';
import { AUX_CONSTANTS } from '../signals/aux_constants.js';

/**
 * Clamps a number between 0 and 1.
 * @param {number} x 
 * @returns {number}
 */
export function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

/**
 * Creates an initial confidence state.
 */
export function createConfidenceState() {
  return {
    score: 0,
    evidenceSet: new Set(),
    auxScore: 0
  };
}

/**
 * Adds evidence to the state enforcing deduplication and caps.
 * @param {Object} state - The confidence state
 * @param {string} evidenceType - One of EVIDENCE_TYPES
 * @param {number} weight - Raw weight (0.0 - 1.0)
 * @returns {Object} The mutated state
 */
export function addEvidenceOnce(state, evidenceType, weight) {
  // 1. Aux Logic (Additive but Capped)
  if (evidenceType === EVIDENCE_TYPES.TRANSITION_QUALIFIERS) {
    if (state.auxScore < AUX_CONSTANTS.MAX_BONUS) {
      const potential = state.auxScore + weight;
      state.auxScore = Math.min(potential, AUX_CONSTANTS.MAX_BONUS);
    }
    // We don't add TRANSITION_QUALIFIERS to evidenceSet for dedupe purposes 
    // in the same way (it allows accumulation up to cap), 
    // but we can track that *some* aux evidence existed.
    state.evidenceSet.add(evidenceType);
    return state;
  }

  // 2. Strong Evidence Logic (Strict Dedupe)
  if (!state.evidenceSet.has(evidenceType)) {
    state.evidenceSet.add(evidenceType);
    state.score += weight;
  }

  return state;
}

/**
 * Finalizes the confidence calculation applying guards.
 * @param {Object} state 
 * @returns {Object} { confidence: number, evidenceFlags: string[] }
 */
export function finalizeConfidence(state) {
  let finalScore = state.score + state.auxScore;

  // Guard: Aux Dependency
  // If we lack any STRONG evidence, we cannot exceed the safety cap.
  const strongTypes = [
    EVIDENCE_TYPES.REDIRECT_URI_MATCH,
    EVIDENCE_TYPES.STRONG_PATH, // Added in Chapter 0 Refinement
    EVIDENCE_TYPES.OPENER_LINK,
    EVIDENCE_TYPES.TEMPORAL_CHAIN
  ];
  
  const hasStrong = strongTypes.some(t => state.evidenceSet.has(t));

  if (!hasStrong && state.auxScore > 0) {
    finalScore = Math.min(finalScore, AUX_CONSTANTS.CAP_WITHOUT_STRONG_EVIDENCE);
  }

  return {
    confidence: clamp01(finalScore),
    evidenceFlags: Array.from(state.evidenceSet)
  };
}
