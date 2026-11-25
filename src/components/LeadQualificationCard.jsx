/**
 * src/components/LeadQualificationCard.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Fortivex AI — BANT Lead Scoring & Sentiment Analysis Card
 *
 * PURPOSE  : Displays real-time BANT scores (Budget, Authority, Need, Timeline)
 *            as animated progress bars, the aggregate qualification status badge,
 *            and a live sentiment meter that updates per conversation turn.
 *
 * INPUTS   : Props: { bantScores, sentimentScore, qualificationStatus, leadName }
 * OUTPUTS  : Read-only visual display — no user interaction
 *
 * WHERE TO MODIFY:
 *   - Change BANT descriptions → BANT_META object
 *   - Adjust color thresholds → ScoreBar component
 *   - Change qualification badge colors → QUALIFICATION_COLORS
 *   - Add new qualification criteria → extend BANT_META and service
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useMemo } from 'react';
import { getQualificationStatus } from '../services/leadScoringAndSentimentService';

// ── BANT criterion metadata ───────────────────────────────────────────────────
const BANT_META = {
  budget: {
    label: 'Budget',
    icon: '💰',
    description: 'Has financial resources allocated',
    tip: 'Ask: "Do you have a budget set aside for this?"',
  },
  authority: {
    label: 'Authority',
    icon: '👔',
    description: 'Is the decision-maker or influencer',
    tip: 'Ask: "Are you involved in the final decision?"',
  },
  need: {
    label: 'Need',
    icon: '🎯',
    description: 'Has a clear pain point or goal',
    tip: 'Ask: "What\'s your biggest sales challenge?"',
  },
  timeline: {
    label: 'Timeline',
    icon: '📅',
    description: 'Has an urgency or project deadline',
    tip: 'Ask: "When are you looking to implement a solution?"',
  },
};

const QUALIFICATION_COLORS = {
  hot:  { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-700', dot: 'bg-red-500' },
  warm: { bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-700', dot: 'bg-orange-500' },
  cold: { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-700', dot: 'bg-blue-500' },
};

// ── Sub-component: Animated score bar for one BANT criterion ──────────────────
function ScoreBar({ criterion, score }) {
  const meta = BANT_META[criterion];
  const pct = Math.min(100, Math.max(0, score));

  const barColor = pct >= 75 ? 'from-green-500 to-emerald-400'
    : pct >= 50 ? 'from-yellow-500 to-amber-400'
    : pct >= 25 ? 'from-orange-500 to-amber-400'
    : 'from-gray-300 to-gray-200';

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{meta.icon}</span>
          <span className="text-xs font-semibold text-gray-700">{meta.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{meta.description}</span>
          <span className={`text-sm font-bold min-w-[36px] text-right ${
            pct >= 75 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : pct >= 25 ? 'text-orange-500' : 'text-gray-400'
          }`}>
            {pct}
          </span>
        </div>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
        <div
          className={`h-2 rounded-full bg-gradient-to-r ${barColor} transition-all duration-700 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {pct === 0 && (
        <p className="text-xs text-gray-400 italic mt-0.5">{meta.tip}</p>
      )}
    </div>
  );
}

// ── Sub-component: Sentiment meter ────────────────────────────────────────────
function SentimentMeter({ score }) {
  const pct = Math.round(score * 100);

  const label = pct >= 70 ? { text: 'Very Positive', emoji: '😊', color: 'text-green-600' }
    : pct >= 55 ? { text: 'Positive',      emoji: '🙂', color: 'text-emerald-600' }
    : pct >= 40 ? { text: 'Neutral',       emoji: '😐', color: 'text-gray-500' }
    : pct >= 25 ? { text: 'Negative',      emoji: '😟', color: 'text-orange-600' }
    : { text: 'Very Negative', emoji: '😠', color: 'text-red-600' };

  // Gradient stops for the sentiment spectrum bar
  const sliderPos = `${pct}%`;

  return (
    <div className="bg-gray-50 rounded-xl p-3 mt-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Live Sentiment</span>
        <div className="flex items-center gap-1">
          <span className="text-base">{label.emoji}</span>
          <span className={`text-xs font-bold ${label.color}`}>{label.text}</span>
        </div>
      </div>

      {/* Sentiment spectrum bar */}
      <div className="relative">
        <div className="w-full h-3 rounded-full bg-gradient-to-r from-red-400 via-yellow-400 via-gray-300 to-green-400" />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-gray-400 rounded-full shadow-sm transition-all duration-500"
          style={{ left: `calc(${sliderPos} - 8px)` }}
        />
      </div>

      <div className="flex justify-between mt-1">
        <span className="text-xs text-gray-400">😠 Negative</span>
        <span className={`text-xs font-bold ${label.color}`}>{pct}%</span>
        <span className="text-xs text-gray-400">Positive 😊</span>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function LeadQualificationCard({ bantScores, sentimentScore = 0.5, leadName = 'Prospect' }) {
  // Compute qualification from scores
  const qualification = useMemo(() => {
    if (!bantScores) return null;
    return getQualificationStatus(bantScores);
  }, [bantScores]);

  // ── Empty / idle state ────────────────────────────────────────────────────
  if (!bantScores || !qualification) {
    return (
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">🏆</span>
          <h3 className="font-bold text-gray-800">Lead Qualification</h3>
        </div>
        <div className="text-center text-gray-400 py-6">
          <span className="text-4xl mb-2 block">📋</span>
          <p className="text-sm font-medium">BANT scoring will appear here</p>
          <p className="text-xs mt-1">Scores update live during the call</p>
        </div>
      </div>
    );
  }

  const qualColors = QUALIFICATION_COLORS[qualification.badge] || QUALIFICATION_COLORS.cold;

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-4 text-white">
        <div className="flex items-center gap-2">
          <span className="text-lg">🏆</span>
          <h3 className="font-bold">Lead Qualification</h3>
        </div>
        <p className="text-green-200 text-xs mt-0.5">BANT scoring · {leadName}</p>
      </div>

      <div className="p-4">
        {/* Qualification badge */}
        <div className={`flex items-center justify-between p-3 rounded-xl border mb-4 ${qualColors.bg} ${qualColors.border}`}>
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${qualColors.dot} animate-pulse`} />
            <span className={`font-bold text-sm ${qualColors.text}`}>{qualification.status}</span>
          </div>
          <div className="text-right">
            <p className={`text-2xl font-black ${qualColors.text}`}>{qualification.avgScore}</p>
            <p className="text-xs text-gray-400">Avg BANT Score</p>
          </div>
        </div>

        {/* BANT Bars */}
        <div>
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">BANT Breakdown</h4>
          {Object.entries(bantScores).map(([criterion, score]) => (
            <ScoreBar key={criterion} criterion={criterion} score={score} />
          ))}
        </div>

        {/* Sentiment meter */}
        <SentimentMeter score={sentimentScore} />

        {/* Score interpretation guide */}
        <div className="mt-3 grid grid-cols-3 gap-1 text-center">
          {[
            { label: '🔥 Hot', range: '75–100', color: 'bg-red-50 text-red-600' },
            { label: '🌡️ Warm', range: '50–74', color: 'bg-orange-50 text-orange-600' },
            { label: '❄️ Cold', range: '0–49', color: 'bg-blue-50 text-blue-600' },
          ].map(tier => (
            <div key={tier.label} className={`rounded-lg py-1.5 px-1 text-xs font-semibold ${tier.color}`}>
              <div>{tier.label}</div>
              <div className="opacity-70 font-normal">{tier.range}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
