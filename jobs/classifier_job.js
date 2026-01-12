// --- Chapter 4: Classifier Job ---
// Role: Orchestration (Input -> Signals -> Heuristics -> Estimation)
// Updated for Chapter 2: OAuth/OIDC Detection & Privacy Guards
// Updated for Chapter 3: RP/IdP Inference & Confidence Contract
// Updated for Chapter 4: Risk Model & Management State

import { extractUrlSignals, evaluateSignals } from '../signals/heuristics.js';
import { SIGNAL_CODES } from '../signals/signal_codes.js';
import { ActivityLevels } from '../signals/activity_levels.js';
import { EVIDENCE_TYPES } from '../signals/evidence_types.js';

// Chapter 2 Imports
import { OAUTH_CORE_KEYS, KNOWN_IDP_DOMAIN_PATTERNS, KNOWN_IDP_URL_PATTERNS } from '../signals/oauth_constants.js';
import { getParamKeys } from '../utils/url_params.js';
import { isStrongAuthPath } from '../utils/url_path.js';
import { getDomain } from '../utils/domain.js';

// Chapter 3 Imports
import { createConfidenceState, addEvidenceOnce, finalizeConfidence } from '../utils/confidence.js';
import { EVIDENCE_WEIGHTS } from '../signals/evidence_weights.js';
import { inferRpFromRedirectUri, inferRpFromOpener, inferIdpDomain, checkTemporalRoundtrip } from '../utils/rp_inference.js';

// Chapter 4 Imports
import { computeBaseScore, computeRiskScore, computeRiskConfidence } from '../risk/risk_model.js';
import { mapToManagementState } from '../risk/state_mapper.js';
import { buildExplanation } from '../ui/explanations.js';

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
      evidence.push(EVIDENCE_TYPES.KNOWN_IDP); 
    }
  }

  // B. URL Check (Specific Paths on Generic Domains)
  const isIdPUrl = KNOWN_IDP_URL_PATTERNS.some(pattern => pattern.test(url));
  if (isIdPUrl) {
    isOAuth = true;
    evidence.push(EVIDENCE_TYPES.KNOWN_IDP);
  }

  return { isOAuth, evidence };
}

/**
 * Runs classification logic for a given URL and optional explicit signals.
 * @param {string} url 
 * @param {string[]} [explicitSignals] - Signals from content script or other sources
 * @param {Object} [context] - Chapter 3 Context (tabId, visitCount, etc.)
 * @returns {Promise<Object>} ActivityEstimation
 */
export async function classify(url, explicitSignals = [], context = {}) {
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

  // 3. Chapter 2 & 3: OAuth/OIDC Overlay
  const oauthResult = detectOAuth(url);
  
  // Variables for Ch4 Risk/State
  let rpCandidate = null;
  let idpCandidate = inferIdpDomain(url);
  
  if (oauthResult.isOAuth) {
    // --- Chapter 3: RP/IdP Inference & Confidence ---
    const confState = createConfidenceState();
    
    // 3.1 Add Chapter 2 Evidence (Static indicators)
    oauthResult.evidence.forEach(evType => {
      addEvidenceOnce(confState, evType, EVIDENCE_WEIGHTS[evType]);
    });

    // 3.2 RP Inference: Gather Candidates
    const rpFromRedirect = inferRpFromRedirectUri(url);
    const rpFromOpener = context.tabId ? await inferRpFromOpener(context.tabId) : null;

    // 3.3 Validate and Assign RP
    if (rpFromRedirect) {
       rpCandidate = rpFromRedirect;
       // Validation check
       if (rpFromOpener && rpFromRedirect === rpFromOpener) {
         addEvidenceOnce(confState, EVIDENCE_TYPES.REDIRECT_URI_MATCH, EVIDENCE_WEIGHTS[EVIDENCE_TYPES.REDIRECT_URI_MATCH]);
       }
    } else if (rpFromOpener) {
       rpCandidate = rpFromOpener;
    }

    // 3.4 Opener Evidence
    if (rpFromOpener) {
        addEvidenceOnce(confState, EVIDENCE_TYPES.OPENER_LINK, EVIDENCE_WEIGHTS[EVIDENCE_TYPES.OPENER_LINK]);
    }
       
    // 3.5 Temporal Roundtrip (Context)
    if (rpCandidate && idpCandidate) {
      const isRoundtrip = await checkTemporalRoundtrip(context.tabId, rpCandidate, idpCandidate);
      if (isRoundtrip) {
        addEvidenceOnce(confState, EVIDENCE_TYPES.TEMPORAL_CHAIN, EVIDENCE_WEIGHTS[EVIDENCE_TYPES.TEMPORAL_CHAIN]);
      }
    }

    // 3.6 Calculate Final Confidence
    const { confidence, evidenceFlags } = finalizeConfidence(confState);

    // 3.7 Merge into Result
    result.level = ActivityLevels.ACCOUNT;
    result.confidence = confidence >= 0.8 ? "high" : (confidence >= 0.5 ? "medium" : "low");
    result.numericConfidence = confidence; // Important for Risk Model
    result.reasons.push("oauth_detected");
    result.evidenceFlags = evidenceFlags;
    
    // Add inferred metadata
    if (rpCandidate) result.rp_domain = rpCandidate;
    if (idpCandidate) result.idp_domain = idpCandidate;

  } else {
    // Keyword Guard (Chapter 2 Downgrade Rule)
    if (result.level === ActivityLevels.ACCOUNT) {
       const weakUrlReasons = [SIGNAL_CODES.URL_LOGIN, SIGNAL_CODES.URL_ACCOUNT, SIGNAL_CODES.URL_SIGNUP];
       const reliesOnlyOnWeakUrl = result.reasons.every(r => weakUrlReasons.includes(r));
       const hasDomSignals = result.reasons.some(r => r.startsWith('dom_'));
       
       if (reliesOnlyOnWeakUrl && !hasDomSignals) {
          result.level = ActivityLevels.VIEW;
          result.confidence = "low";
          result.numericConfidence = 0.3; // Low confidence
          result.reasons = [SIGNAL_CODES.PASSIVE, "ambiguous_auth_keyword"];
       } else {
          // It's a valid account heuristic (e.g. DOM_PASSWORD)
          result.numericConfidence = result.confidence === "high" ? 0.8 : 0.5;
       }
    } else {
        // Default VIEW or TRANSACTION/UGC from heuristics
        result.numericConfidence = result.confidence === "high" ? 0.8 : (result.confidence === "medium" ? 0.5 : 0.3);
    }
  }

  // --- Chapter 4: Risk & State Mapping ---
  
  // 4.1 Risk Score
  const baseScore = computeBaseScore(result.level);
  result.risk_score = computeRiskScore({ 
    base: baseScore, 
    confidence: result.numericConfidence 
  });
  result.risk_confidence = computeRiskConfidence({ confidence: result.numericConfidence });

  // 4.2 Management State
  result.management_state = mapToManagementState({
    level: result.level,
    score: result.risk_score,
    confidence: result.numericConfidence,
    rp_domain: rpCandidate,
    evidenceFlags: result.evidenceFlags, // Fixed: Pass flags for Suggested logic
    seenCount: context.visitCount || 0,
    isPinned: context.isPinned || false
  });

  // 4.3 Explanation
  result.explanation = buildExplanation({
    evidenceFlags: result.evidenceFlags,
    rp_domain: rpCandidate,
    idp_domain: idpCandidate
  });

  return result;
}
