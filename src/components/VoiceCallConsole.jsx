/**
 * src/components/VoiceCallConsole.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Fortivex AI — Real-time Voice Call Console Component
 *
 * PURPOSE  : Primary interaction panel. Handles mic input (Web Speech API),
 *            text fallback input, live transcript display, TTS playback,
 *            and orchestrates the full per-turn agent workflow.
 *
 * INPUTS   : Props: { lead, memory, onTurnComplete, onCallEnd }
 * OUTPUTS  : Renders call UI; calls onTurnComplete(turnData) after each agent response
 *
 * WHERE TO MODIFY:
 *   - Change STT/TTS provider → sttTtsVoiceService.js
 *   - Add push-to-talk mode → change isListening state management
 *   - Adjust agent API endpoint → AGENT_API constant
 *   - Change transcript display → TranscriptBubble sub-component below
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  startSpeechRecognition,
  speakText,
  detectVoiceCapabilities,
  SUPPORTED_LANGUAGES,
  simulateLatency,
} from '../services/sttTtsVoiceService';
import { buildApiContext } from '../services/agentMemoryAndLanguageService';

const AGENT_API = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'}/api/agent/turn`;

// ── Sub-component: Single transcript message bubble ───────────────────────────
function TranscriptBubble({ role, content, intent, timestamp }) {
  const isAgent = role === 'agent';
  return (
    <div className={`flex ${isAgent ? 'justify-start' : 'justify-end'} mb-3`}>
      <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
        isAgent
          ? 'bg-indigo-50 border border-indigo-100 text-indigo-900'
          : 'bg-gradient-to-br from-violet-600 to-indigo-600 text-white'
      }`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-xs opacity-70">
            {isAgent ? '🤖 Fortivex AI' : '👤 Prospect'}
          </span>
          {intent && (
            <span className="text-xs opacity-50 italic">· {intent}</span>
          )}
        </div>
        <p className="leading-relaxed">{content}</p>
        <p className="text-xs opacity-40 mt-1 text-right">
          {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </p>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function VoiceCallConsole({ lead, memory, onTurnComplete, onCallEnd }) {
  // ── State ─────────────────────────────────────────────────────────────────
  const [callStatus, setCallStatus] = useState('idle');       // idle | active | ended
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState([]);           // Full conversation display
  const [interimText, setInterimText] = useState('');         // Live partial STT
  const [textInput, setTextInput] = useState('');             // Text fallback
  const [inputMode, setInputMode] = useState('voice');        // 'voice' | 'text'
  const [selectedLang, setSelectedLang] = useState(SUPPORTED_LANGUAGES[0]);
  const [voiceCapabilities, setVoiceCapabilities] = useState({});
  const [latencyMs, setLatencyMs] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [callDuration, setCallDuration] = useState(0);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const recognitionRef = useRef(null);
  const ttsRef = useRef(null);
  const transcriptEndRef = useRef(null);
  const timerRef = useRef(null);
  const callStartTimeRef = useRef(null);

  // ── Detect browser capabilities on mount ─────────────────────────────────
  useEffect(() => {
    const caps = detectVoiceCapabilities();
    setVoiceCapabilities(caps);
    if (!caps.sttSupported) setInputMode('text');
  }, []);

  // ── Auto-scroll transcript ────────────────────────────────────────────────
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript, interimText]);

  // ── Call duration timer ───────────────────────────────────────────────────
  useEffect(() => {
    if (callStatus === 'active') {
      callStartTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setCallDuration(Math.floor((Date.now() - callStartTimeRef.current) / 1000));
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [callStatus]);

  // ── Send a user message through the full agent pipeline ──────────────────
  const handleUserMessage = useCallback(async (userText) => {
    if (!userText.trim() || isProcessing) return;

    setIsProcessing(true);
    setInterimText('');
    const t0 = Date.now();

    // Add user turn to display
    const userTurn = { role: 'user', content: userText, timestamp: new Date().toISOString(), intent: null };
    setTranscript(prev => [...prev, userTurn]);

    try {
      const context = buildApiContext(memory);
      const response = await fetch(AGENT_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          context,
          conversationHistory: transcript.slice(-10),
        }),
      });

      if (!response.ok) throw new Error(`API error ${response.status}`);
      const data = await response.json();

      const latency = Date.now() - t0;
      setLatencyMs(latency);

      // Add agent turn to display
      const agentTurn = {
        role: 'agent',
        content: data.agentText,
        timestamp: data.timestamp || new Date().toISOString(),
        intent: data.intent,
      };
      setTranscript(prev => [...prev, agentTurn]);

      // Notify parent with full turn data
      onTurnComplete?.({
        userTurn,
        agentTurn,
        ragChunks: data.ragChunks || [],
        sentimentScore: data.sentimentScore || 0.5,
        bantSignals: data.bantSignals || {},
        suggestBooking: data.suggestBooking || false,
        latencyMs: latency,
      });

      // TTS playback
      if (inputMode === 'voice' && voiceCapabilities.ttsSupported) {
        setIsSpeaking(true);
        ttsRef.current = speakText(
          data.agentText,
          memory?.languageCode || selectedLang.code,
          () => setIsSpeaking(true),
          () => { setIsSpeaking(false); if (inputMode === 'voice') startListening(); }
        );
      }

    } catch (err) {
      setErrorMsg(`Agent error: ${err.message}. Is the server running? (npm run server)`);
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, memory, transcript, inputMode, voiceCapabilities, selectedLang, onTurnComplete]);

  // ── Voice recognition ─────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    if (isListening || isSpeaking) return;
    setErrorMsg('');
    setIsListening(true);

    recognitionRef.current = startSpeechRecognition(
      memory?.languageCode || selectedLang.code,
      (interim) => setInterimText(interim),
      (final) => {
        setIsListening(false);
        setInterimText('');
        handleUserMessage(final);
      },
      (err) => {
        setIsListening(false);
        setInterimText('');
        setErrorMsg(err);
        setInputMode('text');
      }
    );
  }, [isListening, isSpeaking, memory, selectedLang, handleUserMessage]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
    setInterimText('');
  }, []);

  // ── Call controls ─────────────────────────────────────────────────────────
  const startCall = () => {
    // Greeting
    const greeting = {
      role: 'agent',
      content: `Hi! I'm Aria from Fortivex AI. I'm here to show you how our AI-powered voice agent can transform your sales operations. What's the biggest sales challenge your team faces right now?`,
      timestamp: new Date().toISOString(),
      intent: 'greeting',
    };
    setTranscript([greeting]);
    setCallStatus('active');
    setCallDuration(0);

    if (inputMode === 'voice' && voiceCapabilities.ttsSupported) {
      setIsSpeaking(true);
      speakText(greeting.content, selectedLang.code, null, () => {
        setIsSpeaking(false);
        startListening();
      });
    }
  };

  const endCall = () => {
    recognitionRef.current?.stop();
    ttsRef.current?.cancel();
    window.speechSynthesis?.cancel();
    setCallStatus('ended');
    setIsListening(false);
    setIsSpeaking(false);
    onCallEnd?.(callDuration);
  };

  const handleTextSubmit = (e) => {
    e.preventDefault();
    if (textInput.trim()) {
      handleUserMessage(textInput.trim());
      setTextInput('');
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const formatDuration = (s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const micButtonClass = isListening
    ? 'bg-red-500 hover:bg-red-600 animate-pulse ring-4 ring-red-200'
    : isSpeaking
    ? 'bg-amber-500 cursor-not-allowed'
    : 'bg-indigo-600 hover:bg-indigo-700';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600 p-4 text-white flex items-center justify-between">
        <div>
          <h2 className="font-bold text-lg">🎙️ Voice Call Console</h2>
          <p className="text-indigo-200 text-xs mt-0.5">
            {lead?.name ? `Calling: ${lead.name} · ${lead.company}` : 'No lead selected — demo mode'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {callStatus === 'active' && (
            <div className="flex items-center gap-2 bg-white/20 rounded-full px-3 py-1">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-sm font-mono">{formatDuration(callDuration)}</span>
            </div>
          )}
          <select
            value={selectedLang.code}
            onChange={e => setSelectedLang(SUPPORTED_LANGUAGES.find(l => l.code === e.target.value))}
            className="text-xs bg-white/20 border border-white/30 rounded-lg px-2 py-1 text-white"
            disabled={callStatus === 'active'}
          >
            {SUPPORTED_LANGUAGES.map(l => (
              <option key={l.code} value={l.code} className="text-gray-900">{l.flag} {l.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Transcript Area */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50 min-h-0">
        {transcript.length === 0 && callStatus === 'idle' && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 text-center">
            <div className="text-5xl mb-3">🤖</div>
            <p className="font-semibold text-gray-600">Ready to start a live AI sales call</p>
            <p className="text-sm mt-1">Click <strong>Start Call</strong> to begin the demo</p>
          </div>
        )}

        {transcript.map((turn, i) => (
          <TranscriptBubble key={i} {...turn} />
        ))}

        {/* Live interim STT */}
        {interimText && (
          <div className="flex justify-end mb-3">
            <div className="max-w-[80%] bg-violet-100 border border-violet-200 rounded-2xl px-4 py-2.5 text-sm text-violet-700 italic opacity-70">
              <span className="text-xs font-semibold opacity-60 block mb-1">👤 Prospect (listening...)</span>
              {interimText}
            </div>
          </div>
        )}

        {/* Processing indicator */}
        {isProcessing && (
          <div className="flex justify-start mb-3">
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3 flex items-center gap-2">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
              <span className="text-xs text-indigo-500">AI thinking{latencyMs ? ` · ${latencyMs}ms` : '...'}</span>
            </div>
          </div>
        )}

        <div ref={transcriptEndRef} />
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div className="bg-red-50 border-t border-red-200 px-4 py-2 text-xs text-red-600 flex items-center gap-2">
          ⚠️ {errorMsg}
          <button onClick={() => setErrorMsg('')} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* Input Mode Toggle */}
      {callStatus === 'active' && (
        <div className="border-t border-gray-100 px-4 pt-2 flex gap-2">
          <button
            onClick={() => setInputMode('voice')}
            className={`text-xs px-3 py-1 rounded-full transition-all ${inputMode === 'voice' ? 'bg-indigo-100 text-indigo-700 font-semibold' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            🎙️ Voice
          </button>
          <button
            onClick={() => setInputMode('text')}
            className={`text-xs px-3 py-1 rounded-full transition-all ${inputMode === 'text' ? 'bg-indigo-100 text-indigo-700 font-semibold' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            ⌨️ Text Fallback
          </button>
        </div>
      )}

      {/* Controls */}
      <div className="p-4 border-t border-gray-100 bg-white">
        {callStatus === 'idle' && (
          <button
            onClick={startCall}
            className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-semibold py-3 rounded-xl transition-all shadow-md hover:shadow-lg"
          >
            📞 Start Call
          </button>
        )}

        {callStatus === 'active' && inputMode === 'voice' && (
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={isListening ? stopListening : startListening}
              disabled={isSpeaking || isProcessing}
              className={`w-16 h-16 rounded-full text-white text-2xl transition-all shadow-lg ${micButtonClass} disabled:opacity-50`}
              title={isListening ? 'Stop speaking' : isSpeaking ? 'Agent speaking...' : 'Click to speak'}
            >
              {isListening ? '⏹' : isSpeaking ? '🔊' : '🎙️'}
            </button>
            <button
              onClick={endCall}
              className="bg-red-500 hover:bg-red-600 text-white font-semibold px-5 py-2.5 rounded-xl transition-all"
            >
              📵 End Call
            </button>
          </div>
        )}

        {callStatus === 'active' && inputMode === 'text' && (
          <form onSubmit={handleTextSubmit} className="flex gap-2">
            <input
              type="text"
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              placeholder="Type your message (text fallback mode)..."
              disabled={isProcessing}
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:bg-gray-50"
            />
            <button
              type="submit"
              disabled={isProcessing || !textInput.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl transition-all disabled:opacity-50"
            >
              Send →
            </button>
            <button type="button" onClick={endCall} className="bg-red-500 hover:bg-red-600 text-white px-3 py-2.5 rounded-xl">
              📵
            </button>
          </form>
        )}

        {callStatus === 'ended' && (
          <div className="text-center">
            <p className="text-gray-500 text-sm mb-2">Call ended · Duration: {formatDuration(callDuration)}</p>
            <button
              onClick={() => { setCallStatus('idle'); setTranscript([]); setCallDuration(0); }}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-5 py-2 rounded-xl transition-all"
            >
              🔄 New Call
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
