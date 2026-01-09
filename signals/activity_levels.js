// --- Chapter 4: Activity Levels ---
// Role: Official Taxonomy Definition (JS runtime-safe)

export const ActivityLevels = Object.freeze({
  VIEW: "view",               // Passive consumption
  ACCOUNT: "account",         // Login, settings, profile
  UGC: "ugc",                 // Creation, editing, posting
  TRANSACTION: "transaction"  // Checkout, payment, high-risk actions
});

/**
 * @typedef {"view"|"account"|"ugc"|"transaction"} ActivityLevel
 */
