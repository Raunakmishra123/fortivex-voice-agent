/**
 * src/services/sttTtsVoiceService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Fortivex AI — Speech-to-Text & Text-to-Speech Voice Service
 *
 * PURPOSE  : Abstracts all voice I/O for the sales agent.
 *            Uses the browser's built-in Web Speech API (no API key needed).
 *            Falls back to text input automatically when mic is unavailable.
 *            Plug in Deepgram/ElevenLabs by swapping the two providers below.
 *
 * INPUTS   : Audio stream from browser mic OR text string from text fallback
 * OUTPUTS  : Transcribed text string (STT) | Audio playback (TTS)
 *
 * WHERE TO MODIFY:
 *   - Switch to Deepgram STT → replace startWebSpeechRecognition() with startDeepgramStream()
 *   - Switch to ElevenLabs TTS → replace speakWithWebSpeech() with speakWithElevenLabs()
 *   - Adjust TTS voice/rate/pitch → TTS_CONFIG constants below
 *   - Change supported languages → SUPPORTED_LANGUAGES array
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Configuration ─────────────────────────────────────────────────────────────
const TTS_CONFIG = {
  rate: 1.05,       // Speech rate: 0.1–10. 1.0 = normal speed
  pitch: 1.0,       // Pitch: 0–2. 1.0 = normal
  volume: 1.0,      // Volume: 0–1
  defaultVoiceName: 'Google US English', // Preferred TTS voice (falls back if unavailable)
};

const STT_CONFIG = {
  continuous: false,         // Single utterance mode (set true for push-to-talk streams)
  interimResults: true,      // Show live partial results while speaking
  maxAlternatives: 1,
};

export const SUPPORTED_LANGUAGES = [
  { code: 'en-US', label: 'English', flag: '🇺🇸' },
  { code: 'hi-IN', label: 'Hindi', flag: '🇮🇳' },
  { code: 'es-ES', label: 'Spanish', flag: '🇪🇸' },
];

// ── Browser Capability Detection ───────────────────────────────────────────────
export function detectVoiceCapabilities() {
  return {
    sttSupported: 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window,
    ttsSupported: 'speechSynthesis' in window,
    micAvailable: navigator.mediaDevices !== undefined,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// STT — Speech-to-Text (Web Speech API)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Starts a speech recognition session.
 * @param {string} langCode - BCP-47 language code (e.g. 'en-US', 'hi-IN')
 * @param {Function} onInterim - Called with partial transcript while speaking
 * @param {Function} onFinal   - Called with final transcript when utterance ends
 * @param {Function} onError   - Called with error string on failure
 * @returns {{ stop: Function }} Object with stop() to end recognition
 */
export function startSpeechRecognition(langCode = 'en-US', onInterim, onFinal, onError) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    onError?.('Web Speech API not supported. Use text input fallback.');
    return { stop: () => {} };
  }

  const recognition = new SpeechRecognition();
  recognition.lang = langCode;
  recognition.continuous = STT_CONFIG.continuous;
  recognition.interimResults = STT_CONFIG.interimResults;
  recognition.maxAlternatives = STT_CONFIG.maxAlternatives;

  recognition.onresult = (event) => {
    let interim = '';
    let final = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        final += transcript;
      } else {
        interim += transcript;
      }
    }

    if (interim) onInterim?.(interim);
    if (final) onFinal?.(final.trim());
  };

  recognition.onerror = (event) => {
    const userFriendlyErrors = {
      'no-speech': 'No speech detected. Please try again.',
      'audio-capture': 'Microphone not accessible. Check browser permissions.',
      'not-allowed': 'Microphone permission denied. Using text input fallback.',
      'network': 'Network error during speech recognition.',
    };
    onError?.(userFriendlyErrors[event.error] || `Speech error: ${event.error}`);
  };

  recognition.start();
  return { stop: () => recognition.stop() };
}

// ════════════════════════════════════════════════════════════════════════════
// TTS — Text-to-Speech (Web Speech Synthesis API)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Speaks the given text using the browser's Speech Synthesis API.
 * @param {string} text      - Text to speak
 * @param {string} langCode  - BCP-47 language code for voice selection
 * @param {Function} onStart - Called when speech starts
 * @param {Function} onEnd   - Called when speech finishes
 * @returns {{ cancel: Function }} Object with cancel() to stop speech
 */
export function speakText(text, langCode = 'en-US', onStart, onEnd) {
  if (!window.speechSynthesis) {
    console.warn('[sttTtsVoiceService] TTS not available');
    onEnd?.();
    return { cancel: () => {} };
  }

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = langCode;
  utterance.rate = TTS_CONFIG.rate;
  utterance.pitch = TTS_CONFIG.pitch;
  utterance.volume = TTS_CONFIG.volume;

  // Try to find the preferred voice, fall back to system default
  const voices = window.speechSynthesis.getVoices();
  const preferredVoice = voices.find(v => v.name === TTS_CONFIG.defaultVoiceName && v.lang.startsWith(langCode.split('-')[0]))
    || voices.find(v => v.lang.startsWith(langCode.split('-')[0]))
    || voices[0];

  if (preferredVoice) utterance.voice = preferredVoice;

  utterance.onstart = () => onStart?.();
  utterance.onend = () => onEnd?.();
  utterance.onerror = (e) => {
    console.error('[sttTtsVoiceService] TTS error:', e.error);
    onEnd?.();
  };

  window.speechSynthesis.speak(utterance);

  return { cancel: () => window.speechSynthesis.cancel() };
}

/**
 * Returns available TTS voices filtered by language prefix.
 * Call after 'voiceschanged' event fires for async voice loading.
 */
export function getAvailableVoices(langPrefix = 'en') {
  if (!window.speechSynthesis) return [];
  return window.speechSynthesis.getVoices().filter(v => v.lang.startsWith(langPrefix));
}

/**
 * Measures simulated latency for mock/text mode.
 * Returns artificial delay to mimic real STT processing time.
 */
export function simulateLatency(textLength) {
  // 50ms base + 10ms per word (simulates network + processing)
  return Math.min(50 + Math.round(textLength / 5) * 10, 800);
}
