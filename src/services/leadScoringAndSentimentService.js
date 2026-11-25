/**
 * src/services/leadScoringAndSentimentService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Fortivex AI — BANT Lead Scoring & Real-Time Sentiment Analysis Service
 *
 * PURPOSE  : Evaluates each conversation turn for BANT qualification signals
 *            and updates a running sentiment score using keyword NLP.
 *            No external API needed — works fully in-browser.
 *
 * INPUTS   : User message string, current BANT scores object, sentiment history
 * OUTPUTS  : Updated BANT object, sentiment score (0–1), qualification status
 *
 * WHERE TO MODIFY:
 *   - Add new BANT signals → BANT_SIGNALS object
 *   - Adjust scoring weights → SIGNAL_WEIGHTS object
 *   - Switch to real sentiment API → replaceLocalSentiment() placeholder below
 *   - Change qualification thresholds → QUALIFICATION_THRESHOLDS
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── BANT Signal Keywords ───────────────────────────────────────────────────────
// Each criterion has POSITIVE (raises score) and NEGATIVE (lowers score) patterns.
const BANT_SIGNALS = {
  budget: {
    positive: [
      /\$[\d,]+/,                                              // Explicit dollar amount
      /budget\s*(is|of|around|about)?\s*[\d]/i,
      /we\s*(have|allocated|set aside|approved)/i,
      /spend(ing)?\s*(up to|around|about)/i,
      /afford/i,
      /investment/i,
    ],
    negative: [
      /no budget/i,
      /can'?t afford/i,
      /too expensive/i,
      /out of budget/i,
      /not in the budget/i,
    ],
    scorePerMatch: 18,
    maxScore: 100,
  },
  authority: {
    positive: [
      /\b(I|we)\s*(decide|make the decision|approve|sign off)/i,
      /\b(VP|Director|Head|CEO|CRO|CFO|Founder|Owner|Manager|Lead)\b/i,
      /decision maker/i,
      /my team/i,
      /I('?m| am) responsible/i,
    ],
    negative: [
      /need to check with/i,
      /my boss/i,
      /not my call/i,
      /have to ask/i,
      /not authorized/i,
    ],
    scorePerMatch: 25,
    maxScore: 100,
  },
  need: {
    positive: [
      /need(ing)?|want(ing)?|looking for|require|require/i,
      /challenge|problem|pain point|issue|struggle/i,
      /improve|optimize|scale|grow|increase/i,
      /currently\s*(using|doing)/i,
      /interested in/i,
    ],
    negative: [
      /don'?t need/i,
      /not looking/i,
      /not interested/i,
      /have everything/i,
    ],
    scorePerMatch: 15,
    maxScore: 100,
  },
  timeline: {
    positive: [
      /this (quarter|month|week|year)/i,
      /Q[1-4]/i,
      /asap|urgent|immediately|soon|right away/i,
      /by (January|February|March|April|May|June|July|August|September|October|November|December)/i,
      /within (a|the|next) (week|month|quarter)/i,
      /deadline/i,
    ],
    negative: [
      /not (now|yet|sure when)/i,
      /maybe next year/i,
      /no rush/i,
      /someday/i,
      /eventually/i,
    ],
    scorePerMatch: 20,
    maxScore: 100,
  },
};

// ── Qualification Thresholds ───────────────────────────────────────────────────
export const QUALIFICATION_THRESHOLDS = {
  hot:  75,   // Average BANT ≥ 75 → Hot Lead (immediate follow-up)
  warm: 50,   // Average BANT 50–74 → Warm Lead (nurture + follow-up)
  cold: 0,    // Average BANT < 50 → Cold Lead (email sequence)
};

// ── Sentiment Word Lists ───────────────────────────────────────────────────────
const SENTIMENT_LEXICON = {
  strongPositive: ['excellent', 'perfect', 'love', 'amazing', 'fantastic', 'great', 'definitely', 'absolutely', 'exactly', 'wonderful', 'impressed'],
  positive: ['good', 'interested', 'yes', 'sure', 'okay', 'like', 'helpful', 'nice', 'appreciate', 'useful', 'valuable'],
  neutral: ['maybe', 'perhaps', 'possibly', 'considering', 'thinking', 'unsure', 'tell me more', 'what about'],
  negative: ['no', 'concern', 'worry', 'hesitant', 'expensive', 'difficult', 'complicated', 'not sure'],
  strongNegative: ['terrible', 'horrible', 'awful', 'hate', 'never', 'impossible', 'scam', 'waste', 'useless', 'disappointed'],
};

// ════════════════════════════════════════════════════════════════════════════
// BANT SCORING
// ════════════════════════════════════════════════════════════════════════════

/**
 * Returns a fresh BANT scores object at the start of a call.
 */
export function createInitialBantScores() {
  return { budget: 0, authority: 0, need: 0, timeline: 0 };
}

/**
 * Updates BANT scores based on a single user message.
 * Scores are CUMULATIVE across the conversation (never reset per turn).
 * @param {Object} currentScores - Existing { budget, authority, need, timeline }
 * @param {string} message       - Latest user utterance
 * @returns {Object} Updated BANT scores
 */
export function updateBantScores(currentScores, message) {
  const updated = { ...currentScores };

  for (const [criterion, config] of Object.entries(BANT_SIGNALS)) {
    let delta = 0;

    // Check positive signals
    for (const pattern of config.positive) {
      if (pattern.test(message)) delta += config.scorePerMatch;
    }

    // Check negative signals (reduce score)
    for (const pattern of config.negative) {
      if (pattern.test(message)) delta -= config.scorePerMatch * 1.5;
    }

    // Apply delta, clamp to [0, maxScore]
    updated[criterion] = Math.min(
      config.maxScore,
      Math.max(0, updated[criterion] + delta)
    );
  }

  return updated;
}

// ════════════════════════════════════════════════════════════════════════════
// SENTIMENT ANALYSIS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Analyzes sentiment of a single message.
 * Returns a score from 0.0 (very negative) to 1.0 (very positive), 0.5 neutral.
 * @param {string} message
 * @returns {{ score: number, label: string, breakdown: Object }}
 */
export function analyzeSentiment(message) {
  const words = message.toLowerCase().split(/\s+/);
  let score = 0.5; // Start neutral
  const breakdown = { strongPositive: 0, positive: 0, neutral: 0, negative: 0, strongNegative: 0 };

  for (const word of words) {
    const clean = word.replace(/[^a-z]/g, '');
    if (SENTIMENT_LEXICON.strongPositive.includes(clean)) { score += 0.12; breakdown.strongPositive++; }
    else if (SENTIMENT_LEXICON.positive.includes(clean))  { score += 0.06; breakdown.positive++; }
    else if (SENTIMENT_LEXICON.negative.includes(clean))  { score -= 0.06; breakdown.negative++; }
    else if (SENTIMENT_LEXICON.strongNegative.includes(clean)) { score -= 0.12; breakdown.strongNegative++; }
  }

  score = Math.min(1.0, Math.max(0.0, score));

  const label = score >= 0.7 ? 'Very Positive'
    : score >= 0.55 ? 'Positive'
    : score >= 0.4  ? 'Neutral'
    : score >= 0.25 ? 'Negative'
    : 'Very Negative';

  return { score: parseFloat(score.toFixed(3)), label, breakdown };
}

/**
 * Smooths sentiment over time using exponential moving average.
 * Prevents wild swings from single words.
 * @param {number} historicalScore - Previous running sentiment (0–1)
 * @param {number} newScore        - Latest turn sentiment (0–1)
 * @param {number} alpha           - Smoothing factor (0.3 = more stable)
 * @returns {number} Smoothed score
 */
export function smoothSentiment(historicalScore, newScore, alpha = 0.3) {
  return parseFloat((alpha * newScore + (1 - alpha) * historicalScore).toFixed(3));
}

// ════════════════════════════════════════════════════════════════════════════
// QUALIFICATION STATUS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Derives overall lead qualification from BANT scores.
 * @param {Object} bantScores - { budget, authority, need, timeline }
 * @returns {{ status: string, avgScore: number, color: string, emoji: string }}
 */
export function getQualificationStatus(bantScores) {
  const values = Object.values(bantScores);
  const avgScore = values.length > 0
    ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
    : 0;

  if (avgScore >= QUALIFICATION_THRESHOLDS.hot) {
    return { status: 'Hot Lead 🔥', avgScore, color: '#ef4444', badge: 'hot' };
  } else if (avgScore >= QUALIFICATION_THRESHOLDS.warm) {
    return { status: 'Warm Lead 🌡️', avgScore, color: '#f97316', badge: 'warm' };
  } else {
    return { status: 'Cold Lead ❄️', avgScore, color: '#3b82f6', badge: 'cold' };
  }
}
