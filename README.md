# Fortivex AI — Autonomous Sales Voice Agent MVP

> **Project 1** of the Fortivex AI Technical Challenge  
> Stack: React (Vite + Tailwind) · Node.js + Express · Web Speech API · Zustand · Local RAG

---

## ⚡ Quick Start (Single Command)

```bash
# 1. Navigate into the project
cd "fortivex-voice-agent"

# 2. Install all dependencies
npm install

# 3. Launch both frontend + backend together
npm start
```

- **Frontend** → http://localhost:5173  
- **Backend API** → http://localhost:3001/api/health

> **No API keys required.** The app runs fully on local mocks. Add optional keys to `.env` (copy from `.env.example`) to activate live OpenAI/ElevenLabs/CRM APIs.

### Individual Commands
```bash
npm run dev      # Vite frontend only (port 5173)
npm run server   # Express backend only (port 3001)
npm run build    # Production build
```

---

## 🗺️ Interviewer File Navigator

> Every Fortivex AI requirement maps 1-to-1 to an exact file. Open any file in seconds.

### Frontend Components (`src/components/`)

| Requirement | File | Key Responsibility |
|---|---|---|
| Voice call UI · STT · TTS · text fallback | [`VoiceCallConsole.jsx`](src/components/VoiceCallConsole.jsx) | Mic toggle, live transcript, TTS playback, text input fallback, latency display |
| Multilingual memory display | [`MultilingualMemoryPanel.jsx`](src/components/MultilingualMemoryPanel.jsx) | Auto-detected language badge, turn count, topics, objection log, buying signals |
| BANT scoring + sentiment meter | [`LeadQualificationCard.jsx`](src/components/LeadQualificationCard.jsx) | Animated BANT bars (Budget/Authority/Need/Timeline), qualification badge, sentiment spectrum |
| RAG knowledge chunks + citations | [`RagKnowledgeDrawer.jsx`](src/components/RagKnowledgeDrawer.jsx) | Product & FAQ chunks, expandable cards, source citations, relevance scores |
| Appointment booking + CRM sync | [`AppointmentBookingModal.jsx`](src/components/AppointmentBookingModal.jsx) | Calendar slot picker, booking confirmation, CRM sync status indicator |
| Post-call summary + insights | [`CallSummaryInsightsView.jsx`](src/components/CallSummaryInsightsView.jsx) | Qualification outcome, objections, AI insights, next-action recommendation, JSON export |

### Services (`src/services/`)

| Requirement | File | Key Responsibility |
|---|---|---|
| STT + TTS + voice I/O | [`sttTtsVoiceService.js`](src/services/sttTtsVoiceService.js) | Web Speech API, mic permission, TTS voice selection, language codes, latency simulation |
| Conversation memory + language detection | [`agentMemoryAndLanguageService.js`](src/services/agentMemoryAndLanguageService.js) | 20-turn rolling memory, NLP language detection (EN/HI/ES), intent tagging, context builder |
| BANT scoring + sentiment | [`leadScoringAndSentimentService.js`](src/services/leadScoringAndSentimentService.js) | Keyword BANT signals, cumulative scoring, sentiment lexicon, smoothed EMA, qualification thresholds |
| RAG knowledge retrieval | [`ragKnowledgeRetrievalService.js`](src/services/ragKnowledgeRetrievalService.js) | Synonym expansion, keyword scoring, product + FAQ indexing, top-K results, Pinecone placeholder |
| CRM + calendar booking | [`crmAndCalendarService.js`](src/services/crmAndCalendarService.js) | Slot lookup, appointment creation, lead update, CRM sync status, error handling |
| Post-call summary generation | [`callSummarizerService.js`](src/services/callSummarizerService.js) | Objection extraction, insight generation, next-step rules, deal value estimation |

### Backend & Data

| Requirement | File | Key Responsibility |
|---|---|---|
| REST API server | [`server/agentApiServer.js`](server/agentApiServer.js) | 6 REST endpoints, mock AI response, keyword RAG, in-memory CRM operations |
| Product & pricing knowledge base | [`src/data/productKnowledgeBase.json`](src/data/productKnowledgeBase.json) | 3 product tiers, 8 FAQs, multilingual price fields |
| CRM leads + calendar slots | [`src/data/mockCrmRecords.json`](src/data/mockCrmRecords.json) | 3 demo leads, 5 calendar slots, appointment history |

### State & Config

| Requirement | File | Key Responsibility |
|---|---|---|
| Global session state | [`src/store/callSessionStore.js`](src/store/callSessionStore.js) | Zustand store: memory, BANT, sentiment, RAG, booking, summary |
| Dashboard orchestrator | [`src/App.jsx`](src/App.jsx) | Assembles all 6 components, routes turn data, triggers summary |
| Environment variables | [`.env.example`](.env.example) | API key hooks for OpenAI, Deepgram, ElevenLabs, HubSpot, Pinecone |

### Documentation

| Deliverable | File |
|---|---|
| This quick-start + file navigator | [`README.md`](README.md) |
| System architecture diagram | [`docs/SystemArchitectureDiagram.md`](docs/SystemArchitectureDiagram.md) |
| 1-page project report | [`REPORT.md`](REPORT.md) |

---

## 🔄 End-to-End Workflow

```
Prospect speaks/types
      ↓
VoiceCallConsole.jsx  (STT via Web Speech API or text fallback)
      ↓
agentApiServer.js /api/agent/turn
  → ragKnowledgeRetrievalService  (keyword search → product/FAQ chunks)
  → generateAgentResponse()       (mock LLM / swap for OpenAI)
  → sentimentScore + bantSignals
      ↓
callSessionStore.js  processTurnData()
  → agentMemoryAndLanguageService  (detect language, update memory)
  → leadScoringAndSentimentService (update BANT, smooth sentiment)
      ↓
UI updates all 5 panels simultaneously:
  MultilingualMemoryPanel   ← memory + language
  LeadQualificationCard     ← BANT bars + sentiment meter
  RagKnowledgeDrawer        ← retrieved chunks with citations
  AppointmentBookingModal   ← auto-opens if agent suggests booking
      ↓
Call ends → handleCallEnd()
  → callSummarizerService.generateCallSummary()
  → CallSummaryInsightsView ← full post-call report + JSON export
```

---

## 🔌 Adding Real API Keys

| Feature | Env Var | Service |
|---|---|---|
| Live AI responses | `OPENAI_API_KEY` | OpenAI GPT-4o |
| Real-time STT | `DEEPGRAM_API_KEY` | Deepgram Nova-2 |
| Custom TTS voice | `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` | ElevenLabs |
| CRM sync | `HUBSPOT_API_KEY` | HubSpot |
| Vector search | `PINECONE_API_KEY` + `PINECONE_INDEX` | Pinecone |

Each service has a clearly marked swap point in its corresponding service file.

---

## 📁 Complete Folder Tree

```
fortivex-voice-agent/
├── index.html                          # Vite HTML entry
├── package.json                        # Dependencies + npm scripts
├── vite.config.js                      # Vite + API proxy config
├── tailwind.config.js                  # Tailwind CSS config
├── postcss.config.js                   # PostCSS (Tailwind pipeline)
├── .env.example                        # API key hooks template
├── README.md                           # ← You are here
├── REPORT.md                           # 1-page project report
├── server/
│   └── agentApiServer.js               # Express REST API (6 endpoints)
├── src/
│   ├── main.jsx                        # React entry point
│   ├── App.jsx                         # Dashboard orchestrator
│   ├── index.css                       # Tailwind directives
│   ├── components/
│   │   ├── VoiceCallConsole.jsx        # Voice I/O + transcript UI
│   │   ├── MultilingualMemoryPanel.jsx # Memory + language display
│   │   ├── LeadQualificationCard.jsx   # BANT bars + sentiment meter
│   │   ├── RagKnowledgeDrawer.jsx      # RAG chunks + citations
│   │   ├── AppointmentBookingModal.jsx # Slot picker + CRM sync
│   │   └── CallSummaryInsightsView.jsx # Post-call report
│   ├── services/
│   │   ├── sttTtsVoiceService.js       # Web Speech API abstraction
│   │   ├── agentMemoryAndLanguageService.js # Memory + lang detection
│   │   ├── leadScoringAndSentimentService.js # BANT + sentiment NLP
│   │   ├── ragKnowledgeRetrievalService.js   # Local RAG engine
│   │   ├── crmAndCalendarService.js          # CRM + booking API client
│   │   └── callSummarizerService.js          # Post-call summary
│   ├── store/
│   │   └── callSessionStore.js         # Zustand global state
│   └── data/
│       ├── productKnowledgeBase.json   # Products + FAQs (RAG source)
│       └── mockCrmRecords.json         # Leads + calendar slots
└── docs/
    └── SystemArchitectureDiagram.md    # Mermaid architecture diagram
```
