/**
 * services/assemblyAiStreaming.ts
 * Real-Time Streaming & Direct Audio Transcription via AssemblyAI
 *
 * Provides:
 * 1. AssemblyAiRealtimeSession: Real-time WebSocket audio streaming to AssemblyAI Streaming v3.
 * 2. transcribeAudioBlobWithAssemblyAI: Direct audio blob upload & transcription fallback.
 */

const DEFAULT_API_KEY = '4a07d7f7399f447b9ff969c458df945f';

export const getAssemblyAiApiKey = (): string => {
  return import.meta.env.VITE_ASSEMBLYAI_API_KEY || DEFAULT_API_KEY;
};

export interface AssemblyAiStreamCallbacks {
  onTranscript: (text: string, isEndOfTurn: boolean, isFormatted?: boolean) => void;
  onSpeechStarted?: () => void;
  onError?: (err: any) => void;
  onStateChange?: (state: 'connecting' | 'listening' | 'closed' | 'error') => void;
}

function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output.buffer;
}

function downsampleBuffer(buffer: Float32Array, inputSampleRate: number, targetSampleRate = 16000): Float32Array {
  if (inputSampleRate === targetSampleRate) return buffer;
  const sampleRateRatio = inputSampleRate / targetSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : buffer[offsetBuffer] || 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

export class AssemblyAiRealtimeSession {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private isStreaming = false;
  private isPaused = false;
  private preRollQueue: ArrayBuffer[] = [];
  private callbacks: AssemblyAiStreamCallbacks;
  private silenceTimer: any = null;
  private accumulatedText = '';

  constructor(callbacks: AssemblyAiStreamCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Request a temporary streaming token from AssemblyAI v3
   */
  private async getTemporaryToken(): Promise<string> {
    // 1. Fetch via our serverless API route to avoid browser CORS preflight restrictions
    try {
      const serverlessRes = await fetch('/api/assemblyai-token', {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      if (serverlessRes.ok) {
        const data = await serverlessRes.json();
        if (data && data.token) {
          return data.token;
        }
      }
    } catch (serverlessErr) {
      console.warn('[AssemblyAI Stream] Serverless token fetch notice:', serverlessErr);
    }

    // 2. Direct fetch fallback (if called in non-browser or CORS-permissive environment)
    const apiKey = getAssemblyAiApiKey();
    const res = await fetch('https://streaming.assemblyai.com/v3/token?expires_in_seconds=600', {
      method: 'GET',
      headers: {
        Authorization: apiKey
      }
    });
    if (!res.ok) {
      throw new Error(`Failed to obtain AssemblyAI token: HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.token;
  }

  /**
   * Connect WebSocket and start capturing microphone audio
   */
  public async start(): Promise<void> {
    if (this.isStreaming) {
      this.resume();
      return;
    }
    this.accumulatedText = '';
    this.isPaused = false;
    this.preRollQueue = [];

    try {
      this.callbacks.onStateChange?.('connecting');
      const token = await this.getTemporaryToken();

      // Open v3 streaming websocket with max accuracy parameters
      const wsUrl = `wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&format_turns=true&min_turn_silence=250&max_turn_silence=2000&token=${encodeURIComponent(token)}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = async () => {
        try {
          await this.initMicrophoneCapture();
          this.isStreaming = true;
          console.info('[AssemblyAI Stream] Connected successfully to AssemblyAI v3 streaming WebSocket');
          this.callbacks.onStateChange?.('listening');
        } catch (micErr) {
          console.error('[AssemblyAI Stream] Microphone init failed:', micErr);
          this.callbacks.onError?.(micErr);
          this.stop();
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'SpeechStarted') {
            this.callbacks.onSpeechStarted?.();
          }

          if (msg.type === 'Turn') {
            if (this.isPaused) return;
            const transcript = (msg.transcript || '').trim();
            const isEndOfTurn = Boolean(msg.end_of_turn);
            const isFormatted = Boolean(msg.turn_is_formatted);

            if (transcript) {
              this.accumulatedText = transcript;
              this.callbacks.onTranscript(transcript, isEndOfTurn, isFormatted);
            }
          }
        } catch (parseErr) {
          console.warn('[AssemblyAI Stream] JSON parse error:', parseErr);
        }
      };

      this.ws.onerror = (wsErr) => {
        console.warn('[AssemblyAI Stream] WebSocket notice:', wsErr);
        this.callbacks.onError?.(wsErr);
      };

      this.ws.onclose = () => {
        if (this.isStreaming) {
          console.info('[AssemblyAI Stream] WebSocket connection closed, reconnecting session...');
          setTimeout(() => {
            if (this.isStreaming) {
              this.reconnectWs();
            }
          }, 600);
        } else {
          this.callbacks.onStateChange?.('closed');
        }
      };
    } catch (err) {
      console.error('[AssemblyAI Stream] Start failed:', err);
      this.callbacks.onError?.(err);
      this.callbacks.onStateChange?.('error');
      throw err;
    }
  }

  /**
   * Transparent WebSocket reconnection for long-running calls
   */
  private async reconnectWs(): Promise<void> {
    try {
      const token = await this.getTemporaryToken();
      const wsUrl = `wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&format_turns=true&min_turn_silence=250&max_turn_silence=2000&token=${encodeURIComponent(token)}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.info('[AssemblyAI Stream] Reconnected successfully to AssemblyAI v3 WebSocket');
        this.callbacks.onStateChange?.('listening');
        if (!this.isPaused) {
          this.flushPreRoll();
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'SpeechStarted') {
            this.callbacks.onSpeechStarted?.();
          }
          if (msg.type === 'Turn') {
            if (this.isPaused) return;
            const transcript = (msg.transcript || '').trim();
            const isEndOfTurn = Boolean(msg.end_of_turn);
            const isFormatted = Boolean(msg.turn_is_formatted);
            if (transcript) {
              this.accumulatedText = transcript;
              this.callbacks.onTranscript(transcript, isEndOfTurn, isFormatted);
            }
          }
        } catch (_) {}
      };

      this.ws.onerror = (e) => this.callbacks.onError?.(e);
      this.ws.onclose = () => {
        if (this.isStreaming) {
          setTimeout(() => {
            if (this.isStreaming) this.reconnectWs();
          }, 1000);
        }
      };
    } catch (e) {
      this.callbacks.onError?.(e);
    }
  }

  /**
   * Pause speech recognition stream while AI is speaking.
   * Keeps audio hardware and WebSocket connection alive, and stores a rolling 400ms pre-roll buffer
   * so that the instant candidate starts answering, the opening 2-3 words are NEVER lost!
   */
  public pause(): void {
    this.isPaused = true;
    this.accumulatedText = '';
    // Clear out stale buffers from prior question
    this.preRollQueue = [];
  }

  /**
   * Resume speech recognition immediately with ZERO latency.
   * Flushes rolling pre-roll audio frames directly into the active WebSocket.
   */
  public resume(): void {
    this.isPaused = false;
    this.accumulatedText = '';
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.reconnectWs();
    } else {
      this.flushPreRoll();
    }
    this.callbacks.onStateChange?.('listening');
  }

  private flushPreRoll(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.preRollQueue.length > 0) {
      while (this.preRollQueue.length > 0) {
        const chunk = this.preRollQueue.shift();
        if (chunk) {
          this.ws.send(chunk);
        }
      }
    }
  }

  /**
   * Initialize microphone media stream & Web Audio processor with 16kHz preference
   */
  private async initMicrophoneCapture(): Promise<void> {
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1
      }
    });

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    try {
      this.audioContext = new AudioContextClass({ sampleRate: 16000 });
    } catch (_) {
      this.audioContext = new AudioContextClass();
    }

    const source = this.audioContext.createMediaStreamSource(this.mediaStream);

    // 4096 buffer size gives smooth, low-latency audio chunks (~85ms)
    this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);

    this.scriptProcessor.onaudioprocess = (e) => {
      if (!this.isStreaming) return;

      const inputChannel = e.inputBuffer.getChannelData(0);
      const downsampled = downsampleBuffer(inputChannel, this.audioContext?.sampleRate || 44100, 16000);
      const pcm16 = floatTo16BitPCM(downsampled);

      // If paused (AI is speaking), maintain rolling pre-roll buffer of ~400ms (5 chunks of 85ms)
      if (this.isPaused) {
        this.preRollQueue.push(pcm16);
        if (this.preRollQueue.length > 5) {
          this.preRollQueue.shift();
        }
        return;
      }

      // Live streaming: send chunk immediately
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(pcm16);
      }
    };

    source.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.audioContext.destination);
  }

  /**
   * Stop streaming and release all audio & network resources at the end of call
   */
  public stop(): string {
    this.isStreaming = false;
    this.isPaused = false;
    this.preRollQueue = [];

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    // Cleanly terminate WebSocket
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: 'Terminate' }));
        this.ws.close();
      } catch (_) {}
    }
    this.ws = null;

    // Stop microphone stream tracks
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    // Disconnect script processor & close audio context
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    return this.accumulatedText;
  }

  public getAccumulatedText(): string {
    return this.accumulatedText;
  }

  public isActive(): boolean {
    return this.isStreaming;
  }

  public getMediaStream(): MediaStream | null {
    return this.mediaStream;
  }
}

/**
 * Direct Audio Blob Upload & Transcription Fallback using AssemblyAI REST API
 */
export async function transcribeAudioBlobWithAssemblyAI(audioBlob: Blob): Promise<string> {
  const apiKey = getAssemblyAiApiKey();

  // 1. Upload audio to AssemblyAI CDN
  const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
    method: 'POST',
    headers: {
      Authorization: apiKey
    },
    body: audioBlob
  });

  if (!uploadRes.ok) {
    throw new Error(`AssemblyAI audio upload failed: HTTP ${uploadRes.status}`);
  }

  const uploadData = await uploadRes.json();
  const uploadUrl = uploadData.upload_url;
  if (!uploadUrl) {
    throw new Error('AssemblyAI returned empty upload_url');
  }

  // 2. Request transcription
  const transcriptRes = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      audio_url: uploadUrl,
      language_code: 'en'
    })
  });

  if (!transcriptRes.ok) {
    throw new Error(`AssemblyAI transcript request failed: HTTP ${transcriptRes.status}`);
  }

  const transcriptData = await transcriptRes.json();
  const transcriptId = transcriptData.id;
  if (!transcriptId) {
    throw new Error('AssemblyAI returned empty transcript ID');
  }

  // 3. Poll for result (polling every 600ms, max 15 attempts)
  for (let attempt = 0; attempt < 15; attempt++) {
    await new Promise((r) => setTimeout(r, 600));
    const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
      headers: { Authorization: apiKey }
    });
    if (!pollRes.ok) continue;

    const pollData = await pollRes.json();
    if (pollData.status === 'completed') {
      return (pollData.text || '').trim();
    }
    if (pollData.status === 'error') {
      throw new Error(pollData.error || 'AssemblyAI transcription status error');
    }
  }

  return '';
}
