/**
 * src/components/CallSummaryInsightsView.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Fortivex AI — Post-Call Summary & Business Insights View
 *
 * PURPOSE  : Rendered after a call ends. Displays the full structured summary:
 *            qualification outcome, BANT breakdown, objections raised,
 *            buying signals, actionable next steps, estimated deal value,
 *            and AI-generated business insights.
 *
 * INPUTS   : Props: { summary, isLoading, onReset }
 * OUTPUTS  : Read-only display · Export-ready layout for PDF/screenshot
 *
 * WHERE TO MODIFY:
 *   - Change insight formatting → InsightItem sub-component
 *   - Add export to PDF → add html2pdf.js and ExportButton
 *   - Change deal value logic → callSummarizerService.js > DEAL_VALUE_MAP
 *   - Add email sending → POST to /api/crm/send-summary (future endpoint)
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Sub-component: Section header ─────────────────────────────────────────────
function SectionHeader({ icon, title }) {
  return (
    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
      <span>{icon}</span> {title}
    </h4>
  );
}

// ── Sub-component: BANT mini-bar ──────────────────────────────────────────────
function BantMiniBar({ label, score }) {
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 75 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : pct >= 25 ? 'bg-orange-400' : 'bg-gray-300';

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-16">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold text-gray-600 w-6 text-right">{pct}</span>
    </div>
  );
}

// ── Sub-component: Individual insight item ─────────────────────────────────────
function InsightItem({ text }) {
  const isPositive = text.startsWith('✅') || text.startsWith('🟢');
  const isWarning = text.startsWith('⚠️') || text.startsWith('🔴');
  const isTip = text.startsWith('💡') || text.startsWith('📋') || text.startsWith('📅');

  const style = isPositive ? 'bg-green-50 border-green-200 text-green-800'
    : isWarning ? 'bg-red-50 border-red-200 text-red-800'
    : isTip ? 'bg-blue-50 border-blue-200 text-blue-800'
    : 'bg-gray-50 border-gray-200 text-gray-700';

  return (
    <div className={`text-xs p-2.5 rounded-lg border ${style} leading-relaxed`}>
      {text}
    </div>
  );
}

// ── Sub-component: Stat card ──────────────────────────────────────────────────
function StatCard({ label, value, sub, color = 'indigo' }) {
  const colors = {
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-700',
    green:  'bg-green-50 border-green-200 text-green-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
    red:    'bg-red-50 border-red-200 text-red-700',
  };

  return (
    <div className={`rounded-xl border p-3 text-center ${colors[color]}`}>
      <p className="text-lg font-black">{value}</p>
      <p className="text-xs font-semibold opacity-80">{label}</p>
      {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Loading skeleton ───────────────────────────────────────────────────────────
function SummarySkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5 animate-pulse">
      <div className="h-6 bg-gray-100 rounded w-1/2 mb-4" />
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="h-10 bg-gray-100 rounded-xl mb-2" />
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function CallSummaryInsightsView({ summary, isLoading, onReset }) {
  if (isLoading) return <SummarySkeleton />;

  if (!summary) {
    return (
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 text-center">
        <span className="text-5xl block mb-3">📊</span>
        <h3 className="font-bold text-gray-700 mb-1">Post-Call Insights</h3>
        <p className="text-sm text-gray-400">
          Complete a call to generate your AI-powered business insights summary.
        </p>
      </div>
    );
  }

  const qualBadgeColor = summary.qualificationStatus?.toLowerCase().includes('hot')
    ? 'bg-red-500' : summary.qualificationStatus?.toLowerCase().includes('warm')
    ? 'bg-orange-500' : 'bg-blue-500';

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-700 to-gray-800 p-5 text-white">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">📊</span>
              <h2 className="font-bold text-lg">Call Summary</h2>
            </div>
            <p className="text-gray-400 text-xs mt-0.5">
              {summary.leadName} · {summary.language} · {summary.callDurationMinutes}m
            </p>
          </div>
          <div className={`${qualBadgeColor} px-3 py-1 rounded-full`}>
            <p className="text-xs font-bold text-white">{summary.qualificationStatus}</p>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Top stats row */}
        <div className="grid grid-cols-2 gap-2">
          <StatCard label="Avg BANT Score" value={summary.avgBantScore} sub="out of 100" color="indigo" />
          <StatCard label="Sentiment" value={`${summary.sentimentScore}%`} sub="positive" color="green" />
          <StatCard label="Est. Deal Value" value={summary.estimatedDealValue} sub={summary.recommendedPlan} color="orange" />
          <StatCard label="Close Probability" value={summary.dealProbability} sub="estimated" color={summary.dealProbability?.includes('70') ? 'green' : 'orange'} />
        </div>

        {/* BANT Breakdown */}
        {summary.bantScores && (
          <div>
            <SectionHeader icon="📋" title="BANT Breakdown" />
            <div className="space-y-1.5 bg-gray-50 rounded-xl p-3">
              {Object.entries(summary.bantScores).map(([k, v]) => (
                <BantMiniBar key={k} label={k.charAt(0).toUpperCase() + k.slice(1)} score={v} />
              ))}
            </div>
          </div>
        )}

        {/* Topics discussed */}
        {summary.topicsDiscussed?.length > 0 && (
          <div>
            <SectionHeader icon="💬" title="Topics Discussed" />
            <div className="flex flex-wrap gap-1.5">
              {summary.topicsDiscussed.map(t => (
                <span key={t} className="bg-indigo-100 text-indigo-700 text-xs px-2.5 py-1 rounded-full font-medium">{t}</span>
              ))}
            </div>
          </div>
        )}

        {/* Objections */}
        <div>
          <SectionHeader icon="⚠️" title="Objections Raised" />
          <div className="space-y-1">
            {summary.objections?.map((obj, i) => (
              <div key={i} className="text-xs bg-orange-50 border border-orange-200 text-orange-700 rounded-lg px-3 py-2">
                "{obj}"
              </div>
            ))}
          </div>
        </div>

        {/* AI Insights */}
        <div>
          <SectionHeader icon="💡" title="AI Business Insights" />
          <div className="space-y-1.5">
            {summary.keyInsights?.map((insight, i) => (
              <InsightItem key={i} text={insight} />
            ))}
          </div>
        </div>

        {/* Recommended next action */}
        <div>
          <SectionHeader icon="🚀" title="Recommended Next Action" />
          <div className="bg-indigo-600 text-white rounded-xl p-4">
            <p className="text-sm font-semibold leading-relaxed">{summary.recommendedNextAction}</p>
          </div>
        </div>

        {/* Appointment status */}
        {summary.appointmentBooked && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-3">
            <span className="text-2xl">📅</span>
            <div>
              <p className="text-sm font-bold text-green-700">Appointment Booked ✓</p>
              <p className="text-xs text-green-500">Calendar invite sent · CRM status updated</p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-400">
            Generated {new Date(summary.generatedAt).toLocaleTimeString()}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const text = JSON.stringify(summary, null, 2);
                const blob = new Blob([text], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `call-summary-${summary.leadName?.replace(/\s+/g, '-')}-${Date.now()}.json`;
                a.click();
              }}
              className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-lg transition-all"
            >
              ⬇️ Export JSON
            </button>
            {onReset && (
              <button
                onClick={onReset}
                className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg transition-all"
              >
                🔄 New Call
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
