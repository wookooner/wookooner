// --- Chapter 5: Risk Reasons & Constants ---
// Role: Vocabulary for Attention Score calculation
// Used for UI explanation.

export const RISK_REASONS = {
  // Activity Level Based
  LEVEL_TRANSACTION: "level_transaction", // High impact
  LEVEL_ACCOUNT: "level_account",         // Moderate impact
  LEVEL_UGC: "level_ugc",                 // Content creation
  
  // Frequency/Recency
  FREQUENT_VISITOR: "frequent_visitor",   // High visit count
  RARE_VISITOR: "rare_visitor",           // Low visit count (anomaly?)
  
  // User Overrides
  USER_WHITELISTED: "user_whitelisted",   // User said it's safe
  USER_PINNED: "user_pinned",             // Explicitly tracked
  
  // Categories
  CAT_FINANCE: "cat_finance",
  CAT_AUTH: "cat_auth",
  CAT_SHOPPING: "cat_shopping",
  CAT_SOCIAL: "cat_social",
  CAT_OTHER: "cat_other"
};

export const CATEGORIES = {
  FINANCE: "finance",
  AUTH: "auth",
  SHOPPING: "shopping",
  SOCIAL: "social",
  CLOUD: "cloud",
  OTHER: "other"
};

export const CATEGORY_LABELS = {
  [CATEGORIES.FINANCE]: "Finance / Banking",
  [CATEGORIES.AUTH]: "Identity / SSO",
  [CATEGORIES.SHOPPING]: "Shopping",
  [CATEGORIES.SOCIAL]: "Social Media",
  [CATEGORIES.CLOUD]: "Cloud / Infra",
  [CATEGORIES.OTHER]: "Other"
};