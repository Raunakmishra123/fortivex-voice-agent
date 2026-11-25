/**
 * src/components/MultilingualMemoryPanel.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Fortivex AI — Multilingual Memory & Context State Panel
 *
 * PURPOSE  : Real-time display of the agent's active conversation memory:
 *            detected language (with auto-switch indicator), turn count,
 *            topics discussed, objection log, and buying signals.
 *
 * INPUTS   : Props: { memory } — memory object from agentMemoryAndLanguageService
 * OUTPUTS  : Read-only display panel (no user interaction required)
 *
 * WHERE TO MODIFY:
 *   - Add new memory fields → extend memorySummary display below
 *   - Change panel layout → MemoryRow sub-component
 *   - Add more languages → SUPPORTED_LANGUAGES in sttTtsVoiceService.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useMemo } from 'react';
import { getMemorySummary } from '../services/agentMemoryAndLanguageService';

// ── Sub-component: Single labelled row ────────────────────────────────────────
function MemoryRow({ label, value, valueClass = '' }) {
  return (
    <div className="flex items-start justify-between py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400 font-medium min-w-[90px]">{label}</span>
      <span className={`text-xs text-right font-semibold text-gray-700 max-w-[160px] ${valueClass}`}>
        {value || '—'}
      </span>
    </div>
  );
}

// ── Sub-component: Language badge ─────────────────────────────────────────────
function LanguageBadge({ lang, confidence, isAuto }) {
  const colorMap = {
    English: 'bg-blue-50 text-blue-700 border-blue-200',
    Hindi:   'bg-orange-50 text-orange-700 border-orange-200',
    Spanish: 'bg-green-50 text-green-700 border-green-200',
  };
  const colorClass = colorMap[lang?.split(' ')[1]] || 'bg-gray-50 text-gray-700 border-gray-200';

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${colorClass}`}>
      <span className="text-xl">{lang?.split(' ')[0]}</span>
      <div>
        <p className="font-bold text-sm leading-tight">{lang?.split(' ').slice(1).join(' ')}</p>
        <p className="text-xs opacity-70">{isAuto ? `Auto-detected · ${confidence}` : 'Manual'}</p>
      </div>
    </div>
  );
}

// ── Sub-component: Topic pill list ───────────────────────────────────────────
function TopicPills({ topics }) {
  if (!topics?.length) return <span className="text-xs text-gray-400 italic">No topics yet</span>;

  const colorMap = {
    pricing: 'bg-blue-100 text-blue-700',
    booking: 'bg-green-100 text-green-700',
    security: 'bg-red-100 text-red-700',
    features: 'bg-purple-100 text-purple-700',
    objection: 'bg-orange-100 text-orange-700',
    closing: 'bg-emerald-100 text-emerald-700',
  };

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {topics.map(topic => (
        <span
          key={topic}
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${colorMap[topic.toLowerCase()] || 'bg-gray-100 text-gray-600'}`}
        >
          {topic}
        </span>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function MultilingualMemoryPanel({ memory }) {
  // Derive display-ready summary from raw memory object
  const summary = useMemo(() => {
    if (!memory) return null;
    return getMemorySummary(memory);
  }, [memory]);

  // ── Empty state ───────────────────────────────────────────────────────────
  if (!memory || !summary) {
    return (
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5 h-full flex flex-col">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">🧠</span>
          <h3 className="font-bold text-gray-800">Memory & Language</h3>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-400">
          <span className="text-4xl mb-2">💤</span>
          <p className="text-sm font-medium">Memory is dormant</p>
          <p className="text-xs mt-1">Start a call to activate contextual memory</p>
        </div>
      </div>
    );
  }

  const hasObjections = summary.objections > 0;
  const hasBuyingSignals = summary.buyingSignals > 0;

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-violet-600 to-purple-600 p-4 text-white">
        <div className="flex items-center gap-2">
          <span className="text-lg">🧠</span>
          <h3 className="font-bold">Memory & Language</h3>
        </div>
        <p className="text-violet-200 text-xs mt-0.5">Session: {summary.sessionId?.split('-')[1] || 'active'}</p>
      </div>

      <div className="p-4 flex flex-col gap-4">
        {/* Language detection section */}
        <div>
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">🌐 Active Language</h4>
          <LanguageBadge
            lang={summary.language}
            confidence={summary.languageConfidence}
            isAuto={true}
          />
        </div>

        {/* Session stats */}
        <div>
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">📊 Session Stats</h4>
          <div className="bg-gray-50 rounded-xl p-3">
            <MemoryRow label="Lead" value={summary.leadName} />
            <MemoryRow label="Duration" value={summary.callDuration} />
            <MemoryRow label="Turns" value={`${summary.turnCount} turns`} />
            <MemoryRow label="Last Intent" value={summary.lastIntent} />
          </div>
        </div>

        {/* Topics discussed */}
        <div>
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">💬 Topics Discussed</h4>
          <TopicPills topics={summary.topicsDiscussed} />
        </div>

        {/* Signals summary */}
        <div className="grid grid-cols-2 gap-2">
          <div className={`rounded-xl p-3 text-center border ${hasObjections ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-100'}`}>
            <p className={`text-2xl font-bold ${hasObjections ? 'text-orange-600' : 'text-gray-400'}`}>
              {summary.objections}
            </p>
            <p className="text-xs text-gray-500 font-medium">Objections</p>
          </div>
          <div className={`rounded-xl p-3 text-center border ${hasBuyingSignals ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-100'}`}>
            <p className={`text-2xl font-bold ${hasBuyingSignals ? 'text-emerald-600' : 'text-gray-400'}`}>
              {summary.buyingSignals}
            </p>
            <p className="text-xs text-gray-500 font-medium">Buy Signals</p>
          </div>
        </div>

        {/* Memory depth indicator */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500 font-medium">Memory Utilization</span>
            <span className="text-xs text-gray-400">{summary.turnCount}/20 turns</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div
              className="bg-gradient-to-r from-violet-500 to-purple-500 rounded-full h-1.5 transition-all duration-500"
              style={{ width: `${Math.min(100, (summary.turnCount / 20) * 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
