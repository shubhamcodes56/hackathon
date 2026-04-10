const URGENCY_PATTERNS = [
  /immediately/i,
  /urgent/i,
  /right now/i,
  /within\s+\d+\s+(minute|minutes|hour|hours)/i,
  /act now/i,
  /final notice/i,
  /last warning/i,
  /account (suspended|blocked|locked)/i,
  /verify (now|immediately)/i,
  /otp/i,
  /one[ -]?time password/i,
  /police/i,
  /legal action/i,
  /arrest/i,
];

const FEAR_PATTERNS = [
  /your account will be closed/i,
  /penalty/i,
  /fine/i,
  /fraud alert/i,
  /security breach/i,
  /suspicious activity/i,
  /identity theft/i,
  /report to authorities/i,
  /you will lose access/i,
  /permanently disabled/i,
];

function scorePatternList(text, patterns, weightPerHit, cap) {
  let score = 0;
  let hits = 0;

  for (const pattern of patterns) {
    if (pattern.test(text)) {
      hits += 1;
      score += weightPerHit;
    }
  }

  return {
    hits,
    score: Math.min(score, cap),
  };
}

function analyzeUrgencyAndFear(text = "") {
  const urgency = scorePatternList(text, URGENCY_PATTERNS, 8, 48);
  const fear = scorePatternList(text, FEAR_PATTERNS, 10, 50);

  const allCapsRatio = text.length
    ? (text.match(/[A-Z]/g) || []).length / text.length
    : 0;
  const punctuationBurst = (text.match(/[!?]{2,}/g) || []).length;

  let styleScore = 0;
  if (allCapsRatio > 0.18) styleScore += 8;
  if (punctuationBurst > 0) styleScore += Math.min(12, punctuationBurst * 4);

  const combined = Math.min(100, urgency.score + fear.score + styleScore);

  return {
    urgencyHits: urgency.hits,
    fearHits: fear.hits,
    styleScore,
    score: combined,
    level: combined >= 70 ? "high" : combined >= 40 ? "medium" : "low",
  };
}

module.exports = {
  analyzeUrgencyAndFear,
};
