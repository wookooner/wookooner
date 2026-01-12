// --- Chapter 4: Classifier Job ---
// Role: Orchestration (Input -> Signals -> Heuristics -> Estimation)
// Updated for Chapter 2: OAuth/OIDC Detection & Privacy Guards

import { extractUrlSignals, evaluateSignals } from '../signals/heuristics.js';
import { SIGNAL_CODES } from '../signals/signal_codes.js';
import { ActivityLevels } from '../signals/activity_levels.js';
import { EVIDENCE_TYPES } from '../signals/evidence_types.js';

// Chapter 2 Imports
import { OAUTH_CORE_KEYS, KNOWN_IDP_PATTERNS } from '../signals/oauth_constants.js';
import { getParamKeys } from '../utils/url_params.js';
import { isStrongAuthPath } from '../utils/url_path.js';
import { getDomain } from '../utils/domain.js';

/**
 * Internal: Checks for OAuth/OIDC indicators.
 * Implements the OR Logic: Core Params (>=2) OR Strong Path OR IdP Pattern.
 * @param {string} url 
 * @returns {Object} { isOAuth: boolean, evidence: string[] }
 */
function detectOAuth(url) {
  const evidence = [];
  let isOAuth = false;

  // 1. Core Params Check (Privacy Safe: Keys Only)
  const keys = getParamKeys(url);
  let matchCount = 0;
  keys.forEach(k => {
    if (OAUTH_CORE_KEYS.has(k)) matchCount++;
  });

  if (matchCount >= 2) {
    isOAuth = true;
    // We don't have a specific evidence type for Params in Ch0, 
    // usually falls under 'transition_qualifiers' or implied context, 
    // but Strong Path is the closest strong contract if path matches. 
    // For params-only, we treat it as strong signal for classification.
  }

  // 2. Strong Path Check
  if (isStrongAuthPath(url)) {
    isOAuth = true;
    evidence.push(EVIDENCE_TYPES.STRONG_PATH);
  }

  // 3. Known IdP Pattern
  const domain = getDomain(url);
  if (domain) {
    // Check if domain matches known IdPs
    const isIdP = KNOWN_IDP_PATTERNS.some(pattern => pattern.test(domain) || pattern.test(url));
    if (isIdP) {
      isOAuth = true; // Candidates for Auth flow
      // Note: IdP alone is usually 'strong_path' evidence contextually
    }
  }

  return { isOAuth, evidence };
}

/**
 * Runs classification logic for a given URL and optional explicit signals.
 * @param {string} url 
 * @param {string[]} [explicitSignals] - Signals from content script or other sources
 * @returns {Object} ActivityEstimation
 */
export function classify(url, explicitSignals = []) {
  // Recommendation A: Signal Vocabulary Safety Check
  const knownCodes = new Set(Object.values(SIGNAL_CODES));
  
  const validatedSignals = explicitSignals.filter(signal => {
    if (knownCodes.has(signal)) return true;
    console.warn(`[PDTM Classifier] Dropped unknown signal: ${signal}`);
    return false;
  });

  // 1. Gather Basic Heuristic Signals
  const urlSignals = extractUrlSignals(url);
  const allSignals = [...urlSignals, ...validatedSignals];

  // 2. Base Classification
  let result = evaluateSignals(allSignals);

  // 3. Chapter 2: OAuth/OIDC Overlay & Keyword Guard
  const oauthResult = detectOAuth(url);
  
  if (oauthResult.isOAuth) {
    // Upgrade to ACCOUNT level if not already Transaction
    // (Transaction > Account > UGC > View)
    if (result.level !== ActivityLevels.TRANSACTION) {
       result.level = ActivityLevels.ACCOUNT;
       result.confidence = "high";
       result.reasons.push("oauth_detected");
    }
  } else {
    // Keyword Guard (Downgrade Rule)
    // If Heuristics said ACCOUNT based ONLY on weak keywords ("login", "auth"), 
    // but strict OAuth rules failed, we assume it might be a false positive (e.g. /author).
    
    if (result.level === ActivityLevels.ACCOUNT) {
       // Check if reasons implies it relied on URL keywords
       const reliesOnUrl = result.reasons.some(r => r === SIGNAL_CODES.URL_LOGIN || r === SIGNAL_CODES.URL_ACCOUNT);
       const hasDomSignals = result.reasons.some(r => r.startsWith('dom_'));
       
       // If relying purely on URL keywords and NO OAuth confirmation and NO DOM signals
       if (reliesOnUrl && !hasDomSignals) {
          // Soften the classification
          // Instead of "High" confidence Account, we treat as "Medium" or downgrade to VIEW if ambiguous.
          
          // Heuristic Protection:
          // '/author' contains 'auth', but not 'login'.
          // 'extractUrlSignals' maps 'auth' -> URL_LOGIN.
          // We manually check for the "author" false positive here since we can't change heuristics.js easily.
          const lowerPath = url.toLowerCase();
          if (lowerPath.includes('/author') && !lowerPath.includes('/authorize')) {
             result.level = ActivityLevels.VIEW;
             result.confidence = "high"; // Confidently NOT account
             result.reasons = [SIGNAL_CODES.PASSIVE];
          } else {
             // Just "auth" or "login" without strict params? 
             // Treat as neutral/weak. Downgrade confidence.
             result.confidence = "low";
          }
       }
    }
  }

  // 4. Attach Evidence Flags (Chapter 0 Contract)
  result.evidenceFlags = oauthResult.evidence;

  return result;
}
