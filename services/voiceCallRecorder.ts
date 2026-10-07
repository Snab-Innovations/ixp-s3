/**
 * services/voiceCallRecorder.ts
 * Dual-Channel Web Audio Call Recorder for Voice Interviews
 * 
 * Mixes candidate microphone audio + AI question speech into a single, continuous
 * audio stream and records it using MediaRecorder from start to finish.
 * At call completion, exports the recorded Blob for upload to AWS S3.
 */

export class VoiceCallRecorder {
  private audioContext: AudioContext | null = null;
  private mixedDestination: MediaStreamAudioDestinationNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private activeAiSourceNode: AudioBufferSourceNode | null = null;
  private mimeType: string = 'audio/webm';
  private isRecording = false;

  /**
   * Initialize AudioContext and mix candidate microphone stream
   */
  public async init(micStream: MediaStream): Promise<void> {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    this.audioContext = new AudioContextClass();
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume().catch(() => {});
    }

    // Create destination node where both mic + AI speech will be mixed
    this.mixedDestination = this.audioContext.createMediaStreamDestination();

    // Pipe candidate microphone into the recording destination ONLY (not to speakers to avoid echo)
    this.micSource = this.audioContext.createMediaStreamSource(micStream);
    this.micSource.connect(this.mixedDestination);

    // Pick best supported MIME type
    if (typeof MediaRecorder !== 'undefined') {
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        this.mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        this.mimeType = 'audio/webm';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        this.mimeType = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        this.mimeType = 'audio/ogg';
      }
    }
  }

  /**
   * Start recording the mixed call stream
   */
  public start(): void {
    if (!this.mixedDestination || this.isRecording) return;
    this.chunks = [];

    try {
      this.mediaRecorder = new MediaRecorder(this.mixedDestination.stream, {
        mimeType: this.mimeType
      });

      this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };

      this.mediaRecorder.start(1000); // 1-second chunks
      this.isRecording = true;
      console.info(`[Call Recorder] Started recording entire call (Format: ${this.mimeType})`);
    } catch (err) {
      console.warn('[Call Recorder] Failed to start MediaRecorder:', err);
    }
  }

  /**
   * Play AI speech through speakers AND inject it into the call recording stream
   */
  public async playAiAudioBlob(audioBlob: Blob, isMuted = false): Promise<void> {
    if (!this.audioContext || !this.mixedDestination) return;

    try {
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume().catch(() => {});
      }

      const arrayBuffer = await audioBlob.arrayBuffer();
      // Decode audio data (makes a copy to prevent detachment)
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer.slice(0));

      return new Promise<void>((resolve) => {
        if (!this.audioContext || !this.mixedDestination) {
          resolve();
          return;
        }

        const sourceNode = this.audioContext.createBufferSource();
        sourceNode.buffer = audioBuffer;
        this.activeAiSourceNode = sourceNode;

        // 1. Send to recording stream so AI speech is captured in digital quality
        sourceNode.connect(this.mixedDestination);

        // 2. Send to user speakers (unless candidate muted AI audio)
        if (!isMuted) {
          sourceNode.connect(this.audioContext.destination);
        }

        sourceNode.onended = () => {
          if (this.activeAiSourceNode === sourceNode) {
            this.activeAiSourceNode = null;
          }
          resolve();
        };

        sourceNode.start(0);
      });
    } catch (err) {
      console.warn('[Call Recorder] Error playing AI audio buffer:', err);
    }
  }

  /**
   * Stop any currently playing AI audio node
   */
  public stopAiSpeech(): void {
    if (this.activeAiSourceNode) {
      try {
        this.activeAiSourceNode.stop();
        this.activeAiSourceNode.disconnect();
      } catch (_) {}
      this.activeAiSourceNode = null;
    }
  }

  /**
   * Stop recording and return final combined call audio Blob
   */
  public async stop(): Promise<Blob | null> {
    this.isRecording = false;
    this.stopAiSpeech();

    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
      if (this.chunks.length > 0) {
        return new Blob(this.chunks, { type: this.mimeType });
      }
      return null;
    }

    return new Promise<Blob | null>((resolve) => {
      if (!this.mediaRecorder) {
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = () => {
        const fullBlob = new Blob(this.chunks, { type: this.mimeType });
        console.info(`[Call Recorder] Call recording complete. Size: ${(fullBlob.size / 1024).toFixed(1)} KB`);
        resolve(fullBlob);
      };

      try {
        this.mediaRecorder.stop();
      } catch (_) {
        const fullBlob = new Blob(this.chunks, { type: this.mimeType });
        resolve(fullBlob);
      }
    });
  }

  /**
   * Release audio context & stream handles
   */
  public destroy(): void {
    this.stopAiSpeech();
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try { this.mediaRecorder.stop(); } catch (_) {}
    }
    if (this.micSource) {
      try { this.micSource.disconnect(); } catch (_) {}
      this.micSource = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }
}
