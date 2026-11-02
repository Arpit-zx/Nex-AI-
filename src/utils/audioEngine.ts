import { SupportedLanguage } from './nexCore';

class AudioAccessibilityEngine {
  private audioCtx: AudioContext | null = null;
  private lastSpokenText =
    "Hello! I'm NEX, your personal AI assistant. Say Hey NEX anytime to begin.";
  private lastLanguage: SupportedLanguage = 'en';
  private speechRate = 1.0;
  private isSpeakingNow = false;
  private earconEnabled = false;
  private onSpeakingChangeCallback?: (speaking: boolean) => void;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        this.audioCtx = new Ctx();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  public setOnSpeakingChange(cb: (speaking: boolean) => void) {
    this.onSpeakingChangeCallback = (speaking: boolean) => {
      this.isSpeakingNow = speaking;
      cb(speaking);
    };
  }

  public isCurrentlySpeaking(): boolean {
    return this.isSpeakingNow;
  }

  public setEarconEnabled(enabled: boolean) {
    this.earconEnabled = enabled;
  }

  public setSpeechRate(rate: number) {
    this.speechRate = Math.max(0.5, Math.min(2.0, rate));
  }

  public getSpeechRate(): number {
    return this.speechRate;
  }

  public getLastSpokenText(): string {
    return this.lastSpokenText;
  }

  /**
   * Wake earcon is silent by default to prevent repetitive microphone beeps.
   */
  public playWakeEarcon() {
    if (!this.earconEnabled) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now);
      osc1.frequency.exponentialRampToValueAtTime(783.99, now + 0.12);

      gain1.gain.setValueAtTime(0.001, now);
      gain1.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.15);
    } catch {
      // Ignore
    }
  }

  /**
   * Plays a subtle spatial obstacle alert ping only when earcons are enabled or obstacle is critical.
   */
  public playSpatialObstaclePing(position: 'left' | 'ahead' | 'right', critical = false) {
    if (!this.earconEnabled && !critical) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(critical ? 740 : 580, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.1, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      if (panner) {
        panner.pan.setValueAtTime(position === 'left' ? -0.75 : position === 'right' ? 0.75 : 0, now);
        osc.connect(gain);
        gain.connect(panner);
        panner.connect(ctx.destination);
      } else {
        osc.connect(gain);
        gain.connect(ctx.destination);
      }

      osc.start(now);
      osc.stop(now + 0.19);
    } catch {
      // Ignore if AudioContext not yet unlocked
    }
  }

  /**
   * Plays an urgent SOS countdown beep.
   */
  public playSosCountdownBeep() {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(960, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.16);
    } catch {
      // Ignore
    }
  }

  /**
   * Plays a classic dual-tone phone ringback cadence (400Hz + 450Hz) when dialing a saved number.
   */
  public playCallRingTone() {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const playBurst = (startOffset: number, duration: number) => {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(400, now + startOffset);
        osc2.frequency.setValueAtTime(450, now + startOffset);

        gain.gain.setValueAtTime(0.001, now + startOffset);
        gain.gain.exponentialRampToValueAtTime(0.09, now + startOffset + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + startOffset + duration);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now + startOffset);
        osc2.start(now + startOffset);
        osc1.stop(now + startOffset + duration + 0.02);
        osc2.stop(now + startOffset + duration + 0.02);
      };

      playBurst(0, 0.35);
      playBurst(0.5, 0.35);
    } catch {
      // Ignore
    }
  }

  private speakingSafetyTimer: ReturnType<typeof setTimeout> | null = null;
  private speakQueueTimer: ReturnType<typeof setTimeout> | null = null;

  private clearSpeechTimers() {
    if (this.speakingSafetyTimer) {
      clearTimeout(this.speakingSafetyTimer);
      this.speakingSafetyTimer = null;
    }
    if (this.speakQueueTimer) {
      clearTimeout(this.speakQueueTimer);
      this.speakQueueTimer = null;
    }
  }

  /**
   * Converts text to natural speech via the Web Speech API with language-appropriate voice selection
   * and Chrome race-condition protection.
   */
  public speak(
    text: string,
    language: SupportedLanguage = this.lastLanguage,
    overrideRate?: number
  ) {
    if (!text) return;
    this.lastSpokenText = text;
    this.lastLanguage = language;

    this.clearSpeechTimers();
    this.onSpeakingChangeCallback?.(true);

    const estimatedMs = Math.min(8000, Math.max(1800, text.length * 55));
    this.speakingSafetyTimer = setTimeout(() => {
      this.onSpeakingChangeCallback?.(false);
    }, estimatedMs);

    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    try {
      window.speechSynthesis.cancel();
      this.speakQueueTimer = setTimeout(() => {
        try {
          const utterance = new SpeechSynthesisUtterance(text);
          const voices = window.speechSynthesis.getVoices();

          const localeMap: Record<SupportedLanguage, string> = {
            hi: 'hi-IN',
            hinglish: 'en-IN',
            en: 'en-IN',
            mr: 'mr-IN',
            ta: 'ta-IN',
            bn: 'bn-IN',
            gu: 'gu-IN',
            te: 'te-IN',
          };

          const targetLocale = localeMap[language] || 'hi-IN';
          const langPrefix = targetLocale.split('-')[0].toLowerCase();
          utterance.lang = targetLocale;

          const matchedVoice =
            voices.find((v) => v.lang.toLowerCase() === targetLocale.toLowerCase()) ||
            voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix)) ||
            voices.find((v) => v.lang.toLowerCase() === 'hi-in') ||
            voices.find((v) => v.lang.toLowerCase() === 'en-in') ||
            voices.find((v) => v.lang.toLowerCase().startsWith('en'));

          if (matchedVoice) {
            utterance.voice = matchedVoice;
          }

          utterance.rate = overrideRate ?? this.speechRate;
          utterance.pitch = 1.0;

          utterance.onstart = () => {
            this.onSpeakingChangeCallback?.(true);
          };
          utterance.onend = () => {
            this.clearSpeechTimers();
            this.onSpeakingChangeCallback?.(false);
          };
          utterance.onerror = () => {
            this.clearSpeechTimers();
            this.onSpeakingChangeCallback?.(false);
          };

          window.speechSynthesis.speak(utterance);
        } catch {
          this.onSpeakingChangeCallback?.(false);
        }
      }, 15);
    } catch {
      this.onSpeakingChangeCallback?.(false);
    }
  }

  public repeatLast() {
    this.speak(this.lastSpokenText, this.lastLanguage);
  }

  public stopSpeaking() {
    this.clearSpeechTimers();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
    this.onSpeakingChangeCallback?.(false);
  }
}

export const audioEngine = new AudioAccessibilityEngine();
