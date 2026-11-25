/**
 * src/components/RagKnowledgeDrawer.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Fortivex AI — RAG Knowledge Retrieval Drawer Component
 *
 * PURPOSE  : Displays retrieved knowledge chunks (products & FAQs) used to
 *            ground the AI agent's current response. Shows source citations,
 *            relevance scores, and snippet previews in a collapsible drawer UI.
 *
 * INPUTS   : Props: { ragChunks, isLoading, lastQuery }
 * OUTPUTS  : Read-only drawer display — no user interaction
 *
 * WHERE TO MODIFY:
 *   - Add more chunk types → ChunkCard switch statement
 *   - Change citation format → CitationBadge component
 *   - Add expand/collapse → KnowledgeChunk collapsible (expandedId state)
 *   - Switch to real vector search → ragKnowledgeRetrievalService.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';

// ── Sub-component: Product chunk card ─────────────────────────────────────────
function ProductChunkCard({ data, rank, citation }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl overflow-hidden">
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-blue-100 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 bg-blue-500 text-white rounded-full text-xs flex items-center justify-center font-bold">
            {rank}
          </span>
          <div>
            <p className="text-xs font-bold text-blue-800">{data.name}</p>
            <p className="text-xs text-blue-500">${data.price_usd_per_month}/mo · {data.ideal_for?.slice(0, 35)}...</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-blue-200 text-blue-700 px-2 py-0.5 rounded-full font-semibold">Product</span>
          <span className="text-blue-400 text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 border-t border-blue-200">
          <div className="mt-2 space-y-1">
            {data.features?.slice(0, 4).map((f, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <span className="text-blue-400 mt-0.5">✓</span>
                <span className="text-xs text-blue-700">{f}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
            <div className="bg-white rounded-lg p-1.5">
              <p className="text-gray-400">USD</p>
              <p className="font-bold text-gray-700">${data.price_usd_per_month}/mo</p>
            </div>
            <div className="bg-white rounded-lg p-1.5">
              <p className="text-gray-400">INR</p>
              <p className="font-bold text-gray-700">₹{data.price_inr_per_month?.toLocaleString()}/mo</p>
            </div>
          </div>
          <CitationBadge citation={citation} />
        </div>
      )}
    </div>
  );
}

// ── Sub-component: FAQ chunk card ──────────────────────────────────────────────
function FaqChunkCard({ data, rank, snippet, citation }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-xl overflow-hidden">
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-purple-100 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="w-5 h-5 bg-purple-500 text-white rounded-full text-xs flex items-center justify-center font-bold flex-shrink-0">
            {rank}
          </span>
          <p className="text-xs font-bold text-purple-800 truncate">{data.question}</p>
        </div>
        <div className="flex items-center gap-2 ml-2 flex-shrink-0">
          <span className="text-xs bg-purple-200 text-purple-700 px-2 py-0.5 rounded-full font-semibold">FAQ</span>
          <span className="text-purple-400 text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 border-t border-purple-200">
          <p className="text-xs text-purple-700 mt-2 leading-relaxed">{data.answer}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {data.tags?.map(tag => (
              <span key={tag} className="text-xs bg-purple-200 text-purple-700 px-1.5 py-0.5 rounded-full">{tag}</span>
            ))}
          </div>
          <CitationBadge citation={citation} />
        </div>
      )}
    </div>
  );
}

// ── Sub-component: Source citation badge ─────────────────────────────────────
function CitationBadge({ citation }) {
  return (
    <div className="flex items-center gap-1 mt-2">
      <span className="text-xs">📄</span>
      <span className="text-xs text-gray-500 italic">{citation}</span>
    </div>
  );
}

// ── Sub-component: Empty state ────────────────────────────────────────────────
function EmptyState({ lastQuery }) {
  return (
    <div className="text-center py-6 text-gray-400">
      <span className="text-3xl block mb-2">🔍</span>
      {lastQuery ? (
        <>
          <p className="text-sm font-medium">No matches for:</p>
          <p className="text-xs italic mt-0.5">"{lastQuery}"</p>
          <p className="text-xs mt-2">Try asking about pricing, features, or compliance.</p>
        </>
      ) : (
        <>
          <p className="text-sm font-medium">RAG Knowledge Base</p>
          <p className="text-xs mt-1">Retrieved product & FAQ chunks appear here when the agent searches the knowledge base.</p>
        </>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function RagKnowledgeDrawer({ ragChunks = [], isLoading = false, lastQuery = '' }) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
      {/* Header (clickable to toggle) */}
      <div
        className="bg-gradient-to-r from-purple-600 to-pink-600 p-4 text-white flex items-center justify-between cursor-pointer"
        onClick={() => setIsOpen(o => !o)}
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg">📚</span>
            <h3 className="font-bold">RAG Knowledge</h3>
            {ragChunks.length > 0 && (
              <span className="bg-white/30 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                {ragChunks.length} chunk{ragChunks.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          {lastQuery && (
            <p className="text-purple-200 text-xs mt-0.5 truncate max-w-[200px]">
              Query: "{lastQuery}"
            </p>
          )}
        </div>
        <span className="text-white opacity-70">{isOpen ? '▲' : '▼'}</span>
      </div>

      {isOpen && (
        <div className="p-4">
          {/* Loading skeleton */}
          {isLoading && (
            <div className="space-y-2">
              {[1, 2].map(i => (
                <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          )}

          {/* Chunks */}
          {!isLoading && ragChunks.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-400 mb-2">
                Click any chunk to expand · Used to ground agent response
              </p>
              {ragChunks.map((chunk) =>
                chunk.type === 'product' ? (
                  <ProductChunkCard
                    key={chunk.data?.id || chunk.rank}
                    data={chunk.data}
                    rank={chunk.rank}
                    citation={chunk.citation}
                  />
                ) : (
                  <FaqChunkCard
                    key={chunk.data?.id || chunk.rank}
                    data={chunk.data}
                    rank={chunk.rank}
                    snippet={chunk.snippet}
                    citation={chunk.citation}
                  />
                )
              )}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && ragChunks.length === 0 && (
            <EmptyState lastQuery={lastQuery} />
          )}

          {/* Knowledge base info */}
          <div className="mt-3 bg-gray-50 rounded-xl p-3 border border-gray-100">
            <p className="text-xs text-gray-500 font-semibold mb-1">📁 Local Knowledge Base</p>
            <div className="text-xs text-gray-400 space-y-0.5">
              <div className="flex justify-between">
                <span>Products indexed</span>
                <span className="font-medium text-gray-600">3</span>
              </div>
              <div className="flex justify-between">
                <span>FAQs indexed</span>
                <span className="font-medium text-gray-600">8</span>
              </div>
              <div className="flex justify-between">
                <span>Search method</span>
                <span className="font-medium text-gray-600">Keyword + Synonyms</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
