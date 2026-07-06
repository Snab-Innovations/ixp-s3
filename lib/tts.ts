/**
 * lib/tts.ts — Unified Text-to-Speech Engine (Highly Optimized)
 *
 * Routing for ALL languages:
 *   • English text  → Native Web Speech API (Strictly English voices to avoid gibberish)
 *   • Hindi (hi-IN)  → Native Web Speech API 
 *   • Marathi (mr-IN) → Native Web Speech API 
 *
 * This version completely strips out local heavy AI models (like Kokoro) 
 * so that it runs flawlessly instantly with 0 GPU/RAM overhead on the absolute worst, 
 * low-end PCs without any static or audio distortion.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SpeakOptions {
  /** Force a specific language: 'en', 'hi-IN', 'mr-IN' */
  lang?: string;
  /** Speech rate multiplier (default 1.0) — used by Web Speech API */
  rate?: number;
  /** Callback fired when the full utterance finishes */
  onEnd?: () => void;
  /** Callback fired if something goes wrong */
  onError?: (err: unknown) => void;
}

// ─── Module-level singletons ─────────────────────────────────────────────────

/** Track whether Web Speech voices are loaded */
let webVoicesReady = false;
let webVoices: SpeechSynthesisVoice[] = [];

const loadVoices = () => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  webVoices = window.speechSynthesis.getVoices();
  if (webVoices.length > 0) webVoicesReady = true;
};

// Pre-load Web Speech voices as soon as this module is imported
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  loadVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ensureVoicesLoaded = async (): Promise<void> => {
  if (webVoicesReady && webVoices.length > 0) return;
  loadVoices();
  if (webVoicesReady && webVoices.length > 0) return;

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  return new Promise<void>((resolve) => {
    let resolved = false;
    const onVoicesChanged = () => {
      if (resolved) return;
      loadVoices();
      if (webVoicesReady) {
        resolved = true;
        window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
        resolve();
      }
    };
    window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
    
    // Timeout fallback for low-end PCs that might never fire it
    setTimeout(() => {
      if (!resolved) {
        loadVoices();
        resolved = true;
        window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
        resolve();
      }
    }, 1500);
  });
};

/** Returns true when the text contains Devanagari characters (Hindi / Marathi) */
const containsDevanagari = (text: string): boolean =>
  /[\u0900-\u097F]/.test(text);

/** Detect language from text if not supplied */
const detectLang = (text: string, explicit?: string): string => {
  if (explicit) return explicit;
  return containsDevanagari(text) ? 'hi-IN' : 'en';
};

/** Pick the best Web Speech voice for a given BCP-47 language tag */
const pickVoice = (lang: string): SpeechSynthesisVoice | undefined => {
  loadVoices();
  const prefix = lang.split('-')[0].toLowerCase();
  
  // -- BULLETPROOF ENGLISH VOICE FINDER --
  // On worst PCs, defaulting to a Hindi voice for English text sounds like garbage gibberish.
  if (prefix === 'en') {
    const enVoices = webVoices.filter(v => 
      v.lang.toLowerCase().includes('en') || 
      v.name.toLowerCase().includes('english') ||
      v.name.toLowerCase().includes('david') ||
      v.name.toLowerCase().includes('zira') ||
      v.name.toLowerCase().includes('mark') ||
      v.name.toLowerCase().includes('susan') ||
      v.name.toLowerCase().includes('george') ||
      v.name.toLowerCase().includes('hazel')
    );
    
    if (enVoices.length > 0) {
      // 1. Google US/GB (Best quality in Chrome)
      const googleUSGB = enVoices.find(v => v.name.toLowerCase().includes('google') && (v.lang.includes('US') || v.lang.includes('GB')));
      if (googleUSGB) return googleUSGB;
      
      // 2. Any Google English
      const googleEn = enVoices.find(v => v.name.toLowerCase().includes('google'));
      if (googleEn) return googleEn;
      
      // 3. Microsoft Natural / Microsoft Desktop voices (Built-in Windows native)
      const msUSGB = enVoices.find(v => v.lang.includes('US') || v.lang.includes('GB'));
      if (msUSGB) return msUSGB;
      
      // 4. Any English voice available
      return enVoices[0];
    }
  }

  // -- HINDI / MARATHI / OTHERS --
  // Prefer Google voice for Indian languages if available
  const googleVoice = webVoices.find(
    (v) => v.lang.toLowerCase().startsWith(prefix) && v.name.toLowerCase().includes('google')
  );
  if (googleVoice) return googleVoice;

  // Fallback exact match
  const fallback = webVoices.find((v) => v.lang === lang);
  if (fallback) return fallback;

  // Fallback prefix match
  return webVoices.find((v) => v.lang.toLowerCase().startsWith(prefix));
};

// ─── Cancellation token ──────────────────────────────────────────────────────

let cancelGeneration = false;

// ─── Core speak() function ───────────────────────────────────────────────────

/**
 * Speak the given text.
 * Uses high-quality OpenAI TTS for Indian languages (Hindi, Marathi) for human-like reading.
 * Uses native Web Speech API for English for instant response.
 */
let currentAudio: HTMLAudioElement | null = null;

async function speak(text: string, options?: SpeakOptions): Promise<void> {
  speak.stop();
  cancelGeneration = false;

  const lang = detectLang(text, options?.lang);
  
  // High-Quality AI TTS for Indian Languages (Hindi, Marathi)
  if (lang === 'hi-IN' || lang === 'mr-IN' || lang === 'hi' || lang === 'mr') {
    return new Promise<void>(async (resolve) => {
      try {
        const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
        if (!OPENAI_API_KEY) {
          console.warn("OpenAI API key missing, falling back to robotic native TTS.");
          throw new Error("Missing API Key");
        }

        const response = await fetch("https://api.openai.com/v1/audio/speech", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: "tts-1", input: text, voice: "alloy" })
        });

        if (!response.ok) throw new Error("OpenAI TTS failed");
        
        if (cancelGeneration) {
          resolve();
          return;
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        currentAudio = audio;

        audio.onended = () => {
          options?.onEnd?.();
          resolve();
        };

        audio.onerror = (e) => {
          console.error("Audio playback error:", e);
          options?.onError?.(e);
          resolve();
        };

        audio.play().catch(e => {
          console.error("Audio play failed:", e);
          options?.onError?.(e);
          resolve();
        });
      } catch (err) {
        // Fallback to Native TTS if API fails or is missing
        await playNativeTTS(text, 'hi-IN', options, resolve);
      }
    });
  }

  // Native TTS for English
  return new Promise<void>(async (resolve) => {
    await playNativeTTS(text, 'en-US', options, resolve);
  });
}

// Helper to play native TTS (chunked for slow PCs)
async function playNativeTTS(text: string, voiceLang: string, options: SpeakOptions | undefined, resolve: () => void) {
  if (!('speechSynthesis' in window)) {
    console.warn('[TTS] Web Speech API not supported in this browser/PC');
    options?.onEnd?.();
    resolve();
    return;
  }
  
  await ensureVoicesLoaded();
  if (cancelGeneration) {
     resolve();
     return;
  }
  window.speechSynthesis.cancel();

  const rawChunks = text.match(/[^.!?;]+[.!?;]?/g) || [text];
  const sentences = rawChunks.map(s => s.trim()).filter(s => s.length > 0);
  let currentIndex = 0;

  const playNextChunk = () => {
    if (cancelGeneration || currentIndex >= sentences.length) {
      options?.onEnd?.();
      resolve();
      return;
    }

    const utter = new SpeechSynthesisUtterance(sentences[currentIndex]);
    utter.lang = voiceLang;
    utter.rate = options?.rate ?? 1.0;

    const voice = pickVoice(voiceLang);
    if (voice) utter.voice = voice;

    utter.onend = () => {
      currentIndex++;
      playNextChunk();
    };

    utter.onerror = (e) => {
      const errorName = 'error' in e ? e.error : 'unknown';
      if (errorName !== 'interrupted' && errorName !== 'canceled' && errorName !== 'not-allowed') {
        console.warn(`[TTS] Native speech skipped chunk (${errorName}):`, e);
      }
      currentIndex++;
      playNextChunk();
    };

    window.speechSynthesis.speak(utter);
  };

  playNextChunk();
}

// ─── speak.stop() ────────────────────────────────────────────────────────────

speak.stop = (): void => {
  cancelGeneration = true;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
};

export { speak };

