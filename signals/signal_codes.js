// --- Chapter 4: Signal Codes ---
// Role: Vocabulary for Classification Logic
// Used for UI explanation and debugging.

export const SIGNAL_CODES = {
  // URL Based
  URL_LOGIN: "url_login",           // 'login', 'signin'
  URL_SIGNUP: "url_signup",         // 'signup', 'register'
  URL_ACCOUNT: "url_account",       // 'account', 'settings', 'profile'
  URL_EDITOR: "url_editor",         // 'edit', 'compose', 'write'
  URL_CHECKOUT: "url_checkout",     // 'checkout', 'cart', 'payment'
  
  // DOM Based (Content Script)
  DOM_PASSWORD: "dom_password",     // <input type="password">
  DOM_EDITOR: "dom_editor",         // contenteditable, textarea with specific attributes
  DOM_PAYMENT: "dom_payment",       // CC input patterns, payment buttons
  
  // Default
  PASSIVE: "passive_view"
};