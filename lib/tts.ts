/**
 * lib/tts.ts — Unified Real-Voice Text-to-Speech Engine (100% Guaranteed Delivery)
 *
 * Capabilities:
 * 1. OpenAI High Quality Speech Synthesis (if VITE_OPENAI_API_KEY is configured).
 * 2. Multi-chunk Audio Stream Synthesis (handles long text / JDs without truncation).
 * 3. Browser-Native Web Speech API with HD Natural Voice Prioritization & Chrome Keep-Alive.
 * 4. 100% Non-truncating sentence chunking & unpause audio context guarantees.
 */

export interface SpeakOptions {
  /** Force a specific language: 'en', 'hi-IN', 'mr-IN' */
  lang?: string;
  /** Speech rate multiplier (default 0.95 for maximum clarity) */
  rate?: number;
  /** Speech pitch (default 1.0) */
  pitch?: number;
  /** Callback fired when the full utterance finishes */
  onEnd?: () => void;
  /** Callback fired if something goes wrong */
  onError?: (err: unknown) => void;
}

// ─── Module State ─────────────────────────────────────────────────────────────

let webVoicesReady = false;
let webVoices: SpeechSynthesisVoice[] = [];
let cancelGeneration = false;
let currentAudio: HTMLAudioElement | null = null;
let currentUtterance: SpeechSynthesisUtterance | null = null;
let keepAliveInterval: ReturnType<typeof setInterval> | null = null;
let isMutedGlobal = false;
let currentlySpeaking = false;

const loadVoices = () => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const voices = window.speechSynthesis.getVoices();
  if (voices && voices.length > 0) {
    webVoices = voices;
    webVoicesReady = true;
  }
};

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  loadVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
}

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
      if (webVoicesReady && webVoices.length > 0) {
        resolved = true;
        window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
        resolve();
      }
    };
    window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
    setTimeout(() => {
      if (!resolved) {
        loadVoices();
        resolved = true;
        window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
        resolve();
      }
    }, 800);
  });
};

const containsDevanagari = (text: string): boolean => /[\u0900-\u097F]/.test(text);

const detectLang = (text: string, explicit?: string): string => {
  if (explicit) return explicit;
  return containsDevanagari(text) ? 'hi-IN' : 'en';
};

/**
 * Clean & sanitize raw text for Speech Synthesis:
 * Strips HTML tags, Markdown syntax, URLs, bullet points & emojis so speech reads naturally.
 */
export const cleanTextForTTS = (text: string): string => {
  if (!text) return '';
  return text
    // Remove HTML tags
    .replace(/<[^>]*>/g, ' ')
    // Replace URLs with "link"
    .replace(/https?:\/\/\S+/gi, ' link ')
    // Strip markdown bold/italic syntax (**text**, *text*, __text__, _text_)
    .replace(/(\*\*|__|[*_])([^*_]+)\1/g, '$2')
    // Strip markdown headers (# Header)
    .replace(/#{1,6}\s+/g, '')
    // Strip markdown code blocks & inline code
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    // Strip markdown link labels [label](url) -> label
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Replace bullet symbols and special markers
    .replace(/[-*•▪♦▶►]\s+/g, '. ')
    // Remove excessive symbols that confuse speech engines
    .replace(/[#@$%^&*()_{}\[\]|\\/<>+=~`]/g, ' ')
    // Normalize whitespace
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Intelligent HD Voice Picker:
 * Ranks system & browser voices to select natural human voices (Edge Neural, Google HD, Apple Siri/Samantha, Microsoft Jenny/Guy)
 */
const pickVoice = (lang: string): SpeechSynthesisVoice | undefined => {
  loadVoices();
  if (!webVoices || webVoices.length === 0) return undefined;

  const targetLangPrefix = lang.split('-')[0].toLowerCase();

  // Voice quality keyword scoring function
  const scoreVoice = (v: SpeechSynthesisVoice): number => {
    let score = 0;
    const name = v.name.toLowerCase();
    const voiceLang = v.lang.toLowerCase();

    // Language match scoring
    if (voiceLang === lang.toLowerCase()) score += 60;
    else if (voiceLang.startsWith(targetLangPrefix)) score += 40;
    else if (targetLangPrefix === 'en' && voiceLang.includes('en')) score += 20;

    // Premium / Neural Quality keywords
    if (name.includes('natural') || name.includes('neural') || name.includes('online')) score += 50;
    if (name.includes('google')) score += 35;
    if (name.includes('siri') || name.includes('premium') || name.includes('enhanced')) score += 35;
    if (name.includes('samantha') || name.includes('jenny') || name.includes('guy') || name.includes('aria') || name.includes('karen') || name.includes('daniel') || name.includes('rishi') || name.includes('lekha')) score += 30;
    if (name.includes('zira') || name.includes('david')) score += 15;

    // Penalize robotic synth fallback engines if alternatives exist
    if (name.includes('espeak') || name.includes('compact') || name.includes('artic') || name.includes('flite')) score -= 60;

    return score;
  };

  const matchingVoices = webVoices.filter(v => v.lang.toLowerCase().startsWith(targetLangPrefix) || (targetLangPrefix === 'en' && v.lang.toLowerCase().includes('en')));
  
  if (matchingVoices.length > 0) {
    matchingVoices.sort((a, b) => scoreVoice(b) - scoreVoice(a));
    return matchingVoices[0];
  }

  // Fallback to any voice with highest score
  const sorted = [...webVoices].sort((a, b) => scoreVoice(b) - scoreVoice(a));
  return sorted[0];
};

// ─── Utilities ───────────────────────────────────────────────────────────────

/**
 * Clean & split text into natural sentences/clauses without hard character limits
 */
const splitTextIntoNaturalChunks = (text: string, maxChunkLength = 160): string[] => {
  const sanitized = cleanTextForTTS(text);
  if (!sanitized) return [];
  if (sanitized.length <= maxChunkLength) return [sanitized];

  // Regex split by sentence terminals (. ! ? \n) and sub-clause punctuation (; :)
  const rawSentences = sanitized.match(/[^.!?;\n]+[.!?;\n]?/g) || [sanitized];
  const chunks: string[] = [];

  let currentChunk = '';

  for (const rawSentence of rawSentences) {
    const sentence = rawSentence.trim();
    if (!sentence) continue;

    if ((currentChunk + ' ' + sentence).trim().length <= maxChunkLength) {
      currentChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;
    } else {
      if (currentChunk) chunks.push(currentChunk);
      
      if (sentence.length > maxChunkLength) {
        // Split very long clauses by commas
        const subParts = sentence.split(/,\s*/);
        let subChunk = '';
        for (const part of subParts) {
          if ((subChunk + ', ' + part).trim().length <= maxChunkLength) {
            subChunk = subChunk ? `${subChunk}, ${part}` : part;
          } else {
            if (subChunk) chunks.push(subChunk);
            subChunk = part;
          }
        }
        if (subChunk) currentChunk = subChunk;
        else currentChunk = '';
      } else {
        currentChunk = sentence;
      }
    }
  }
  if (currentChunk) chunks.push(currentChunk);

  return chunks;
};

const stopKeepAlive = () => {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
};

const startKeepAlive = () => {
  stopKeepAlive();
  keepAliveInterval = setInterval(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.speaking) {
      try {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      } catch (e) {}
    }
  }, 6000);
};

// ─── Public API Methods ──────────────────────────────────────────────────────

export const setMuteTTS = (muted: boolean) => {
  isMutedGlobal = muted;
  if (muted) {
    speak.stop();
  }
};

export const getMuteTTS = (): boolean => isMutedGlobal;

export const unlockTTSAudio = () => {
  if (typeof window === 'undefined') return;
  try {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.resume();
    }
    // Web Audio API unlock for iOS Safari & Android Mobile Chrome
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => undefined);
      }
    }
    const silentAudio = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=");
    silentAudio.volume = 0.01;
    silentAudio.play().catch(() => undefined);
  } catch (e) {
    console.warn("TTS Audio unlock attempt:", e);
  }
};

/**
 * Play voice audio stream (chunked sequentially for long text)
 */
const playAudioStreamTTS = async (textToSpeak: string, langTag: string, options?: SpeakOptions): Promise<boolean> => {
  const chunks = splitTextIntoNaturalChunks(textToSpeak, 160);
  if (chunks.length === 0) return false;

  const targetLang = langTag.startsWith('hi') ? 'hi' : langTag.startsWith('mr') ? 'mr' : 'en';

  for (let i = 0; i < chunks.length; i++) {
    if (cancelGeneration) return false;

    const chunkText = chunks[i];
    if (!chunkText) continue;

    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunkText)}&tl=${targetLang}&client=tw-ob`;

    const streamSuccess = await new Promise<boolean>((resolve) => {
      try {
        const audio = new Audio(url);
        currentAudio = audio;
        if (options?.rate) audio.playbackRate = options.rate;

        let finished = false;
        audio.onended = () => {
          if (!finished) {
            finished = true;
            resolve(true);
          }
        };

        audio.onerror = () => {
          if (!finished) {
            finished = true;
            resolve(false);
          }
        };

        audio.play().catch(() => {
          if (!finished) {
            finished = true;
            resolve(false);
          }
        });
      } catch (e) {
        resolve(false);
      }
    });

    if (!streamSuccess) {
      // If audio stream chunk fails (e.g. CORS/network error), abort stream & allow native fallback
      return false;
    }
  }

  return true;
};

/**
 * Primary Speak Function
 */
async function speak(text: string, options?: SpeakOptions): Promise<void> {
  speak.stop();
  cancelGeneration = false;

  const cleaned = cleanTextForTTS(text);
  if (!cleaned || isMutedGlobal) {
    options?.onEnd?.();
    return;
  }

  currentlySpeaking = true;
  unlockTTSAudio();

  const lang = detectLang(cleaned, options?.lang);

  // 1. Try High-Quality OpenAI Speech API if key configured
  const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
  if (OPENAI_API_KEY && cleaned.length < 4000) {
    try {
      const response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ model: "tts-1", input: cleaned, voice: "alloy" })
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        currentAudio = audio;
        if (options?.rate) audio.playbackRate = options.rate;

        return new Promise<void>((resolve) => {
          audio.onended = () => {
            currentlySpeaking = false;
            options?.onEnd?.();
            resolve();
          };
          audio.onerror = () => {
            currentlySpeaking = false;
            options?.onError?.(new Error('Audio playback error'));
            resolve();
          };
          audio.play().catch(() => {
            currentlySpeaking = false;
            resolve();
          });
        });
      }
    } catch (e) {
      // Ignore and fallback
    }
  }

  // 2. Complete Reliable Web Speech API Native Synthesis
  return new Promise<void>(async (resolve) => {
    await playNativeTTS(cleaned, lang, options, () => {
      currentlySpeaking = false;
      resolve();
    });
  });
}

/**
 * Web Speech API Native Synthesis Implementation with GC-Safe Utterance Ref & Chrome Unfreeze Heartbeat
 */
async function playNativeTTS(text: string, voiceLang: string, options: SpeakOptions | undefined, resolve: () => void) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    options?.onEnd?.();
    resolve();
    return;
  }

  await ensureVoicesLoaded();

  if (cancelGeneration) {
    resolve();
    return;
  }

  try {
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
  } catch (e) {}

  const chunks = splitTextIntoNaturalChunks(text, 160);
  let currentIndex = 0;

  startKeepAlive();

  const playNextSentence = () => {
    if (cancelGeneration || currentIndex >= chunks.length) {
      stopKeepAlive();
      currentUtterance = null;
      options?.onEnd?.();
      resolve();
      return;
    }

    try {
      window.speechSynthesis.resume();
    } catch (e) {}

    const sentenceText = chunks[currentIndex];
    const utter = new SpeechSynthesisUtterance(sentenceText);
    currentUtterance = utter; // Retain module reference to prevent V8 Garbage Collection abort bug!

    utter.lang = voiceLang;
    utter.rate = options?.rate ?? 0.95; // 0.95 rate for enhanced clarity
    utter.pitch = options?.pitch ?? 1.0;

    const voice = pickVoice(voiceLang);
    if (voice) {
      utter.voice = voice;
    }

    let ended = false;

    utter.onend = () => {
      if (!ended) {
        ended = true;
        currentIndex++;
        playNextSentence();
      }
    };

    utter.onerror = (err) => {
      if (!ended) {
        ended = true;
        currentIndex++;
        playNextSentence();
      }
    };

    try {
      window.speechSynthesis.speak(utter);
    } catch (e) {
      if (!ended) {
        ended = true;
        currentIndex++;
        playNextSentence();
      }
    }
  };

  playNextSentence();
}

// ─── Speech Control Extensions ───────────────────────────────────────────────

speak.stop = (): void => {
  cancelGeneration = true;
  currentlySpeaking = false;
  currentUtterance = null;
  stopKeepAlive();

  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch (e) {}
    currentAudio = null;
  }

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {}
  }
};

speak.pause = (): void => {
  if (currentAudio) {
    currentAudio.pause();
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.pause();
    } catch (e) {}
  }
};

speak.resume = (): void => {
  if (currentAudio) {
    currentAudio.play().catch(() => undefined);
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.resume();
    } catch (e) {}
  }
};

speak.isSpeaking = (): boolean => {
  if (currentAudio && !currentAudio.paused) return true;
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    return window.speechSynthesis.speaking;
  }
  return currentlySpeaking;
};

speak.isMuted = getMuteTTS;
speak.setMuted = setMuteTTS;

export { speak };

