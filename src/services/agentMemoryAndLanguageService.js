/**
 * src/services/agentMemoryAndLanguageService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Fortivex AI — Multi-turn Conversation Memory & Language Detection Service
 *
 * PURPOSE  : Maintains conversation state across turns and routes responses
 *            to the correct language. Acts as the agent's "working memory."
 *
 * INPUTS   : User message string, existing conversation history array
 * OUTPUTS  : Updated memory object, detected language, context payload for API
 *
 * WHERE TO MODIFY:
 *   - Add a new language → LANGUAGE_PATTERNS object + SUPPORTED_LANGS array
 *   - Change memory window → MAX_HISTORY_TURNS constant
 *   - Add new intent patterns → INTENT_PATTERNS object
 *   - Integrate vector memory (Pinecone/Weaviate) → replaceLocalMemory()
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Configuration ─────────────────────────────────────────────────────────────
const MAX_HISTORY_TURNS = 20;   // Rolling window of turns kept in memory
const LANGUAGE_DETECT_THRESHOLD = 0.3; // Minimum confidence to switch language

// ── Language Detection Patterns ───────────────────────────────────────────────
// Keyword fingerprints for each language. Extend to add more languages.
const LANGUAGE_PATTERNS = {
  Hindi: {
    code: 'hi-IN',
    flag: '🇮🇳',
    keywords: ['नमस्ते', 'क्या', 'मुझे', 'आप', 'कैसे', 'हाँ', 'नहीं', 'धन्यवाद', 'कीमत', 'बजट',
               'namaste', 'kya', 'mujhe', 'aap', 'kaise', 'haan', 'nahi', 'shukriya'],
    scriptPattern: /[\u0900-\u097F]/,  // Devanagari Unicode block
  },
  Spanish: {
    code: 'es-ES',
    flag: '🇪🇸',
    keywords: ['hola', 'cómo', 'qué', 'gracias', 'sí', 'no', 'precio', 'presupuesto', 'necesito',
               'quiero', 'estoy', 'bueno', 'empresa', 'reunión', 'encantado', 'buenos'],
    scriptPattern: /[áéíóúñü¿¡]/i,
  },
  English: {
    code: 'en-US',
    flag: '🇺🇸',
    keywords: ['hello', 'hi', 'hey', 'what', 'how', 'yes', 'no', 'budget', 'price', 'need',
               'want', 'tell', 'more', 'interested', 'thanks', 'okay', 'sure', 'great'],
    scriptPattern: /^[a-z\s.,!?'"0-9]+$/i,
  },
};

// ── Intent Vocabulary (for memory tagging) ────────────────────────────────────
const INTENT_PATTERNS = {
  pricing:    /price|cost|pricing|budget|afford|expensive|cheap|plan|tier|presupuesto|कीमत/i,
  booking:    /book|schedule|meeting|demo|call|appointment|slot|calendar|reunión/i,
  security:   /security|gdpr|compliance|encrypt|privacy|safe|seguridad|सुरक्षा/i,
  features:   /feature|capability|multilingual|language|crm|integration|work|how does/i,
  objection:  /not sure|concerned|problem|issue|worry|hesitant|no thanks|pass/i,
  closing:    /let's go|sign up|purchase|buy|start|proceed|deal|contract/i,
};

// ════════════════════════════════════════════════════════════════════════════
// LANGUAGE DETECTION
// ════════════════════════════════════════════════════════════════════════════

/**
 * Detects the language of a given message using pattern matching.
 * Returns confidence scores to avoid false positives.
 * @param {string} message
 * @returns {{ language: string, code: string, confidence: number, flag: string }}
 */
export function detectLanguage(message) {
  if (!message || message.trim().length < 2) {
    return { language: 'English', code: 'en-US', confidence: 0.5, flag: '🇺🇸' };
  }

  const scores = {};
  const msgLower = message.toLowerCase();

  for (const [lang, config] of Object.entries(LANGUAGE_PATTERNS)) {
    let score = 0;

    // Script-level detection (high confidence)
    if (config.scriptPattern && config.scriptPattern.test(message)) {
      score += 0.6;
    }

    // Keyword match scoring
    const matchedKeywords = config.keywords.filter(kw => msgLower.includes(kw));
    score += matchedKeywords.length * 0.15;

    scores[lang] = Math.min(score, 1.0);
  }

  // Find highest-scoring language
  const detected = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  const [language, confidence] = detected;

  if (confidence < LANGUAGE_DETECT_THRESHOLD) {
    return { language: 'English', code: 'en-US', confidence: 0.5, flag: '🇺🇸' };
  }

  const config = LANGUAGE_PATTERNS[language];
  return { language, code: config.code, confidence, flag: config.flag };
}

// ════════════════════════════════════════════════════════════════════════════
// MEMORY MANAGEMENT
// ════════════════════════════════════════════════════════════════════════════

/**
 * Creates a fresh memory state object for a new call session.
 * @param {Object} leadInfo - Lead details from CRM
 * @returns {Object} Initial memory state
 */
export function createCallMemory(leadInfo = {}) {
  return {
    sessionId: `session-${Date.now()}`,
    leadName: leadInfo.name || 'Prospect',
    leadId: leadInfo.id || null,
    detectedLanguage: leadInfo.language || 'English',
    languageCode: LANGUAGE_PATTERNS[leadInfo.language]?.code || 'en-US',
    languageConfidence: 1.0,
    history: [],           // Array of { role, content, timestamp, intent }
    keyTopicsDiscussed: [], // e.g. ['pricing', 'security']
    objectionLog: [],       // All objections raised
    positivSignals: [],     // Buying signals
    lastIntent: null,
    turnCount: 0,
    callStartTime: Date.now(),
  };
}

/**
 * Adds a new turn to conversation memory and returns the updated memory.
 * Automatically detects language, extracts intent, and prunes to MAX_HISTORY_TURNS.
 * @param {Object} memory  - Current memory state (from createCallMemory)
 * @param {string} role    - 'user' or 'agent'
 * @param {string} content - Message content
 * @returns {Object} Updated memory state
 */
export function addTurnToMemory(memory, role, content) {
  // Detect language on user turns only
  let languageUpdate = {};
  if (role === 'user') {
    const detected = detectLanguage(content);
    // Only switch language if high confidence
    if (detected.confidence > LANGUAGE_DETECT_THRESHOLD && detected.language !== memory.detectedLanguage) {
      languageUpdate = {
        detectedLanguage: detected.language,
        languageCode: detected.code,
        languageConfidence: detected.confidence,
      };
    }
  }

  // Detect intent on user turns
  let intent = null;
  if (role === 'user') {
    for (const [intentName, pattern] of Object.entries(INTENT_PATTERNS)) {
      if (pattern.test(content)) {
        intent = intentName;
        break;
      }
    }
  }

  // Build turn object
  const turn = {
    role,
    content,
    timestamp: new Date().toISOString(),
    intent,
    language: role === 'user' ? (languageUpdate.detectedLanguage || memory.detectedLanguage) : null,
  };

  // Append to history, prune if over limit
  const history = [...memory.history, turn].slice(-MAX_HISTORY_TURNS);

  // Track discussed topics and objections
  const keyTopicsDiscussed = [...new Set([
    ...memory.keyTopicsDiscussed,
    ...(intent && !['objection', 'closing'].includes(intent) ? [intent] : []),
  ])];

  const objectionLog = intent === 'objection'
    ? [...memory.objectionLog, { content: content.slice(0, 100), timestamp: turn.timestamp }]
    : memory.objectionLog;

  const positivSignals = intent === 'closing'
    ? [...memory.positivSignals, { content: content.slice(0, 100), timestamp: turn.timestamp }]
    : memory.positivSignals;

  return {
    ...memory,
    ...languageUpdate,
    history,
    keyTopicsDiscussed,
    objectionLog,
    positivSignals,
    lastIntent: intent || memory.lastIntent,
    turnCount: memory.turnCount + 1,
  };
}

/**
 * Builds the context payload sent to the API for each agent turn.
 * Summarizes memory into a compact object.
 * @param {Object} memory - Current memory state
 * @returns {Object} Context for API call
 */
export function buildApiContext(memory) {
  return {
    language: memory.detectedLanguage,
    languageCode: memory.languageCode,
    leadName: memory.leadName,
    leadId: memory.leadId,
    turnCount: memory.turnCount,
    topicsDiscussed: memory.keyTopicsDiscussed,
    objectionCount: memory.objectionLog.length,
    lastIntent: memory.lastIntent,
    hasShownBuyingSignal: memory.positivSignals.length > 0,
  };
}

/**
 * Returns a human-readable memory summary for the MultilingualMemoryPanel UI.
 * @param {Object} memory
 * @returns {Object} Display-friendly summary
 */
export function getMemorySummary(memory) {
  const durationMs = Date.now() - memory.callStartTime;
  const durationSecs = Math.floor(durationMs / 1000);

  return {
    sessionId: memory.sessionId,
    leadName: memory.leadName,
    language: `${LANGUAGE_PATTERNS[memory.detectedLanguage]?.flag || '🌐'} ${memory.detectedLanguage}`,
    languageConfidence: `${Math.round(memory.languageConfidence * 100)}%`,
    turnCount: memory.turnCount,
    topicsDiscussed: memory.keyTopicsDiscussed,
    objections: memory.objectionLog.length,
    buyingSignals: memory.positivSignals.length,
    callDuration: `${Math.floor(durationSecs / 60)}m ${durationSecs % 60}s`,
    lastIntent: memory.lastIntent || 'none',
  };
}
