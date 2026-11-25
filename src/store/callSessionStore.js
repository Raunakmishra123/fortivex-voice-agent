/**
 * src/store/callSessionStore.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Fortivex AI — Global Call Session State Store (Zustand)
 *
 * PURPOSE  : Single source of truth for the entire call session:
 *            memory, BANT scores, sentiment, RAG chunks, appointment, summary.
 *            All React components read from and write to this store.
 *
 * INPUTS   : Actions called by VoiceCallConsole on each agent turn
 * OUTPUTS  : Reactive state consumed by all 6 dashboard components
 *
 * WHERE TO MODIFY:
 *   - Add new state fields → extend the store object
 *   - Persist state across page reloads → add persist middleware
 *   - Add undo/redo → add immer middleware
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { create } from 'zustand';
import {
  createCallMemory,
  addTurnToMemory,
} from '../services/agentMemoryAndLanguageService';
import {
  createInitialBantScores,
  updateBantScores,
  analyzeSentiment,
  smoothSentiment,
  getQualificationStatus,
} from '../services/leadScoringAndSentimentService';

export const useCallSessionStore = create((set, get) => ({
  // ── Active lead ─────────────────────────────────────────────────────────
  activeLead: null,
  setActiveLead: (lead) => set({
    activeLead: lead,
    memory: createCallMemory(lead || {}),
  }),

  // ── Memory state ─────────────────────────────────────────────────────────
  memory: createCallMemory({}),

  // ── BANT scores ───────────────────────────────────────────────────────────
  bantScores: createInitialBantScores(),

  // ── Sentiment ─────────────────────────────────────────────────────────────
  sentimentScore: 0.5,

  // ── Qualification ─────────────────────────────────────────────────────────
  qualificationStatus: null,

  // ── RAG chunks (last retrieved) ───────────────────────────────────────────
  ragChunks: [],
  lastRagQuery: '',

  // ── Call status ───────────────────────────────────────────────────────────
  callStatus: 'idle',          // 'idle' | 'active' | 'ended'
  callDurationSeconds: 0,

  // ── Appointment ───────────────────────────────────────────────────────────
  appointmentBooked: null,
  bookingModalOpen: false,

  // ── Call summary ──────────────────────────────────────────────────────────
  callSummary: null,
  summaryLoading: false,

  // ════════════════════════════════════════════════════════════════════════
  // ACTIONS
  // ════════════════════════════════════════════════════════════════════════

  /** Called at the start of a call session */
  startCallSession: (lead) => {
    set({
      activeLead: lead,
      memory: createCallMemory(lead || {}),
      bantScores: createInitialBantScores(),
      sentimentScore: 0.5,
      qualificationStatus: null,
      ragChunks: [],
      lastRagQuery: '',
      callStatus: 'active',
      callDurationSeconds: 0,
      appointmentBooked: null,
      callSummary: null,
    });
  },

  /** Called after each agent turn with the full turn data payload */
  processTurnData: ({ userTurn, agentTurn, ragChunks, sentimentScore: turnSentiment, bantSignals, latencyMs }) => {
    const { memory, bantScores, sentimentScore } = get();

    // 1. Update memory with both turns
    const memAfterUser = addTurnToMemory(memory, 'user', userTurn.content);
    const memAfterAgent = addTurnToMemory(memAfterUser, 'agent', agentTurn.content);

    // 2. Update BANT scores
    const updatedBant = updateBantScores(bantScores, userTurn.content);
    // Also apply server-side signals
    if (bantSignals) {
      Object.keys(bantSignals).forEach(k => {
        if (bantSignals[k] > 0) updatedBant[k] = Math.min(100, updatedBant[k] + bantSignals[k]);
      });
    }

    // 3. Update sentiment (smooth it)
    const { score: rawSentiment } = analyzeSentiment(userTurn.content);
    const serverSentiment = typeof turnSentiment === 'number' ? turnSentiment : rawSentiment;
    const smoothed = smoothSentiment(sentimentScore, serverSentiment);

    // 4. Recompute qualification
    const qualification = getQualificationStatus(updatedBant);

    set({
      memory: memAfterAgent,
      bantScores: updatedBant,
      sentimentScore: smoothed,
      qualificationStatus: qualification,
      ragChunks: ragChunks || [],
      lastRagQuery: userTurn.content,
    });
  },

  /** Called when call ends */
  endCallSession: (durationSeconds) => {
    set({ callStatus: 'ended', callDurationSeconds: durationSeconds });
  },

  /** Opens/closes the appointment booking modal */
  setBookingModalOpen: (open) => set({ bookingModalOpen: open }),

  /** Records a completed booking */
  confirmAppointment: (appointment) => set({
    appointmentBooked: appointment,
    bookingModalOpen: false,
  }),

  /** Sets the post-call summary */
  setCallSummary: (summary) => set({ callSummary: summary, summaryLoading: false }),
  setSummaryLoading: (loading) => set({ summaryLoading: loading }),

  /** Resets the entire session to idle */
  resetSession: () => set({
    activeLead: null,
    memory: createCallMemory({}),
    bantScores: createInitialBantScores(),
    sentimentScore: 0.5,
    qualificationStatus: null,
    ragChunks: [],
    lastRagQuery: '',
    callStatus: 'idle',
    callDurationSeconds: 0,
    appointmentBooked: null,
    bookingModalOpen: false,
    callSummary: null,
    summaryLoading: false,
  }),
}));
