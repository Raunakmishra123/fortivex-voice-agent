/**
 * src/services/ragKnowledgeRetrievalService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Fortivex AI — RAG (Retrieval-Augmented Generation) Knowledge Service
 *
 * PURPOSE  : Retrieves relevant product/FAQ chunks from the local knowledge base
 *            to ground the AI agent's responses in accurate, up-to-date facts.
 *            Runs fully in-browser — no vector DB needed for MVP.
 *            Swap localSearch() for a Pinecone/Weaviate call for production.
 *
 * INPUTS   : User query string, optional filters (category, type)
 * OUTPUTS  : Array of ranked knowledge chunks with source citations
 *
 * WHERE TO MODIFY:
 *   - Add new knowledge categories → productKnowledgeBase.json
 *   - Tune relevance scoring → scoreChunk() function
 *   - Switch to vector DB → replaceWithVectorSearch() placeholder below
 *   - Add synonyms for better recall → QUERY_SYNONYMS map
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Synonym expansion (improves recall without vector search) ─────────────────
const QUERY_SYNONYMS = {
  'price': ['cost', 'pricing', 'plan', 'tier', 'fee', 'rate'],
  'book': ['schedule', 'appointment', 'meeting', 'demo', 'calendar'],
  'secure': ['security', 'gdpr', 'compliance', 'encrypt', 'privacy', 'safe'],
  'feature': ['capability', 'functionality', 'include', 'support', 'does it'],
  'crm': ['salesforce', 'hubspot', 'zoho', 'pipedrive', 'integration'],
  'language': ['multilingual', 'hindi', 'spanish', 'english', 'french', 'localization'],
  'ai': ['artificial intelligence', 'machine learning', 'nlp', 'model'],
  'latency': ['speed', 'fast', 'slow', 'response time', 'delay'],
};

// ── Chunk type weights (product info is higher priority than FAQ for pricing) ──
const TYPE_WEIGHTS = { product: 1.2, faq: 1.0 };

// ════════════════════════════════════════════════════════════════════════════
// KNOWLEDGE BASE LOADER
// ════════════════════════════════════════════════════════════════════════════

let _cachedKnowledgeBase = null;

/**
 * Loads and caches the knowledge base from the JSON data file.
 * In production, replace this with a vector DB client initialization.
 * @returns {Promise<Object>} The full knowledge base object
 */
export async function loadKnowledgeBase() {
  if (_cachedKnowledgeBase) return _cachedKnowledgeBase;

  try {
    // Dynamic import works with Vite's static asset handling
    const response = await fetch('/src/data/productKnowledgeBase.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    _cachedKnowledgeBase = await response.json();
    return _cachedKnowledgeBase;
  } catch (err) {
    // Fallback: fetch from backend API
    try {
      const res = await fetch('http://localhost:3001/api/rag/search?q=');
      const data = await res.json();
      console.warn('[ragKnowledgeRetrievalService] Using server fallback for KB');
      return data;
    } catch {
      console.error('[ragKnowledgeRetrievalService] Could not load knowledge base:', err);
      return { products: [], faqs: [] };
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// SCORING ENGINE
// ════════════════════════════════════════════════════════════════════════════

/**
 * Expands a query with synonyms for better keyword recall.
 * @param {string} query
 * @returns {string[]} Array of all query terms (original + synonyms)
 */
function expandQueryTerms(query) {
  const baseTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  const expanded = new Set(baseTerms);

  for (const term of baseTerms) {
    for (const [key, synonyms] of Object.entries(QUERY_SYNONYMS)) {
      if (term === key || synonyms.includes(term)) {
        expanded.add(key);
        synonyms.forEach(s => expanded.add(s));
      }
    }
  }

  return Array.from(expanded);
}

/**
 * Scores a single knowledge chunk against the query terms.
 * @param {Object} chunk  - { type, data, tags, text }
 * @param {string[]} terms - Expanded query terms
 * @returns {number} Relevance score (higher = more relevant)
 */
function scoreChunk(chunk, terms) {
  const { type, tags = [], text = '' } = chunk;
  const textLower = text.toLowerCase();
  const tagStr = tags.join(' ').toLowerCase();
  let score = 0;

  for (const term of terms) {
    // Tag match = high signal (exact topic match)
    if (tagStr.includes(term)) score += 3;
    // Text match = medium signal
    if (textLower.includes(term)) score += 1;
  }

  // Apply type weight
  score *= TYPE_WEIGHTS[type] || 1.0;

  return score;
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN RETRIEVAL FUNCTION
// ════════════════════════════════════════════════════════════════════════════

/**
 * Searches the knowledge base and returns the top-k most relevant chunks.
 * This is the primary function called by the React frontend and agent loop.
 *
 * @param {string} query     - User's natural language question
 * @param {number} topK      - Number of results to return (default: 3)
 * @param {string} filterType- 'product' | 'faq' | null (no filter)
 * @returns {Promise<Array>} Ranked array of { type, data, score, citation, snippet }
 */
export async function retrieveRelevantChunks(query, topK = 3, filterType = null) {
  if (!query || query.trim().length < 2) return [];

  const kb = await loadKnowledgeBase();
  const terms = expandQueryTerms(query);
  const results = [];

  // ── Index and score products ───────────────────────────────────────────────
  if (!filterType || filterType === 'product') {
    for (const product of (kb.products || [])) {
      const text = `${product.name} ${product.category} ${product.features?.join(' ')} ${product.ideal_for}`;
      const chunk = { type: 'product', tags: product.tags || [], text };
      const score = scoreChunk(chunk, terms);
      if (score > 0) {
        results.push({
          type: 'product',
          data: product,
          score,
          citation: `Fortivex AI — ${product.name} (Product Catalog)`,
          snippet: `${product.name}: \$${product.price_usd_per_month}/mo — ${product.features?.slice(0, 2).join(', ')}`,
        });
      }
    }
  }

  // ── Index and score FAQs ───────────────────────────────────────────────────
  if (!filterType || filterType === 'faq') {
    for (const faq of (kb.faqs || [])) {
      const text = `${faq.question} ${faq.answer}`;
      const chunk = { type: 'faq', tags: faq.tags || [], text };
      const score = scoreChunk(chunk, terms);
      if (score > 0) {
        results.push({
          type: 'faq',
          data: faq,
          score,
          citation: `Fortivex AI — FAQ: ${faq.question.slice(0, 50)}`,
          snippet: faq.answer.slice(0, 150) + (faq.answer.length > 150 ? '...' : ''),
        });
      }
    }
  }

  // Sort by score descending, return top-k
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/**
 * Formats RAG chunks into a plain-text context string for LLM injection.
 * @param {Array} chunks - From retrieveRelevantChunks()
 * @returns {string}
 */
export function formatChunksAsContext(chunks) {
  if (!chunks.length) return '';
  return chunks.map((c, i) =>
    `[${i + 1}] ${c.citation}\n${c.snippet}`
  ).join('\n\n');
}

/**
 * PRODUCTION PLACEHOLDER — Replace localSearch with this for real vector search.
 * Connect to Pinecone/Weaviate/ChromaDB by filling in the client call.
 */
export async function replaceWithVectorSearch(query, topK = 3) {
  // const pinecone = new PineconeClient({ apiKey: process.env.PINECONE_API_KEY });
  // const index = pinecone.Index('fortivex-kb');
  // const queryEmbedding = await openai.embeddings.create({ input: query, model: 'text-embedding-3-small' });
  // const results = await index.query({ vector: queryEmbedding.data[0].embedding, topK });
  // return results.matches.map(m => ({ ...m.metadata, score: m.score }));
  throw new Error('Vector search not configured — set PINECONE_API_KEY in .env');
}
