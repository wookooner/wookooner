// --- Chapter 4: Heuristics ---
// Role: Logic Engine (Signals -> Estimation)
// Pure functions only. No storage access.

import { ActivityLevels } from './activity_levels.js';
import { SIGNAL_CODES } from './signal_codes.js';

/**
 * Evaluates a list of signals to determine the activity level.
 * Priority: TRANSACTION > UGC > ACCOUNT > VIEW
 * @param {string[]} signals
 */
export function evaluateSignals(signals) {
  const uniqueSignals = new Set(signals);
  const reasons = [];

  // 1. Transaction Check
  if (uniqueSignals.has(SIGNAL_CODES.URL_CHECKOUT) || uniqueSignals.has(SIGNAL_CODES.DOM_PAYMENT)) {
    const matched = Array.from(uniqueSignals).filter(s => 
      s === SIGNAL_CODES.URL_CHECKOUT || s === SIGNAL_CODES.DOM_PAYMENT
    );
    reasons.push(...matched);
    return {
      level: ActivityLevels.TRANSACTION,
      confidence: uniqueSignals.size > 1 ? "high" : "medium",
      reasons
    };
  }

  // 2. UGC Check
  if (uniqueSignals.has(SIGNAL_CODES.URL_EDITOR) || uniqueSignals.has(SIGNAL_CODES.DOM_EDITOR)) {
    const matched = Array.from(uniqueSignals).filter(s => 
      s === SIGNAL_CODES.URL_EDITOR || s === SIGNAL_CODES.DOM_EDITOR
    );
    reasons.push(...matched);
    return {
      level: ActivityLevels.UGC,
      confidence: "medium",
      reasons
    };
  }

  // 3. Account Check
  if (
    uniqueSignals.has(SIGNAL_CODES.URL_LOGIN) || 
    uniqueSignals.has(SIGNAL_CODES.URL_SIGNUP) || 
    uniqueSignals.has(SIGNAL_CODES.URL_ACCOUNT) ||
    uniqueSignals.has(SIGNAL_CODES.DOM_PASSWORD)
  ) {
    const matched = Array.from(uniqueSignals).filter(s => 
      [SIGNAL_CODES.URL_LOGIN, SIGNAL_CODES.URL_SIGNUP, SIGNAL_CODES.URL_ACCOUNT, SIGNAL_CODES.DOM_PASSWORD].includes(s)
    );
    reasons.push(...matched);
    return {
      level: ActivityLevels.ACCOUNT,
      confidence: "high",
      reasons
    };
  }

  // 4. Default: View
  return {
    level: ActivityLevels.VIEW,
    confidence: "high",
    reasons: [SIGNAL_CODES.PASSIVE]
  };
}

/**
 * Analyzes URL string for keyword signals
 * @param {string} urlStr
 * @returns {string[]}
 */
export function extractUrlSignals(urlStr) {
  const signals = [];
  try {
    const url = new URL(urlStr);
    const path = url.pathname.toLowerCase();

    if (path.includes('checkout') || path.includes('cart') || path.includes('payment') || path.includes('billing')) {
      signals.push(SIGNAL_CODES.URL_CHECKOUT);
    }
    
    if (path.includes('edit') || path.includes('compose') || path.includes('write') || path.includes('upload')) {
      signals.push(SIGNAL_CODES.URL_EDITOR);
    }

    if (path.includes('login') || path.includes('signin') || path.includes('auth')) {
      signals.push(SIGNAL_CODES.URL_LOGIN);
    } else if (path.includes('signup') || path.includes('register') || path.includes('join')) {
      signals.push(SIGNAL_CODES.URL_SIGNUP);
    } else if (path.includes('account') || path.includes('settings') || path.includes('profile') || path.includes('dashboard')) {
      signals.push(SIGNAL_CODES.URL_ACCOUNT);
    }

  } catch (e) {
    // Invalid URL
  }
  return signals;
}
