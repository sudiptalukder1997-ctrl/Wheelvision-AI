export const HOME = {
  emergentLink: 'home-emergent-link',
};

export const TID = {
  // Auth / nav
  loginBtn: 'login-btn',
  logoutBtn: 'logout-btn',
  navDashboard: 'nav-dashboard',
  navHistory: 'nav-history',
  navCoach: 'nav-coach',
  navPricing: 'nav-pricing',
  // Dashboard
  statsBalls: 'stat-balls',
  statsRuns: 'stat-runs',
  statsSR: 'stat-strike-rate',
  statsFours: 'stat-fours',
  statsSixes: 'stat-sixes',
  statsDots: 'stat-dots',
  // Shot controls
  shotType: (t) => `shot-type-${t.toLowerCase()}`,
  runBtn: (n) => `run-${n}`,
  logShotBtn: 'log-shot-btn',
  clearShotsBtn: 'clear-shots-btn',
  modeAuto: 'mode-auto',
  modeManual: 'mode-manual',
  handToggle: 'hand-toggle',
  // Wagon wheel
  wagonWheel: 'wagon-wheel-svg',
  filterRun: (n) => `filter-run-${n}`,
  // Coaching
  analyzeBtn: 'analyze-batting-btn',
  coachingPanel: 'coaching-panel',
  // Sessions
  newSessionBtn: 'new-session-btn',
  sessionItem: (i) => `session-item-${i}`,
  // Pricing
  upgradePro: 'upgrade-pro-btn',
  upgradeAcademy: 'upgrade-academy-btn',
  // Misc
  shareBtn: 'share-session-btn',
  uploadVideoBtn: 'upload-video-btn',
  liveCameraBtn: 'live-camera-btn',
};
