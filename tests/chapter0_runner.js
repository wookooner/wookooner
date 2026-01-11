// --- Chapter 0: Test Runner ---
// Run with node: node tests/chapter0_runner.js
// (Assuming standard ES module support in environment)

import { createConfidenceState, addEvidenceOnce, finalizeConfidence } from '../utils/confidence.js';
import { isRoundtrip } from '../utils/roundtrip.js';
import { EVIDENCE_TYPES } from '../signals/evidence_types.js';

console.log("🚦 Running Chapter 0 Contracts Tests...\n");

let passed = 0;
let failed = 0;

function assert(desc, condition) {
  if (condition) {
    console.log(`✅ ${desc}`);
    passed++;
  } else {
    console.error(`❌ ${desc}`);
    failed++;
  }
}

// --- Test Suite 1: Confidence ---

// Case A: Perfect Scenario
const s1 = createConfidenceState();
addEvidenceOnce(s1, EVIDENCE_TYPES.REDIRECT_URI_MATCH, 0.6);
addEvidenceOnce(s1, EVIDENCE_TYPES.TEMPORAL_CHAIN, 0.2);
addEvidenceOnce(s1, EVIDENCE_TYPES.OPENER_LINK, 0.2);
const r1 = finalizeConfidence(s1);
assert("Confidence sums to 1.0 correctly", r1.confidence === 1.0);

// Case B: Deduplication
const s2 = createConfidenceState();
addEvidenceOnce(s2, EVIDENCE_TYPES.REDIRECT_URI_MATCH, 0.6);
addEvidenceOnce(s2, EVIDENCE_TYPES.REDIRECT_URI_MATCH, 0.6); // Duplicate
const r2 = finalizeConfidence(s2);
assert("Duplicate evidence is ignored", r2.confidence === 0.6);

// Case C: Aux Capping
const s3 = createConfidenceState();
addEvidenceOnce(s3, EVIDENCE_TYPES.REDIRECT_URI_MATCH, 0.5);
addEvidenceOnce(s3, EVIDENCE_TYPES.TRANSITION_QUALIFIERS, 0.08);
addEvidenceOnce(s3, EVIDENCE_TYPES.TRANSITION_QUALIFIERS, 0.08); // Total 0.16 -> Cap 0.1
const r3 = finalizeConfidence(s3);
// Expected: 0.5 + 0.1 (cap) = 0.6
assert("Aux signals are capped at 0.1", Math.abs(r3.confidence - 0.6) < 0.001);

// Case D: Aux Dependency Guard
const s4 = createConfidenceState();
addEvidenceOnce(s4, EVIDENCE_TYPES.TRANSITION_QUALIFIERS, 0.1); 
// No strong evidence. Suppose we had other non-strong evidence pushing it high?
// Let's force score manually to test guard (simulating logic error or weak signals)
s4.score = 0.8; 
const r4 = finalizeConfidence(s4);
assert("Confidence capped at 0.6 without strong evidence", r4.confidence === 0.6);

// --- Test Suite 2: Roundtrip ---

const now = Date.now();
const rp = "rp.com";
const idp = "idp.com";

// Case A: Valid Roundtrip
const validEvents = [
  { ts: now, domain: idp, tabId: 1 },
  { ts: now + 5000, domain: rp, tabId: 1 }
];
// Note: This simple case fails the STRICT RP->IdP check because there is no RP preceding IdP.
// We must simulate the full chain [RP, IdP, RP] for the new strict logic.
const strictChainEvents = [
  { ts: now, domain: rp, tabId: 1 },
  { ts: now + 100, domain: idp, tabId: 1 },
  { ts: now + 5000, domain: rp, tabId: 1 }
];
assert("Valid RP->IdP->RP roundtrip accepted", isRoundtrip({ rpCandidate: rp, idpCandidate: idp, events: strictChainEvents }));

// Case B: Too Slow (TTL)
const slowEvents = [
  { ts: now, domain: rp, tabId: 1 },
  { ts: now + 100, domain: idp, tabId: 1 },
  { ts: now + 35000, domain: rp, tabId: 1 } // > 30s
];
assert("Exceeded TTL rejected", !isRoundtrip({ rpCandidate: rp, idpCandidate: idp, events: slowEvents }));

// Case C: Wrong Context (Different Tabs, No Link)
const diffTabEvents = [
  { ts: now, domain: rp, tabId: 1 },
  { ts: now + 100, domain: idp, tabId: 1 },
  { ts: now + 1000, domain: rp, tabId: 2 }
];
assert("Different tabs rejected", !isRoundtrip({ rpCandidate: rp, idpCandidate: idp, events: diffTabEvents }));

// Case D: Valid Context (Linked Opener)
const linkedEvents = [
  { ts: now, domain: rp, tabId: 1 },
  { ts: now + 100, domain: idp, tabId: 1 },
  { ts: now + 1000, domain: rp, tabId: 2, openerTabId: 1 }
];
assert("Opener linked tabs accepted", isRoundtrip({ rpCandidate: rp, idpCandidate: idp, events: linkedEvents }));

// Case E: Strict Precedence Fail
// Events: [Other, IdP, RP]. IdP is present, RP is present later, but RP did not precede IdP.
const unrelatedEvents = [
  { ts: now, domain: "google.com", tabId: 1 }, 
  { ts: now + 100, domain: idp, tabId: 1 },
  { ts: now + 5000, domain: rp, tabId: 1 }
];
assert("Strict RP->IdP precedence enforced (Unrelated start)", !isRoundtrip({ rpCandidate: rp, idpCandidate: idp, events: unrelatedEvents }));

console.log(`\nResults: ${passed} Passed, ${failed} Failed.`);
