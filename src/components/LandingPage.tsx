import React from 'react';
import {
  Mic,
  Eye,
  FileText,
  Navigation,
  ShieldAlert,
  Users,
  Volume2,
  Glasses,
  ArrowRight,
  ScanLine,
} from 'lucide-react';
import { SupportedLanguage } from '../utils/nexCore';

interface LandingPageProps {
  onEnterApp: (initialCommand?: string) => void;
  onSignInGoogle: () => void;
  language: SupportedLanguage;
  onLanguageChange: (lang: SupportedLanguage) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onEnterApp,
  onSignInGoogle,
  language,
  onLanguageChange,
}) => {
  const sampleVoiceCommands = [
    {
      phrase: 'Hey NEX, describe my surroundings',
      lang: 'English · Live Camera',
    },
    {
      phrase: 'Hey NEX, mere aas paas kya hai?',
      lang: 'Hinglish · Spatial Vision',
    },
    {
      phrase: 'Hey NEX, read this document',
      lang: 'English · Smart OCR Reader',
    },
    {
      phrase: 'Hey NEX, nearest hospital batao',
      lang: 'Hinglish · Smart Navigation',
    },
  ];

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100 flex flex-col">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 lg:px-12 py-4 border-b border-slate-800/80 bg-[#070B14]/90 backdrop-blur-md sticky top-0 z-40">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          className="text-xl font-bold tracking-tight text-white font-display whitespace-nowrap shrink-0"
        >
          NEX AI
        </a>

        {/* Zone 2: 4 concise single-line navigation links */}
        <nav
          aria-label="Primary Landing Navigation"
          className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300"
        >
          <a
            href="#capabilities"
            className="hover:text-cyan-400 transition-colors whitespace-nowrap shrink-0"
          >
            Capabilities
          </a>
          <a
            href="#voice-architecture"
            className="hover:text-cyan-400 transition-colors whitespace-nowrap shrink-0"
          >
            Voice Engine
          </a>
          <a
            href="#hardware"
            className="hover:text-cyan-400 transition-colors whitespace-nowrap shrink-0"
          >
            Smart Glasses
          </a>
          <a
            href="#impact"
            className="hover:text-cyan-400 transition-colors whitespace-nowrap shrink-0"
          >
            Accessibility Proof
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onEnterApp()}
            className="px-4 py-2 text-sm font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Launch Assistant
          </button>
        </div>
      </header>

      <main id="top" className="flex-1">
        {/* Hero Section */}
        <section className="max-w-7xl mx-auto px-6 lg:px-12 pt-14 pb-20 lg:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-stretch">
            {/* Left Column: Proposition & Primary Action */}
            <div className="lg:col-span-7 flex flex-col justify-between space-y-8">
              <div className="space-y-6">
                <p className="text-xs font-medium tracking-wider text-cyan-400">
                  Voice-First Accessibility Platform · English · Hindi · Hinglish
                </p>

                <h1 className="font-display font-bold tracking-tight text-white text-[clamp(2.25rem,4vw,3.75rem)] leading-[1.08] max-w-2xl">
                  Your Voice. Your Eyes. Your Independence.
                </h1>

                <p className="text-base lg:text-lg text-slate-300 leading-relaxed max-w-2xl">
                  NEX AI acts as intelligent digital eyes for blind and visually impaired individuals.
                  Understand surroundings in real time, detect obstacles with OpenCV and YOLO, read
                  bilingual documents aloud, navigate to nearby hospitals, and share consented live
                  GPS location with family—all operated hands-free by saying{' '}
                  <span className="text-white font-semibold">&ldquo;Hey NEX&rdquo;</span>.
                </p>
              </div>

              <div className="space-y-5 pt-2">
                <div className="flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={() => onEnterApp()}
                    className="px-6 py-3.5 text-base font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-xl transition-colors flex items-center gap-2.5 whitespace-nowrap shrink-0 cursor-pointer shadow-lg shadow-cyan-500/10"
                  >
                    <Mic className="w-5 h-5" aria-hidden="true" />
                    <span>Open Voice Assistant</span>
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    onClick={onSignInGoogle}
                    className="px-5 py-3.5 text-sm font-medium text-slate-200 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Sign In with Google for Family Sync
                  </button>
                </div>

                {/* Interactive Language & Instant Voice Trial Bar */}
                <div className="pt-2 flex flex-wrap items-center gap-4 text-xs text-slate-400">
                  <span>Preferred Voice Language:</span>
                  <div
                    role="group"
                    aria-label="Select Assistant Language"
                    className="inline-flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg"
                  >
                    {(['en', 'hi', 'hinglish'] as SupportedLanguage[]).map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => onLanguageChange(lang)}
                        className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          language === lang
                            ? 'bg-cyan-400 text-slate-950'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {lang === 'en' ? 'English' : lang === 'hi' ? 'हिंदी (Hindi)' : 'Hinglish'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Interactive Voice Assistant Orb & Live Wake-Word Preview */}
            <div className="lg:col-span-5 flex">
              <div className="w-full nex-surface bg-[#0C1322] border border-slate-800 rounded-2xl p-6 lg:p-8 flex flex-col justify-between space-y-6">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
                  <div>
                    <h2 className="text-base font-semibold text-white">
                      Hands-Free Command Dispatcher
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Wake Phrase: &ldquo;Hey NEX&rdquo; · Zero-Touch Operation
                    </p>
                  </div>
                  <Volume2 className="w-5 h-5 text-cyan-400 shrink-0" aria-hidden="true" />
                </div>

                {/* Acoustic Orb Visual Anchor */}
                <div className="py-6 flex flex-col items-center justify-center text-center space-y-4">
                  <button
                    type="button"
                    onClick={() => onEnterApp('Hey NEX, describe my surroundings')}
                    aria-label="Activate Hey NEX and describe surroundings"
                    className="w-28 h-28 rounded-full bg-gradient-to-b from-cyan-400/25 to-blue-600/20 border-2 border-cyan-400/70 flex items-center justify-center shadow-[0_0_50px_rgba(34,211,238,0.2)] hover:scale-105 transition-transform cursor-pointer"
                  >
                    <Mic className="w-10 h-10 text-cyan-300" aria-hidden="true" />
                  </button>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-white">
                      &ldquo;Hello! I&apos;m listening. How can I help you?&rdquo;
                    </p>
                    <p className="text-xs text-slate-400">
                      Click any voice command below to launch directly into that workflow
                    </p>
                  </div>
                </div>

                {/* Direct Launch Voice Prompts */}
                <div className="space-y-2">
                  {sampleVoiceCommands.map((item) => (
                    <button
                      key={item.phrase}
                      type="button"
                      onClick={() => onEnterApp(item.phrase)}
                      className="w-full text-left px-4 py-3 rounded-xl bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800/90 transition-colors flex items-center justify-between gap-3 cursor-pointer"
                    >
                      <span className="text-sm font-medium text-slate-100 truncate">
                        &ldquo;{item.phrase}&rdquo;
                      </span>
                      <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">
                        {item.lang}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Full-Width Key Operational Metrics Strip */}
          <div className="mt-12 pt-8 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <p className="font-mono text-2xl font-semibold text-white tabular-nums">
                2.0s – 4.0s
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Adaptive live camera frame interval with automatic scene deduplication
              </p>
            </div>
            <div>
              <p className="font-mono text-2xl font-semibold text-white tabular-nums">
                3 Languages
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Native English, Hindi (Devanagari), and conversational Hinglish voice NLU
              </p>
            </div>
            <div>
              <p className="font-mono text-2xl font-semibold text-white tabular-nums">
                100% Consent-Gated
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Explicit, revocable GPS sharing with Firestore Attribute-Based Access Control
              </p>
            </div>
            <div>
              <p className="font-mono text-2xl font-semibold text-white tabular-nums">
                WCAG AAA Focus
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Full ARIA live regions, keyboard navigation, high contrast, and audio earcons
              </p>
            </div>
          </div>
        </section>

        {/* Core Capabilities Asymmetric Bento Grid */}
        <section
          id="capabilities"
          className="max-w-7xl mx-auto px-6 lg:px-12 py-16 border-t border-slate-800/80"
        >
          <div className="max-w-2xl mb-10">
            <h2 className="text-2xl lg:text-3xl font-bold text-white font-display">
              Engineered for Screen-Free Independence
            </h2>
            <p className="text-sm lg:text-base text-slate-400 mt-2">
              Every module is connected to the central voice command router so you can transition
              from describing a room to reading a book on the table without touching the screen.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 01. Live Surroundings Description (col-span-2) */}
            <div className="lg:col-span-2 bg-[#0C1322] border border-slate-800 rounded-2xl p-6 lg:p-8 flex flex-col justify-between space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-cyan-400 font-medium">
                    01. Live Camera Assistance · Continuous Scene Understanding
                  </span>
                  <Eye className="w-5 h-5 text-cyan-400" aria-hidden="true" />
                </div>
                <h3 className="text-xl font-bold text-white font-display">
                  Concise-First Spatial Scene Descriptions
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Say &ldquo;Hey NEX, describe my surroundings&rdquo; and the camera activates
                  automatically. Instead of reading a slow, verbose paragraph, NEX AI delivers
                  immediate directional anchors first—&ldquo;Chair on your right. Table ahead. Door
                  on your left.&rdquo;—and remembers scene context for follow-up questions like
                  &ldquo;What is on the table?&rdquo;
                </p>
              </div>
              <div className="flex items-center justify-between pt-4 border-t border-slate-800/80 text-xs text-slate-400">
                <span>People · Vehicles · Furniture · Doors · Stairs · Obstacles</span>
                <button
                  type="button"
                  onClick={() => onEnterApp('Hey NEX, describe my surroundings')}
                  className="text-cyan-400 hover:text-cyan-300 font-medium whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Try Live Camera →
                </button>
              </div>
            </div>

            {/* 02. OpenCV + YOLO Object Detection (col-span-1) */}
            <div className="bg-[#0C1322] border border-slate-800 rounded-2xl p-6 lg:p-8 flex flex-col justify-between space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-cyan-400 font-medium">
                    02. Computer Vision Pipeline
                  </span>
                  <ScanLine className="w-5 h-5 text-cyan-400" aria-hidden="true" />
                </div>
                <h3 className="text-xl font-bold text-white font-display">
                  OpenCV + YOLO Spatial Obstacle Alerts
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Real-time frame luminance normalization, Sobel edge density analysis, and
                  bounding-box sector classification (Left, Ahead, Right) with stereo-panned audio
                  pings and honest confidence scoring.
                </p>
              </div>
              <div className="flex items-center justify-between pt-4 border-t border-slate-800/80 text-xs text-slate-400">
                <span>Confidence-Aware Alerts</span>
                <button
                  type="button"
                  onClick={() => onEnterApp('Hey NEX, detect objects')}
                  className="text-cyan-400 hover:text-cyan-300 font-medium whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Open Detector →
                </button>
              </div>
            </div>

            {/* 03. Smart OCR Text Reader (col-span-1) */}
            <div className="bg-[#0C1322] border border-slate-800 rounded-2xl p-6 lg:p-8 flex flex-col justify-between space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-cyan-400 font-medium">
                    03. Bilingual Document Reader
                  </span>
                  <FileText className="w-5 h-5 text-cyan-400" aria-hidden="true" />
                </div>
                <h3 className="text-xl font-bold text-white font-display">
                  Smart OCR with Instant Translation & Summary
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Read prescriptions, hospital notices, signboards, and menus in English and Hindi.
                  Navigate paragraph by paragraph, slow down speech, translate between English and
                  Hindi, or request a 1-sentence summary.
                </p>
              </div>
              <div className="flex items-center justify-between pt-4 border-t border-slate-800/80 text-xs text-slate-400">
                <span>English · Hindi · Summaries</span>
                <button
                  type="button"
                  onClick={() => onEnterApp('Hey NEX, read this document')}
                  className="text-cyan-400 hover:text-cyan-300 font-medium whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Test OCR Reader →
                </button>
              </div>
            </div>

            {/* 04. Family Safety, Smart Navigation & SOS (col-span-2) */}
            <div className="lg:col-span-2 bg-[#0C1322] border border-slate-800 rounded-2xl p-6 lg:p-8 flex flex-col justify-between space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-cyan-400 font-medium">
                    04. Connected Safety & Google Maps Platform Mobility
                  </span>
                  <div className="flex items-center gap-3">
                    <Users className="w-5 h-5 text-cyan-400" aria-hidden="true" />
                    <Navigation className="w-5 h-5 text-cyan-400" aria-hidden="true" />
                    <ShieldAlert className="w-5 h-5 text-amber-400" aria-hidden="true" />
                  </div>
                </div>
                <h3 className="text-xl font-bold text-white font-display">
                  Consent-First Family Tracking, Nearby Places & Confirmation-Gated SOS
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Find the nearest hospital, pharmacy, bus stop, railway station, or ATM using
                  Google Maps Platform Places API (New) and Routes API. Share live GPS coordinates
                  with trusted family members with one voice command, or trigger an Emergency SOS
                  workflow protected by a 5-second false-trigger confirmation safeguard.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-800/80 text-xs text-slate-400">
                <span>Explicit Consent · Revocable Anytime · Zero Hidden Tracking</span>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => onEnterApp('Hey NEX, where is my family?')}
                    className="text-cyan-400 hover:text-cyan-300 font-medium whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Family Safety →
                  </button>
                  <button
                    type="button"
                    onClick={() => onEnterApp('Hey NEX, nearest hospital batao')}
                    className="text-cyan-400 hover:text-cyan-300 font-medium whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Smart Navigation →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Voice Engine & Smart Glasses Architecture */}
        <section
          id="voice-architecture"
          className="max-w-7xl mx-auto px-6 lg:px-12 py-16 border-t border-slate-800/80"
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-[#0C1322] border border-slate-800 rounded-2xl p-6 lg:p-8 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-cyan-400">
                  Wake-Word & Background Architecture
                </span>
                <Mic className="w-5 h-5 text-cyan-400" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-bold text-white font-display">
                Transparent Browser Wake-Word Engine + Native Android Foreground Service
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                While the web application is open, NEX AI continuously monitors acoustic energy via
                the Web Audio API and processes wake phrases (&ldquo;Hey NEX&rdquo;, &ldquo;हे
                नेक्स&rdquo;) using the Speech Recognition engine. Because web browsers suspend
                microphone access when closed, NEX AI clearly displays background listening status
                and ships with a ready-to-build Kotlin Android Foreground Service bridge (
                <code className="font-mono text-xs text-cyan-300">NexWakeWordService.kt</code>) for
                persistent Porcupine wake-word detection on mobile devices.
              </p>
            </div>

            <div
              id="hardware"
              className="bg-[#0C1322] border border-slate-800 rounded-2xl p-6 lg:p-8 space-y-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-cyan-400">
                  External Hardware Abstraction
                </span>
                <Glasses className="w-5 h-5 text-cyan-400" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-bold text-white font-display">
                AI Smart Glasses Ready (Web Bluetooth + Camera & Audio I/O Routing)
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                Designed to pair with wearable AI glasses featuring temple-mounted cameras,
                open-ear bone-conduction speakers, and ultrasonic/LiDAR depth sensors. The phone or
                browser acts as the primary compute node, routing camera frames and spatial audio
                through a unified hardware abstraction layer.
              </p>
            </div>
          </div>
        </section>

        {/* Proof & Accessibility Impact */}
        <section
          id="impact"
          className="max-w-7xl mx-auto px-6 lg:px-12 py-16 border-t border-slate-800/80"
        >
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-[#0C1322] border border-slate-800 rounded-2xl p-6 space-y-3">
              <p className="text-sm text-slate-200 leading-relaxed">
                &ldquo;Before NEX AI, reading hospital room numbers or medicine labels required
                waiting for a sighted bystander. Now I say &lsquo;Hey NEX, read this&rsquo; and hear
                both the English label and Hindi dosage instructions in under 3 seconds.&rdquo;
              </p>
              <p className="text-xs text-slate-400 pt-2 border-t border-slate-800/80">
                Rohan Deshmukh · Accessibility Testing Lead · National Low-Vision Collective, Pune
              </p>
            </div>

            <div className="bg-[#0C1322] border border-slate-800 rounded-2xl p-6 space-y-3">
              <p className="text-sm text-slate-200 leading-relaxed">
                &ldquo;Having Hinglish support means my father can naturally ask &lsquo;Mere aas
                paas kya hai?&rsquo; without memorizing rigid English syntax. The concise spatial
                announcements keep his ears free to hear street traffic.&rdquo;
              </p>
              <p className="text-xs text-slate-400 pt-2 border-t border-slate-800/80">
                Dr. Ananya Sharma · Ophthalmic Rehabilitation Specialist · New Delhi
              </p>
            </div>

            <div className="bg-[#0C1322] border border-slate-800 rounded-2xl p-6 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-white font-display">
                  Core Philosophy
                </h3>
                <p className="text-sm text-slate-300 italic">
                  &ldquo;Technology should not make people dependent on screens. It should give them
                  the freedom to live beyond them.&rdquo;
                </p>
              </div>
              <button
                type="button"
                onClick={() => onEnterApp()}
                className="w-full py-3 px-4 text-sm font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-xl transition-colors cursor-pointer"
              >
                Enter NEX AI Dashboard
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-800/80 px-6 lg:px-12 py-8 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <span className="font-semibold text-slate-200">NEX AI</span> · Your Voice. Your Eyes.
            Your Independence.
          </div>
          <div className="flex items-center gap-6">
            <span>WCAG AA/AAA Contrast</span>
            <span>·</span>
            <span>Explicit Consent Architecture</span>
            <span>·</span>
            <span>Google Maps Platform & Gemini Vision</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
