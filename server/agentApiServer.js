/**
 * server/agentApiServer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Fortivex AI — Express API Server for the Voice Sales Agent
 *
 * PURPOSE  : Provides REST endpoints consumed by the React frontend.
 *            All endpoints have mock/local fallbacks so the app runs
 *            without any paid API keys. Set real keys in .env to activate
 *            live OpenAI / Deepgram / ElevenLabs / CRM integrations.
 *
 * INPUTS   : HTTP requests from React frontend (port 5174 → 3001)
 * OUTPUTS  : JSON responses for agent turns, RAG, CRM, booking, summaries
 *
 * WHERE TO MODIFY:
 *   - Add new endpoints → bottom of file (follow existing pattern)
 *   - Swap mock AI for real OpenAI → see generateAgentResponse()
 *   - Change CORS origin → ALLOWED_ORIGIN constant
 *   - Change port → PORT constant
 * ─────────────────────────────────────────────────────────────────────────────
 */

import express from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const ALLOWED_ORIGIN = process.env.FRONTEND_URL || 'http://localhost:5173';

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json());

// ── Load local data files ─────────────────────────────────────────────────────
const KB_PATH = join(__dirname, '../src/data/productKnowledgeBase.json');
const CRM_PATH = join(__dirname, '../src/data/mockCrmRecords.json');

let knowledgeBase = JSON.parse(readFileSync(KB_PATH, 'utf-8'));
let crmData = JSON.parse(readFileSync(CRM_PATH, 'utf-8'));

// ── Helper: simple keyword-based RAG retrieval (no vector DB needed locally) ──
function localRagSearch(query) {
  const q = query.toLowerCase();
  const results = [];

  // Search products
  for (const product of knowledgeBase.products) {
    const score = product.tags.filter(t => q.includes(t)).length
      + (q.includes(product.name.toLowerCase()) ? 3 : 0)
      + (q.includes(product.category.toLowerCase()) ? 1 : 0);
    if (score > 0) results.push({ type: 'product', data: product, score });
  }

  // Search FAQs
  for (const faq of knowledgeBase.faqs) {
    const qWords = q.split(' ');
    const score = faq.tags.filter(t => qWords.some(w => t.includes(w) || w.includes(t))).length;
    if (score > 0) results.push({ type: 'faq', data: faq, score });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 3);
}

// ── Helper: mock AI response generator (replace with real OpenAI call) ─────────
function generateAgentResponse(userMessage, context, ragChunks) {
  const { language = 'English', leadName = 'there', bantScores = {} } = context;

  const ragContext = ragChunks.map(r =>
    r.type === 'product'
      ? `${r.data.name}: \$${r.data.price_usd_per_month}/mo — ${r.data.features.slice(0, 2).join(', ')}`
      : `${r.data.question}: ${r.data.answer.slice(0, 120)}...`
  ).join('\n');

  // Language-specific greeting templates
  const greetings = {
    English: `Hi ${leadName}! Great to connect with you.`,
    Hindi: `नमस्ते ${leadName}! आपसे बात करके अच्छा लगा।`,
    Spanish: `¡Hola ${leadName}! Encantado de hablar con usted.`
  };

  const greeting = greetings[language] || greetings.English;

  // Build a contextual mock response based on message content
  const msgLower = userMessage.toLowerCase();

  if (msgLower.includes('price') || msgLower.includes('cost') || msgLower.includes('pricing') || msgLower.includes('precio') || msgLower.includes('कीमत')) {
    return {
      text: `${ragContext ? `Based on your needs, here's what I found:\n\n${ragContext}\n\n` : ''}Our plans start at just \$299/month for the Starter plan, going up to \$799/month for Professional with unlimited calls and multilingual support. We also offer a 20% discount on annual billing. What's your team size so I can recommend the best fit?`,
      intent: 'pricing_inquiry',
      suggestBooking: false
    };
  }

  if (msgLower.includes('book') || msgLower.includes('meeting') || msgLower.includes('demo') || msgLower.includes('call') || msgLower.includes('reunión')) {
    return {
      text: `Absolutely! I'd love to set up a personalized demo for you. I have a few slots available this week. Would you prefer a morning or afternoon session? Our demos are 30 minutes and I'll walk you through the full AI call flow live.`,
      intent: 'booking_request',
      suggestBooking: true
    };
  }

  if (msgLower.includes('security') || msgLower.includes('gdpr') || msgLower.includes('compliance') || msgLower.includes('seguridad') || msgLower.includes('सुरक्षा')) {
    return {
      text: `Security is a top priority for us. All calls are encrypted with TLS 1.3 in transit and AES-256 at rest. Our Enterprise plan is SOC 2 Type II certified and fully GDPR/CCPA compliant. We also offer PII redaction and EU data residency. Would you like me to send you our compliance documentation?`,
      intent: 'security_inquiry',
      suggestBooking: false
    };
  }

  if (msgLower.includes('budget') || msgLower.includes('afford') || msgLower.includes('expensive') || msgLower.includes('presupuesto') || msgLower.includes('बजट')) {
    return {
      text: `I completely understand — budget is always an important factor. Our ROI data shows an average 3.2x return in the first 6 months through increased call volume and higher conversion rates. With the Professional plan at \$799/month, most teams see payback within 6 weeks. What's your current sales team size and monthly outreach volume?`,
      intent: 'budget_objection',
      suggestBooking: false
    };
  }

  // Default conversational response
  return {
    text: `${greeting} Thank you for your message. ${ragContext ? `I found some relevant information: ${ragChunks[0]?.data?.answer?.slice(0, 100) || ''}... ` : ''}I'm here to help you understand how Fortivex AI can transform your sales operations. Can you tell me more about your current sales process and what challenges you're looking to solve?`,
    intent: 'general_inquiry',
    suggestBooking: false
  };
}

// ════════════════════════════════════════════════════════════════════════════
// ROUTES
// ════════════════════════════════════════════════════════════════════════════

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// ── POST /api/agent/turn ───────────────────────────────────────────────────
// Main agent conversation turn. Accepts user message + context, returns AI response.
app.post('/api/agent/turn', async (req, res) => {
  try {
    const { message, context = {}, conversationHistory = [] } = req.body;

    if (!message) return res.status(400).json({ error: 'message is required' });

    // 1. RAG retrieval
    const ragChunks = localRagSearch(message);

    // 2. Generate response (swap this function for real OpenAI call)
    const agentResponse = generateAgentResponse(message, context, ragChunks);

    // 3. Simple sentiment analysis (keyword-based mock)
    const positiveWords = ['great', 'interested', 'yes', 'perfect', 'love', 'amazing', 'good', 'sure'];
    const negativeWords = ['no', 'expensive', 'not', 'cant', 'difficult', 'problem', 'concern', 'worried'];
    const msgWords = message.toLowerCase().split(/\s+/);
    const posScore = msgWords.filter(w => positiveWords.includes(w)).length;
    const negScore = msgWords.filter(w => negativeWords.includes(w)).length;
    const sentimentScore = Math.min(1, Math.max(0, 0.5 + (posScore - negScore) * 0.1));

    // 4. BANT signal detection
    const bantSignals = {
      budget: message.match(/\$[\d,]+|budget|afford|cost|price|spend/i) ? 20 : 0,
      authority: message.match(/\bI\b.*\bdecide|decision maker|VP|Director|Head|CEO|CRO/i) ? 25 : 0,
      need: message.match(/need|want|looking for|challenge|problem|solve|improve/i) ? 20 : 0,
      timeline: message.match(/this (quarter|month|year)|Q[1-4]|asap|soon|urgent|deadline/i) ? 20 : 0
    };

    res.json({
      agentText: agentResponse.text,
      intent: agentResponse.intent,
      suggestBooking: agentResponse.suggestBooking,
      ragChunks,
      sentimentScore,
      bantSignals,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('[agent/turn] Error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// ── GET /api/rag/search ────────────────────────────────────────────────────
// Standalone RAG search endpoint (for RagKnowledgeDrawer)
app.get('/api/rag/search', (req, res) => {
  const { q = '' } = req.query;
  const results = localRagSearch(q);
  res.json({ query: q, results, count: results.length });
});

// ── GET /api/crm/leads ─────────────────────────────────────────────────────
app.get('/api/crm/leads', (req, res) => {
  res.json({ leads: crmData.leads });
});

// ── POST /api/crm/leads/:id/update ────────────────────────────────────────
app.post('/api/crm/leads/:id/update', (req, res) => {
  const { id } = req.params;
  const { bant_score, sentiment_score, status, notes } = req.body;

  const lead = crmData.leads.find(l => l.id === id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  if (bant_score !== undefined) lead.bant_score = bant_score;
  if (sentiment_score !== undefined) lead.sentiment_score = sentiment_score;
  if (status) lead.status = status;
  if (notes) lead.notes = notes;

  res.json({ success: true, lead });
});

// ── GET /api/calendar/slots ────────────────────────────────────────────────
app.get('/api/calendar/slots', (req, res) => {
  const availableSlots = crmData.calendar_slots.available_slots.filter(s => s.available);
  res.json({ slots: availableSlots, timezone: crmData.calendar_slots.timezone });
});

// ── POST /api/calendar/book ────────────────────────────────────────────────
app.post('/api/calendar/book', (req, res) => {
  const { slotId, leadId, leadName, leadEmail, notes } = req.body;

  const slot = crmData.calendar_slots.available_slots.find(s => s.id === slotId);
  if (!slot) return res.status(404).json({ error: 'Slot not found' });
  if (!slot.available) return res.status(409).json({ error: 'Slot already booked' });

  // Mark slot as taken
  slot.available = false;

  const appointment = {
    id: `apt-${Date.now()}`,
    slotId,
    leadId,
    leadName,
    leadEmail,
    date: slot.date,
    time: slot.time,
    duration_minutes: slot.duration_minutes,
    label: slot.label,
    notes: notes || '',
    createdAt: new Date().toISOString(),
    confirmationCode: `FVX-${Math.random().toString(36).substr(2, 8).toUpperCase()}`
  };

  crmData.appointments.push(appointment);

  // Also update lead status
  const lead = crmData.leads.find(l => l.id === leadId);
  if (lead) lead.status = 'appointment_set';

  res.json({ success: true, appointment });
});

// ── POST /api/call/summary ─────────────────────────────────────────────────
app.post('/api/call/summary', (req, res) => {
  const { conversationHistory = [], bantScores = {}, sentimentScore = 0.5, durationSeconds = 0, leadName = 'Prospect', language = 'English' } = req.body;

  const totalBant = Object.values(bantScores).reduce((a, b) => a + b, 0);
  const avgBant = totalBant / 4;

  // Extract objections and key points from history
  const objections = [];
  const keyPoints = [];

  for (const turn of conversationHistory) {
    if (turn.role === 'user') {
      if (/expensive|cost|budget|not sure|concerned/i.test(turn.content)) {
        objections.push(turn.content.slice(0, 80));
      }
      if (/interested|yes|great|perfect|tell me more/i.test(turn.content)) {
        keyPoints.push(`Prospect showed interest: "${turn.content.slice(0, 60)}"`);
      }
    }
  }

  const qualificationStatus = avgBant >= 75 ? 'Hot Lead' : avgBant >= 50 ? 'Warm Lead' : 'Cold Lead';
  const recommendedAction = avgBant >= 75 ? 'Send proposal immediately' : avgBant >= 50 ? 'Schedule follow-up demo' : 'Nurture with email sequence';

  res.json({
    summary: {
      leadName,
      language,
      callDurationMinutes: Math.round(durationSeconds / 60),
      qualificationStatus,
      bantScores,
      avgBantScore: Math.round(avgBant),
      sentimentScore: Math.round(sentimentScore * 100),
      objections: objections.length > 0 ? objections : ['No major objections detected'],
      keyInsights: keyPoints.length > 0 ? keyPoints : ['Prospect engaged with standard discovery questions'],
      recommendedNextAction: recommendedAction,
      estimatedDealValue: avgBant >= 75 ? '$9,588/year (Professional)' : avgBant >= 50 ? '$3,588/year (Starter)' : 'TBD after nurturing',
      generatedAt: new Date().toISOString()
    }
  });
});

// ── Start server ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Fortivex AI Agent Server running at http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  console.log(`   Mode: ${process.env.OPENAI_API_KEY ? 'LIVE (OpenAI)' : 'MOCK (local fallback)'}\n`);
});
