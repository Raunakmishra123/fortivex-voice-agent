/**
 * src/App.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Fortivex AI — Root Dashboard Orchestrator
 *
 * PURPOSE  : Assembles all 6 feature components into a responsive single-page
 *            dashboard. Manages global state via callSessionStore and wires
 *            the complete end-to-end call workflow together.
 *
 * LAYOUT:
 *   Left column  → VoiceCallConsole (primary interaction)
 *   Middle column → LeadQualificationCard + RagKnowledgeDrawer
 *   Right column  → MultilingualMemoryPanel + CallSummaryInsightsView
 *   Header       → Branding + lead selector + booking button
 *   Footer       → Status bar + system health
 *
 * WHERE TO MODIFY:
 *   - Change layout → Tailwind grid classes on the main grid div
 *   - Add a new panel → import and place in the appropriate column
 *   - Change lead list → loaded from crmAndCalendarService.getAllLeads()
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from 'react';
import { useCallSessionStore } from './store/callSessionStore';
import { getAllLeads } from './services/crmAndCalendarService';
import { generateCallSummary } from './services/callSummarizerService';

import VoiceCallConsole from './components/VoiceCallConsole';
import MultilingualMemoryPanel from './components/MultilingualMemoryPanel';
import LeadQualificationCard from './components/LeadQualificationCard';
import RagKnowledgeDrawer from './components/RagKnowledgeDrawer';
import AppointmentBookingModal from './components/AppointmentBookingModal';
import CallSummaryInsightsView from './components/CallSummaryInsightsView';

export default function App() {
  const store = useCallSessionStore();
  const [leads, setLeads] = useState([]);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [serverStatus, setServerStatus] = useState('checking');

  // ── Load leads & check server health on mount ───────────────────────────
  useEffect(() => {
    // Check API server
    fetch('http://localhost:3001/api/health')
      .then(r => r.ok ? setServerStatus('online') : setServerStatus('error'))
      .catch(() => setServerStatus('offline'));

    // Load lead list
    getAllLeads()
      .then(data => { setLeads(data); setLeadsLoading(false); })
      .catch(() => setLeadsLoading(false));
  }, []);

  // ── Handle completed agent turn ─────────────────────────────────────────
  const handleTurnComplete = (turnData) => {
    store.processTurnData(turnData);

    // If agent suggested booking, open the modal
    if (turnData.suggestBooking && store.activeLead && !store.appointmentBooked) {
      store.setBookingModalOpen(true);
    }
  };

  // ── Handle call end → trigger summary generation ────────────────────────
  const handleCallEnd = async (durationSeconds) => {
    store.endCallSession(durationSeconds);
    store.setSummaryLoading(true);

    const summary = await generateCallSummary({
      conversationHistory: store.memory?.history || [],
      bantScores: store.bantScores,
      sentimentScore: store.sentimentScore,
      durationSeconds,
      leadName: store.activeLead?.name || 'Prospect',
      language: store.memory?.detectedLanguage || 'English',
      leadId: store.activeLead?.id,
      leadEmail: store.activeLead?.email,
      appointmentBooked: !!store.appointmentBooked,
      qualificationBadge: store.qualificationStatus?.badge || 'cold',
    });

    store.setCallSummary(summary);
  };

  // ── Handle lead selection ───────────────────────────────────────────────
  const handleLeadSelect = (leadId) => {
    const lead = leads.find(l => l.id === leadId);
    store.startCallSession(lead);
  };

  // ── Server status badge ─────────────────────────────────────────────────
  const statusConfig = {
    online:   { color: 'text-green-500', dot: 'bg-green-500', label: 'Server online' },
    offline:  { color: 'text-orange-500', dot: 'bg-orange-400', label: 'Mock mode (no server)' },
    error:    { color: 'text-red-500', dot: 'bg-red-500', label: 'Server error' },
    checking: { color: 'text-gray-400', dot: 'bg-gray-400 animate-pulse', label: 'Checking...' },
  };
  const status = statusConfig[serverStatus];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
      {/* ── Top Navigation Bar ──────────────────────────────────────────────── */}
      <header className="bg-slate-900/80 backdrop-blur-sm border-b border-white/10 sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between">
          {/* Logo & title */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-black text-sm">FV</span>
            </div>
            <div>
              <h1 className="text-white font-bold text-base leading-tight">Fortivex AI</h1>
              <p className="text-indigo-400 text-xs">Autonomous Sales Voice Agent · MVP Demo</p>
            </div>
          </div>

          {/* Lead Selector */}
          <div className="flex items-center gap-3">
            <select
              onChange={e => handleLeadSelect(e.target.value)}
              value={store.activeLead?.id || ''}
              disabled={store.callStatus === 'active'}
              className="text-sm bg-white/10 border border-white/20 text-white rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50 min-w-[220px]"
            >
              <option value="" className="text-gray-900">🔍 Select Prospect Lead...</option>
              {leadsLoading ? (
                <option disabled className="text-gray-900">Loading leads...</option>
              ) : (
                leads.map(lead => (
                  <option key={lead.id} value={lead.id} className="text-gray-900">
                    {lead.name} · {lead.company}
                  </option>
                ))
              )}
            </select>

            {/* Booking button */}
            <button
              onClick={() => store.setBookingModalOpen(true)}
              disabled={!store.activeLead || store.callStatus === 'idle'}
              className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-xl transition-all"
            >
              📅 Book Appointment
            </button>
          </div>

          {/* Server status */}
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${status.dot}`} />
            <span className={`text-xs ${status.color}`}>{status.label}</span>
          </div>
        </div>
      </header>

      {/* ── Main Dashboard Grid ────────────────────────────────────────────── */}
      <main className="max-w-[1600px] mx-auto px-4 py-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5" style={{ minHeight: 'calc(100vh - 120px)' }}>

          {/* LEFT COLUMN: Voice Call Console (primary interaction) */}
          <div className="lg:col-span-1 flex flex-col" style={{ minHeight: '600px' }}>
            <VoiceCallConsole
              lead={store.activeLead}
              memory={store.memory}
              onTurnComplete={handleTurnComplete}
              onCallEnd={handleCallEnd}
            />
          </div>

          {/* MIDDLE COLUMN: Qualification + RAG */}
          <div className="lg:col-span-1 flex flex-col gap-5">
            <LeadQualificationCard
              bantScores={store.bantScores}
              sentimentScore={store.sentimentScore}
              qualificationStatus={store.qualificationStatus}
              leadName={store.activeLead?.name}
            />
            <RagKnowledgeDrawer
              ragChunks={store.ragChunks}
              lastQuery={store.lastRagQuery}
            />
          </div>

          {/* RIGHT COLUMN: Memory + Summary */}
          <div className="lg:col-span-1 flex flex-col gap-5">
            <MultilingualMemoryPanel memory={store.memory} />
            <CallSummaryInsightsView
              summary={store.callSummary}
              isLoading={store.summaryLoading}
              onReset={store.resetSession}
            />
          </div>
        </div>
      </main>

      {/* ── Appointment Booking Modal ──────────────────────────────────────── */}
      <AppointmentBookingModal
        isOpen={store.bookingModalOpen}
        onClose={() => store.setBookingModalOpen(false)}
        onBooked={store.confirmAppointment}
        lead={store.activeLead}
      />

      {/* ── Bottom status bar ──────────────────────────────────────────────── */}
      <footer className="fixed bottom-0 left-0 right-0 bg-slate-950/90 backdrop-blur-sm border-t border-white/5 px-4 py-2">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-4">
            <span>🌐 Language: <strong className="text-gray-300">{store.memory?.detectedLanguage || 'Auto-detect'}</strong></span>
            <span>🎯 BANT: <strong className="text-gray-300">{store.qualificationStatus?.avgScore ?? '—'}</strong></span>
            <span>😊 Sentiment: <strong className="text-gray-300">{Math.round(store.sentimentScore * 100)}%</strong></span>
          </div>
          <div className="flex items-center gap-4">
            {store.appointmentBooked && (
              <span className="text-teal-400">📅 Appointment booked ✓</span>
            )}
            <span>Fortivex AI · Project 1 MVP · {new Date().getFullYear()}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
