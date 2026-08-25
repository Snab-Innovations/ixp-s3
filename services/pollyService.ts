/**
 * services/pollyService.ts
 * Browser-Safe AWS Polly Text-to-Speech Engine with Indian Bilingual Voice (Aditi)
 *
 * Configuration:
 * - VoiceId: Aditi
 * - Engine: standard
 * - LanguageCode: hi-IN or en-IN
 * - OutputFormat: mp3
 */

export interface PollySynthesizeOptions {
  /** Language tag: 'hi', 'hi-IN', 'en', 'en-IN', 'mr' */
  lang?: string;
  /** Speech rate playback speed (default 0.95) */
  rate?: number;
  /** Callback on end */
  onEnd?: () => void;
  /** Callback on error */
  onError?: (err: unknown) => void;
}

let activePollyAudio: HTMLAudioElement | null = null;

/**
 * Stop any currently playing Polly audio stream
 */
export const stopPollyAudio = (): void => {
  if (activePollyAudio) {
    try {
      activePollyAudio.pause();
      activePollyAudio.currentTime = 0;
    } catch (e) {
      // Ignore
    }
    activePollyAudio = null;
  }
};

/**
 * Synthesize speech using AWS Polly with Indian Bilingual Voice 'Aditi'
 */
export const synthesizeWithPolly = async (
  text: string,
  options?: PollySynthesizeOptions
): Promise<boolean> => {
  stopPollyAudio();

  if (!text || !text.trim()) return false;

  const cleanText = text
    .replace(/<[^>]*>/g, " ")
    .replace(/https?:\/\/\S+/gi, " link ")
    .replace(/(\*\*|__|[*_])([^*_]+)\1/g, "$2")
    .replace(/#{1,6}\s+/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[-*•▪♦▶►]\s+/g, ". ")
    .replace(/[#@$%^&*()_{}\[\]|\\/<>+=~`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleanText) return false;

  // Determine LanguageCode (bilingual hi-IN vs en-IN)
  const isHindiText = /[\u0900-\u097F]/.test(cleanText);
  const langLower = (options?.lang || "").toLowerCase();
  const isHindiLang = langLower.startsWith("hi") || langLower.startsWith("mr") || isHindiText;
  const languageCode = isHindiLang ? "hi-IN" : "en-IN";

  // Synthesize via backend /api/tts-polly endpoint
  try {
    const response = await fetch("/api/tts-polly", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: cleanText,
        lang: languageCode,
        voiceId: "Aditi",
        engine: "standard",
        outputFormat: "mp3",
      }),
    });

    if (response.ok) {
      const blob = await response.blob();
      if (blob && blob.size > 0) {
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        activePollyAudio = audio;
        if (options?.rate) audio.playbackRate = options.rate;

        return new Promise<boolean>((resolve) => {
          audio.onended = () => {
            activePollyAudio = null;
            URL.revokeObjectURL(audioUrl);
            options?.onEnd?.();
            resolve(true);
          };
          audio.onerror = (err) => {
            activePollyAudio = null;
            URL.revokeObjectURL(audioUrl);
            options?.onError?.(err);
            resolve(false);
          };
          audio.play().catch((playErr) => {
            activePollyAudio = null;
            URL.revokeObjectURL(audioUrl);
            options?.onError?.(playErr);
            resolve(false);
          });
        });
      }
    } else {
      const errorText = await response.text().catch(() => "");
      console.warn("AWS Polly endpoint HTTP error:", response.status, errorText);
    }
  } catch (apiErr) {
    console.warn("AWS Polly REST API endpoint failed:", apiErr);
  }

  return false;
};
