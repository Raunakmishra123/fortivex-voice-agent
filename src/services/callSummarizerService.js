/**
 * src/services/callSummarizerService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Fortivex AI — Post-Call Summary & Business Insights Generator
 *
 * PURPOSE  : Processes the full conversation history at call end to produce
 *            a structured summary: qualification outcome, objections, next steps,
 *            estimated deal value, and business analytics. Calls the backend API
 *            for LLM-powered summaries; falls back to rule-based generation.
 *
 * INPUTS   : Full conversation history, BANT scores, sentiment, lead info, duration
 * OUTPUTS  : Structured summary object for CallSummaryInsightsView component
 *
 * WHERE TO MODIFY:
 *   - Change next-step logic → NEXT_STEP_RULES array
 *   - Add new insight types → generateInsights()
 *   - Adjust deal value estimates → DEAL_VALUE_MAP
 *   - Switch to GPT-4 summary → uncomment callLlmSummarizer() (needs OPENAI_API_KEY)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

// ── Deal value estimates by qualification tier ─────────────────────────────────
const DEAL_VALUE_MAP = {
  hot:  { annual: '$9,588', plan: 'Professional', probability: '70%' },
  warm: { annual: '$3,588', plan: 'Starter',      probability: '35%' },
  cold: { annual: 'TBD',   plan: 'TBD',           probability: '10%' },
};

// ── Deterministic next-step rules (priority order) ───────────────────────────
const NEXT_STEP_RULES = [
  {
    condition: (data) => data.appointmentBooked,
    action: (data) => `Send meeting confirmation to ${data.leadEmail || 'prospect'} and prepare personalized demo with ${data.topicsDiscussed?.join(', ') || 'product overview'}.`,
  },
  {
    condition: (data) => data.avgBantScore >= 75,
    action: () => 'Send formal proposal within 24 hours. Include ROI calculator and customer case studies.',
  },
  {
    condition: (data) => data.avgBantScore >= 50 && data.objections.length > 0,
    action: (data) => `Address objections (${data.objections.slice(0, 1).join('; ').slice(0, 60)}...) with tailored content. Schedule 30-min follow-up call.`,
  },
  {
    condition: (data) => data.avgBantScore >= 50,
    action: () => 'Send product one-pager and schedule a 30-minute product demo within 48 hours.',
  },
  {
    condition: () => true, // Default fallback
    action: () => 'Add to 30-day email nurture sequence. Flag for SDR review in 2 weeks.',
  },
];

// ════════════════════════════════════════════════════════════════════════════
// CORE SUMMARY GENERATORS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Extracts structured data points from raw conversation history.
 * @param {Array} history - Array of { role, content, timestamp, intent }
 * @returns {Object} Extracted data
 */
function extractConversationData(history) {
  const userTurns = history.filter(t => t.role === 'user');
  const objections = [];
  const buyingSignals = [];
  const topicsDiscussed = new Set();

  for (const turn of userTurns) {
    const content = turn.content || '';

    // Extract objections
    if (/expensive|not sure|concern|hesitant|problem|can'?t afford/i.test(content)) {
      objections.push(content.length > 80 ? content.slice(0, 80) + '...' : content);
    }

    // Extract buying signals
    if (/interested|yes|great|perfect|definitely|let'?s|sign|purchase|book/i.test(content)) {
      buyingSignals.push(content.length > 80 ? content.slice(0, 80) + '...' : content);
    }

    // Track topics
    if (/price|cost|plan|pricing/i.test(content)) topicsDiscussed.add('Pricing');
    if (/security|gdpr|complian/i.test(content)) topicsDiscussed.add('Security & Compliance');
    if (/feature|multilingual|crm|integrat/i.test(content)) topicsDiscussed.add('Features & Integrations');
    if (/book|schedule|demo|meeting/i.test(content)) topicsDiscussed.add('Demo/Meeting Request');
    if (/latency|speed|perform/i.test(content)) topicsDiscussed.add('Performance');
  }

  return {
    totalTurns: history.length,
    userTurns: userTurns.length,
    objections: objections.length > 0 ? objections : ['No major objections detected'],
    buyingSignals: buyingSignals.length > 0 ? buyingSignals : [],
    topicsDiscussed: Array.from(topicsDiscussed),
  };
}

/**
 * Generates an array of actionable business insights from call data.
 * @param {Object} data - Aggregated call data
 * @returns {string[]} Array of insight strings
 */
function generateInsights(data) {
  const insights = [];

  if (data.sentimentScore >= 70) {
    insights.push(`🟢 High positive sentiment (${data.sentimentScore}%) — prospect is enthusiastic. Strike while hot.`);
  } else if (data.sentimentScore <= 40) {
    insights.push(`🔴 Low sentiment (${data.sentimentScore}%) — consider a different approach or persona on follow-up.`);
  }

  if (data.bantScores.budget === 0) {
    insights.push('💡 Budget not qualified — ask directly: "Do you have a budget allocated for sales tech this quarter?"');
  }

  if (data.bantScores.authority < 50) {
    insights.push('💡 Authority unclear — identify decision-maker before sending proposal.');
  }

  if (data.topicsDiscussed.includes('Security & Compliance')) {
    insights.push('📋 Prospect asked about compliance — send SOC 2 cert and GDPR data processing agreement.');
  }

  if (data.callDurationMinutes < 2) {
    insights.push('⚠️ Very short call — prospect may not be fully engaged. Use email to re-engage first.');
  }

  if (data.buyingSignals.length > 0) {
    insights.push(`✅ ${data.buyingSignals.length} buying signal(s) detected — prioritize this lead.`);
  }

  if (data.appointmentBooked) {
    insights.push('📅 Appointment confirmed — send prep email 24 hours before with agenda and product one-pager.');
  }

  return insights.length > 0 ? insights : ['Call completed. Review transcript for manual qualification.'];
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN SUMMARY FUNCTION
// ════════════════════════════════════════════════════════════════════════════

/**
 * Generates the full post-call summary. Tries the backend API first,
 * falls back to local rule-based generation.
 *
 * @param {Object} params
 * @param {Array}  params.conversationHistory  - Full call history
 * @param {Object} params.bantScores           - { budget, authority, need, timeline }
 * @param {number} params.sentimentScore       - 0–1
 * @param {number} params.durationSeconds      - Call duration
 * @param {string} params.leadName             - Prospect name
 * @param {string} params.language             - Detected language
 * @param {string} params.leadId               - CRM lead ID
 * @param {string} params.leadEmail            - Prospect email
 * @param {boolean} params.appointmentBooked   - Was an appointment booked?
 * @param {string} params.qualificationBadge   - 'hot' | 'warm' | 'cold'
 * @returns {Promise<Object>} Full summary object for CallSummaryInsightsView
 */
export async function generateCallSummary(params) {
  const {
    conversationHistory = [],
    bantScores = {},
    sentimentScore = 0.5,
    durationSeconds = 0,
    leadName = 'Prospect',
    language = 'English',
    leadId = null,
    leadEmail = '',
    appointmentBooked = false,
    qualificationBadge = 'cold',
  } = params;

  // Try server-side summary first (richer with real LLM if configured)
  try {
    const response = await fetch(`${API_BASE}/api/call/summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationHistory, bantScores, sentimentScore, durationSeconds, leadName, language }),
    });

    if (response.ok) {
      const serverData = await response.json();
      // Enrich server response with client-side data
      const extracted = extractConversationData(conversationHistory);
      const deal = DEAL_VALUE_MAP[qualificationBadge] || DEAL_VALUE_MAP.cold;
      return {
        ...serverData.summary,
        insights: generateInsights({
          ...extracted,
          sentimentScore: Math.round(sentimentScore * 100),
          bantScores,
          callDurationMinutes: Math.round(durationSeconds / 60),
          appointmentBooked,
        }),
        estimatedDealValue: deal.annual,
        dealProbability: deal.probability,
        recommendedPlan: deal.plan,
        leadId,
        leadEmail,
        appointmentBooked,
      };
    }
  } catch {
    console.warn('[callSummarizerService] Server unavailable, using local fallback');
  }

  // ── Local fallback summary ─────────────────────────────────────────────────
  const extracted = extractConversationData(conversationHistory);
  const avgBant = Math.round(Object.values(bantScores).reduce((a, b) => a + b, 0) / 4);
  const sentimentPct = Math.round(sentimentScore * 100);
  const deal = DEAL_VALUE_MAP[qualificationBadge] || DEAL_VALUE_MAP.cold;
  const callDurationMinutes = Math.round(durationSeconds / 60);

  // Find matching next-step rule
  const insightData = { ...extracted, avgBantScore: avgBant, sentimentScore: sentimentPct, bantScores, callDurationMinutes, appointmentBooked, leadEmail };
  const nextStep = NEXT_STEP_RULES.find(r => r.condition(insightData))?.action(insightData) || '';

  return {
    leadName,
    language,
    callDurationMinutes,
    qualificationStatus: avgBant >= 75 ? 'Hot Lead 🔥' : avgBant >= 50 ? 'Warm Lead 🌡️' : 'Cold Lead ❄️',
    bantScores,
    avgBantScore: avgBant,
    sentimentScore: sentimentPct,
    objections: extracted.objections,
    keyInsights: generateInsights(insightData),
    topicsDiscussed: extracted.topicsDiscussed,
    buyingSignals: extracted.buyingSignals,
    recommendedNextAction: nextStep,
    estimatedDealValue: deal.annual,
    dealProbability: deal.probability,
    recommendedPlan: deal.plan,
    leadId,
    leadEmail,
    appointmentBooked,
    generatedAt: new Date().toISOString(),
    totalTurns: extracted.totalTurns,
    userTurns: extracted.userTurns,
  };
}

/**
 * Formats call duration from seconds to a readable string.
 * @param {number} seconds
 * @returns {string} e.g. "3m 42s"
 */
export function formatCallDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
