// --- Chapter 4: Classifier Job ---
// Role: Orchestration (Input -> Signals -> Heuristics -> Estimation)
// Updated for Chapter 2: OAuth/OIDC Detection & Privacy Guards

import { extractUrlSignals, evaluateSignals } from '../signals/heuristics.js';
import { SIGNAL_CODES } from '../signals/signal_codes.js';
import { ActivityLevels } from '../signals/activity_levels.js';
import { EVIDENCE_TYPES } from '../signals/evidence_types.js';

// Chapter 2 Imports
import { OAUTH_CORE_KEYS, KNOWN_IDP_DOMAIN_PATTERNS, KNOWN_IDP_URL_PATTERNS } from '../signals/oauth_constants.js';
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
    evidence.push(EVIDENCE_TYPES.OAUTH_PARAMS);
  }

  // 2. Strong Path Check
  if (isStrongAuthPath(url)) {
    isOAuth = true;
    evidence.push(EVIDENCE_TYPES.STRONG_PATH);
  }

  // 3. Known IdP Pattern (Split Check)
  // A. Domain Check
  const domain = getDomain(url);
  if (domain) {
    const isIdPDomain = KNOWN_IDP_DOMAIN_PATTERNS.some(pattern => pattern.test(domain));
    if (isIdPDomain) {
      isOAuth = true;
      // IdP match is contextual, but usually implies strong path/auth intent
    }
  }

  // B. URL Check (Specific Paths on Generic Domains)
  const isIdPUrl = KNOWN_IDP_URL_PATTERNS.some(pattern => pattern.test(url));
  if (isIdPUrl) {
    isOAuth = true;
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
    // If Heuristics predicted ACCOUNT, we must check if it relied ONLY on weak URL keywords.
    // If Strict OAuth Check failed AND no DOM signals exist, we treat it as a potential false positive (e.g. /author).
    
    if (result.level === ActivityLevels.ACCOUNT) {
       // A. Check if reasons are exclusively URL-based keywords
       // We ignore DOM_PASSWORD or explicit content script signals here.
       const weakUrlReasons = [SIGNAL_CODES.URL_LOGIN, SIGNAL_CODES.URL_ACCOUNT, SIGNAL_CODES.URL_SIGNUP];
       const reliesOnlyOnWeakUrl = result.reasons.every(r => weakUrlReasons.includes(r));
       
       // B. Check for DOM signals (Strong local evidence)
       const hasDomSignals = result.reasons.some(r => r.startsWith('dom_'));
       
       if (reliesOnlyOnWeakUrl && !hasDomSignals) {
          // Downgrade Logic
          // Without structural OAuth proof (params/strong-path) or DOM proof (password field),
          // a URL containing "login" or "account" is suggestive but not definitive enough 
          // to be classified as High Confidence Account Activity in this strict mode.
          
          // Downgrade to VIEW to be safe (avoiding False Positives like /author, /login-help)
          result.level = ActivityLevels.VIEW;
          result.confidence = "low";
          result.reasons = [SIGNAL_CODES.PASSIVE, "ambiguous_auth_keyword"];
       }
    }
  }

  // 4. Attach Evidence Flags (Chapter 0 Contract)
  result.evidenceFlags = oauthResult.evidence;

  return result;
}
