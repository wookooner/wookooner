// --- Chapter 4: Activity Levels ---
// Role: Official Taxonomy Definition
// These enums represent the "depth" of interaction.

export const ActivityLevel = {
  VIEW: "view",               // Passive consumption
  ACCOUNT: "account",         // Login, settings, profile
  UGC: "ugc",                 // Creation, editing, posting
  TRANSACTION: "transaction"  // Checkout, payment, high-risk actions
};

// Types removed for JS compatibility
// export type ActivityConfidence = "low" | "medium" | "high";
// export interface ActivityEstimation ...
