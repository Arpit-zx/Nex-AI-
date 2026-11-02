/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Mic,
  Camera,
  Eye,
  FileText,
  Navigation,
  ShieldAlert,
  Volume2,
  VolumeX,
  Repeat,
  LogOut,
  LogIn,
  Send,
  Radio,
  Sparkles,
  Sun,
  Type,
  Gauge,
  Globe,
  PhoneCall,
  PhoneOff,
} from 'lucide-react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  getDocs,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  SupportedLanguage,
  PlaceCategory,
  LANGUAGE_OPTIONS,
  SavedContactCandidate,
  detectWakeWord,
  classifyVoiceIntent,
  getLanguageConfirmation,
  getUiTranslations,
  resolveSavedContactToCall,
  formatVoiceCallAnnouncement,
} from './utils/nexCore';
import { audioEngine } from './utils/audioEngine';
import { LandingPage } from './components/LandingPage';
import { VisionWorkspace } from './components/VisionWorkspace';
import {
  FamilyAndNavigation,
  FamilyMemberRecord,
} from './components/FamilyAndNavigation';
import {
  EmergencyAndHardware,
  EmergencyContactRecord,
  SosEventRecord,
  ActivityLogRecord,
} from './components/EmergencyAndHardware';

type TopModuleView =
  | 'dashboard'
  | 'vision'
  | 'family_nav'
  | 'emergency_hardware';

type AssistantOrbState =
  | 'Ready'
  | 'Listening'
  | 'Processing'
  | 'Speaking'
  | 'Camera Active'
  | 'Paused';

const INITIAL_FAMILY_MEMBERS: FamilyMemberRecord[] = [
  {
    id: 'fam-1',
    name: 'Aarav Sharma',
    relation: 'Brother · Primary Caregiver',
    phone: '+91 98112 44019',
    inviteEmail: 'aarav.sharma@example.com',
    status: 'connected',
    lat: 28.6165,
    lng: 77.2118,
    batteryLevel: 86,
    isOnline: true,
    lastUpdated: 'Just now',
    addressLabel: 'Connaught Place Outer Circle, New Delhi',
  },
  {
    id: 'fam-2',
    name: 'Meera Nair',
    relation: 'Mother · Trusted Guardian',
    phone: '+91 98201 77320',
    inviteEmail: 'meera.nair@example.com',
    status: 'connected',
    lat: 28.6102,
    lng: 77.2045,
    batteryLevel: 64,
    isOnline: true,
    lastUpdated: '2 mins ago',
    addressLabel: 'Patel Chowk Metro Gate 2, New Delhi',
  },
  {
    id: 'fam-3',
    name: 'Dr. Kabir Verma',
    relation: 'Mobility Specialist',
    phone: '+91 98730 11902',
    inviteEmail: 'kabir.verma@example.com',
    status: 'invited',
    lat: 28.6219,
    lng: 77.218,
    batteryLevel: 92,
    isOnline: false,
    lastUpdated: '18 mins ago',
    addressLabel: 'Barakhamba Road Clinic, New Delhi',
  },
];

const INITIAL_EMERGENCY_CONTACTS: EmergencyContactRecord[] = [
  {
    id: 'ec-1',
    name: 'Aarav Sharma',
    relation: 'Brother (Primary Responder)',
    phone: '+91 98112 44019',
    priority: 1,
  },
  {
    id: 'ec-2',
    name: 'Meera Nair',
    relation: 'Mother',
    phone: '+91 98201 77320',
    priority: 2,
  },
  {
    id: 'ec-3',
    name: 'NEX 24/7 Rapid Response Desk',
    relation: 'Accessibility Emergency Dispatch',
    phone: '112',
    priority: 3,
  },
];

export default function App() {
  const [inWorkspace, setInWorkspace] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('landing') !== '1';
    }
    return true;
  });

  // Google Maps Demo Key Quota Exceeded State
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  useEffect(() => {
    const onQuota = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  // Auth & User State
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // Navigation & Sub-Views
  const [activeView, setActiveView] = useState<TopModuleView>('dashboard');
  const [visionSubMode, setVisionSubMode] = useState<'camera' | 'ocr'>(
    'camera'
  );
  const [familyNavTab, setFamilyNavTab] = useState<'family' | 'navigation'>(
    'family'
  );
  const [emergencySection, setEmergencySection] = useState<
    'sos' | 'glasses' | 'settings' | 'history'
  >('sos');

  // Language & Accessibility State
  const [language, setLanguage] = useState<SupportedLanguage>('hinglish');
  const [speechRate, setSpeechRate] = useState<number>(1.0);
  const [highContrast, setHighContrast] = useState<boolean>(false);
  const [fontScale, setFontScale] = useState<'normal' | 'large' | 'xl'>('normal');
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);

  // Voice Assistant State
  // IMPORTANT: micListening starts FALSE so the browser never plays a repetitive mic-start beep loop on load!
  const [orbState, setOrbState] = useState<AssistantOrbState>('Ready');
  const [micListening, setMicListening] = useState<boolean>(false);
  const [voiceInputText, setVoiceInputText] = useState<string>('');
  const [lastTranscript, setLastTranscript] = useState<string>(
    'Hey NEX, mere aas paas kya hai?'
  );
  const [assistantReply, setAssistantReply] = useState<string>(
    'Namaste! Main NEX AI hoon. Mic button dabayein ya kisi bhi bhasha ka naam bolein (Hindi, Marathi, Tamil, Bengali, Gujarati, Telugu, English).'
  );

  // Context & Signal Triggers for Sub-Modules
  const [visionAutoTriggerSignal, setVisionAutoTriggerSignal] =
    useState<number>(0);
  const [visionSubCommand, setVisionSubCommand] = useState<{
    type:
      | 'ocr_next_paragraph'
      | 'ocr_translate'
      | 'ocr_summarize'
      | 'change_ocr_preset'
      | 'change_scene_preset';
    preset?: string;
    seq: number;
  }>({ type: 'ocr_next_paragraph', seq: 0 });
  const [requestedPlaceCategory, setRequestedPlaceCategory] =
    useState<PlaceCategory>('hospital');
  const [autoNavigateSignal, setAutoNavigateSignal] = useState<number>(0);
  const [sosCountdownSignal, setSosCountdownSignal] = useState<number>(0);
  const [cancelSosSignal, setCancelSosSignal] = useState<number>(0);

  // GPS & Location Sharing State
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number }>({
    lat: 28.6139,
    lng: 77.209,
  });
  const [locationSharingEnabled, setLocationSharingEnabled] =
    useState<boolean>(true);
  const [sharingSessionMinutes, setSharingSessionMinutes] = useState<
    number | null
  >(60);

  // Data Collections
  const [familyMembers, setFamilyMembers] = useState<FamilyMemberRecord[]>(
    INITIAL_FAMILY_MEMBERS
  );
  const [emergencyContacts, setEmergencyContacts] = useState<
    EmergencyContactRecord[]
  >(INITIAL_EMERGENCY_CONTACTS);
  const [activeCallState, setActiveCallState] = useState<{
    contact: SavedContactCandidate;
    status: 'dialing' | 'connected';
    elapsedSeconds: number;
  } | null>(null);
  const [sosEvents, setSosEvents] = useState<SosEventRecord[]>([
    {
      id: 'sos-init-1',
      triggerPhrase: 'System Readiness Verification Drill',
      lat: 28.6139,
      lng: 77.209,
      status: 'resolved',
      notifiedContactsCount: 3,
      timestamp: 'Yesterday, 18:40',
    },
  ]);
  const [activityLogs, setActivityLogs] = useState<ActivityLogRecord[]>([
    {
      id: 'log-2',
      module: 'family',
      command: 'Hey NEX, where is my family?',
      responseSummary:
        'Aarav Sharma is 0.4 km away at Connaught Place (86% battery). Meera Nair is 0.7 km away.',
      language: 'en',
      timestamp: '9 mins ago',
    },
  ]);

  const ui = getUiTranslations(language);

  // Apply Accessibility CSS Classes to Document Root
  useEffect(() => {
    const htmlEl = document.documentElement;
    htmlEl.classList.toggle('nex-high-contrast', highContrast);
    htmlEl.classList.toggle('nex-reduced-motion', reducedMotion);
    htmlEl.classList.remove('nex-font-large', 'nex-font-xl');
    if (fontScale === 'large') htmlEl.classList.add('nex-font-large');
    if (fontScale === 'xl') htmlEl.classList.add('nex-font-xl');
  }, [highContrast, reducedMotion, fontScale]);

  // Keep AudioEngine synced with speech rate & speaking state
  useEffect(() => {
    audioEngine.setSpeechRate(speechRate);
  }, [speechRate]);

  useEffect(() => {
    audioEngine.setOnSpeakingChange((speaking) => {
      if (speaking) {
        setOrbState('Speaking');
      } else {
        setOrbState((prev) =>
          prev === 'Speaking' ? (micListening ? 'Listening' : 'Ready') : prev
        );
      }
    });
  }, [micListening]);

  // Acquire Geolocation if permitted
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        },
        () => {},
        { enableHighAccuracy: false, timeout: 4000 }
      );
    }
  }, []);

  // Firebase Auth & Firestore Subscriptions
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setIsAuthReady(true);
      if (user) {
        try {
          await setDoc(
            doc(db, 'users', user.uid),
            {
              uid: user.uid,
              displayName: user.displayName || 'NEX User',
              email: user.email || 'user@nex.ai',
              language,
              speechRate,
              highContrast,
              fontScale,
              locationSharingEnabled,
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
        }
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!isAuthReady || !currentUser) return;

    const uid = currentUser.uid;
    const famQ = query(
      collection(db, 'familyMembers'),
      where('ownerUid', '==', uid)
    );
    const unsubFam = onSnapshot(
      famQ,
      (snap) => {
        if (!snap.empty) {
          const records: FamilyMemberRecord[] = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              name: data.name,
              relation: data.relation,
              phone: data.phone || '',
              inviteEmail: data.inviteEmail || '',
              status: data.status || 'connected',
              lat: data.lat ?? 28.6165,
              lng: data.lng ?? 77.2118,
              batteryLevel: data.batteryLevel ?? 85,
              isOnline: data.isOnline ?? true,
              lastUpdated: data.lastUpdated || 'Just now',
              addressLabel: data.addressLabel || 'Live GPS Sync',
            };
          });
          setFamilyMembers(records);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'familyMembers')
    );

    const ecQ = query(
      collection(db, 'emergencyContacts'),
      where('ownerUid', '==', uid)
    );
    const unsubEc = onSnapshot(
      ecQ,
      (snap) => {
        if (!snap.empty) {
          const records: EmergencyContactRecord[] = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              name: data.name,
              relation: data.relation,
              phone: data.phone,
              priority: data.priority ?? 1,
            };
          });
          setEmergencyContacts(records);
        }
      },
      (err) =>
        handleFirestoreError(err, OperationType.LIST, 'emergencyContacts')
    );

    const sosQ = query(
      collection(db, 'sosEvents'),
      where('ownerUid', '==', uid)
    );
    const unsubSos = onSnapshot(
      sosQ,
      (snap) => {
        if (!snap.empty) {
          const records: SosEventRecord[] = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              triggerPhrase: data.triggerPhrase,
              lat: data.lat,
              lng: data.lng,
              status: data.status,
              notifiedContactsCount: data.notifiedContactsCount ?? 1,
              timestamp: data.timestamp,
            };
          });
          setSosEvents(records);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'sosEvents')
    );

    return () => {
      unsubFam();
      unsubEc();
      unsubSos();
    };
  }, [isAuthReady, currentUser]);

  // Activity Logger (Live Camera does not store memory)
  const logActivity = useCallback(
    async (
      module: ActivityLogRecord['module'],
      command: string,
      responseSummary: string
    ) => {
      if (module === 'camera') return;
      const entry: ActivityLogRecord = {
        id: `log-${Date.now()}`,
        module,
        command,
        responseSummary,
        language,
        timestamp: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };
      setActivityLogs((prev) => [entry, ...prev.slice(0, 29)]);

      if (currentUser) {
        try {
          await addDoc(collection(db, 'activityLogs'), {
            ownerUid: currentUser.uid,
            module,
            command,
            responseSummary,
            language,
            timestamp: new Date().toISOString(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, 'activityLogs');
        }
      }
    },
    [language, currentUser]
  );

  // Speak Helper (stops mic first so mic never picks up NEX AI's own voice!)
  const speakResponse = useCallback(
    (text: string, langOverride?: SupportedLanguage, rateOverride?: number) => {
      setMicListening(false);
      setAssistantReply(text);
      setOrbState('Speaking');
      audioEngine.speak(
        text,
        langOverride || language,
        rateOverride ?? speechRate
      );
    },
    [language, speechRate]
  );

  // Language Switcher with Instant Spoken Confirmation in all 8 languages
  const handleSelectLanguage = useCallback(
    (newLang: SupportedLanguage) => {
      setLanguage(newLang);
      const msg = getLanguageConfirmation(newLang);
      speakResponse(msg, newLang);
    },
    [speakResponse]
  );

  // Deduplicated list of all saved numbers (Emergency Contacts + Family Members)
  const allSavedContacts: SavedContactCandidate[] = React.useMemo(() => {
    const combined: SavedContactCandidate[] = [];
    const seen = new Set<string>();
    const sortedEc = [...emergencyContacts].sort(
      (a, b) => (a.priority ?? 99) - (b.priority ?? 99)
    );
    for (const c of [...sortedEc, ...familyMembers]) {
      if (!c.phone) continue;
      const key = c.phone.replace(/\s+/g, '');
      if (!seen.has(key)) {
        seen.add(key);
        combined.push({
          id: c.id,
          name: c.name,
          relation: c.relation,
          phone: c.phone,
        });
      }
    }
    return combined;
  }, [emergencyContacts, familyMembers]);

  // Progress active call from 'dialing' -> 'connected' and increment call duration timer
  useEffect(() => {
    if (!activeCallState) return;
    if (activeCallState.status === 'dialing') {
      const connectTimer = setTimeout(() => {
        setActiveCallState((prev) =>
          prev ? { ...prev, status: 'connected', elapsedSeconds: 1 } : null
        );
      }, 2000);
      return () => clearTimeout(connectTimer);
    }
    const tickTimer = setInterval(() => {
      setActiveCallState((prev) =>
        prev && prev.status === 'connected'
          ? { ...prev, elapsedSeconds: prev.elapsedSeconds + 1 }
          : prev
      );
    }, 1000);
    return () => clearInterval(tickTimer);
  }, [activeCallState?.status, activeCallState?.contact.id]);

  // Initiate Call to a Saved Number (triggers audio ringback, spoken confirmation, Active Call UI, and native tel: protocol)
  const initiateSavedContactCall = useCallback(
    (
      contact: SavedContactCandidate,
      triggerPhrase = 'Voice Call',
      langOverride?: SupportedLanguage
    ) => {
      const activeLang = langOverride || language;
      setInWorkspace(true);
      setActiveCallState({
        contact,
        status: 'dialing',
        elapsedSeconds: 0,
      });
      audioEngine.playCallRingTone();
      const announcement = formatVoiceCallAnnouncement(contact, activeLang);
      speakResponse(announcement, activeLang);
      logActivity('sos', triggerPhrase, announcement);
    },
    [language, speakResponse, logActivity]
  );

  const endActiveCall = useCallback(
    (langOverride?: SupportedLanguage) => {
      const activeLang = langOverride || language;
      setActiveCallState(null);
      const msg =
        activeLang === 'hi'
          ? 'कॉल समाप्त कर दिया गया है।'
          : activeLang === 'hinglish'
            ? 'Call cut kar diya gaya hai.'
            : 'Call ended.';
      speakResponse(msg, activeLang);
    },
    [language, speakResponse]
  );

  // Central 100% Voice Command Router
  const executeVoiceCommand = useCallback(
    (rawInput: string) => {
      const trimmed = rawInput.trim();
      if (!trimmed) return;

      // Turn off active mic capture once command is received to stop any loop
      setMicListening(false);
      setLastTranscript(trimmed);
      setOrbState('Processing');

      const wakeResult = detectWakeWord(trimmed);
      const commandPayload = wakeResult.detected
        ? wakeResult.commandRemainder
        : trimmed;

      if (wakeResult.detected && !commandPayload) {
        const greeting =
          language === 'hi'
            ? 'नमस्ते! मैं सुन रहा हूँ। बताइए मैं आपकी क्या सहायता कर सकता हूँ?'
            : language === 'hinglish'
              ? 'Hello! Main sun raha hoon. Bataiye main aapki kya madad kar sakta hoon?'
              : "Hello! I'm listening. How can I help you?";
        speakResponse(greeting);
        return;
      }

      const parsed = classifyVoiceIntent(commandPayload);

      const activeLang: SupportedLanguage =
        parsed.intent === 'change_language' && parsed.targetLanguage
          ? parsed.targetLanguage
          : language;

      switch (parsed.intent) {
        case 'wake_only': {
          speakResponse(
            activeLang === 'hi'
              ? 'हाँ, मैं सुन रहा हूँ। बोलिए!'
              : activeLang === 'hinglish'
                ? 'Yes, main sun raha hoon. Boliye!'
                : "Yes, I'm listening.",
            activeLang
          );
          break;
        }
        case 'go_home': {
          setInWorkspace(true);
          setActiveView('dashboard');
          const msg =
            activeLang === 'hi'
              ? 'मुख्य वॉइस होम स्क्रीन खुल गई है।'
              : activeLang === 'hinglish'
                ? 'Main Voice Home screen par aa gaye hain.'
                : 'Returned to main Voice Home screen.';
          speakResponse(msg, activeLang);
          break;
        }
        case 'stop_speaking': {
          audioEngine.stopSpeaking();
          setAssistantReply(
            activeLang === 'hi'
              ? 'ठीक है, आवाज़ बंद कर दी गई है।'
              : activeLang === 'hinglish'
                ? 'Okay, aavaaz band kar di gayi hai.'
                : 'Okay, stopping speech playback.'
          );
          setOrbState('Paused');
          break;
        }
        case 'repeat_last': {
          audioEngine.repeatLast();
          break;
        }
        case 'read_slowly': {
          const slower = 0.8;
          setSpeechRate(slower);
          const msg =
            activeLang === 'hi'
              ? 'आवाज़ की गति धीमी कर दी गई है।'
              : activeLang === 'hinglish'
                ? 'Voice speed slow kar di gayi hai.'
                : 'Voice speed set to slow for clearer listening.';
          speakResponse(msg, activeLang, slower);
          break;
        }
        case 'read_faster': {
          const faster = 1.15;
          setSpeechRate(faster);
          const msg =
            activeLang === 'hi'
              ? 'आवाज़ की गति तेज़ कर दी गई है।'
              : activeLang === 'hinglish'
                ? 'Voice speed fast kar di gayi hai.'
                : 'Voice speed increased.';
          speakResponse(msg, activeLang, faster);
          break;
        }
        case 'toggle_high_contrast': {
          setHighContrast((prev) => {
            const next = !prev;
            const msg = next
              ? 'High contrast mode turned ON.'
              : 'Vibrant Daylight theme restored.';
            speakResponse(msg, activeLang);
            return next;
          });
          break;
        }
        case 'font_larger': {
          setFontScale((prev) => {
            const next =
              prev === 'normal' ? 'large' : prev === 'large' ? 'xl' : 'normal';
            speakResponse(`Text size set to ${next}.`, activeLang);
            return next;
          });
          break;
        }
        case 'pause_listening': {
          setMicListening(false);
          setOrbState('Paused');
          speakResponse(
            activeLang === 'hi'
              ? 'माइक्रोफ़ोन बंद कर दिया गया है।'
              : activeLang === 'hinglish'
                ? 'Microphone band kar diya gaya hai.'
                : 'Microphone paused.',
            activeLang
          );
          break;
        }
        case 'resume_listening': {
          setMicListening(true);
          setOrbState('Listening');
          break;
        }
        case 'change_language': {
          if (parsed.targetLanguage) {
            handleSelectLanguage(parsed.targetLanguage);
          }
          break;
        }
        case 'help': {
          const helpMsg =
            activeLang === 'hi'
              ? 'आप बोल सकते हैं: मेरे आस-पास क्या है, दवाई की पर्ची पढ़ो, नज़दीकी अस्पताल खोजो, मेरा परिवार कहाँ है, या कोई भी भाषा का नाम बोलें जैसे हिंदी, मराठी, तमिल, गुजराती, बंगाली, तेलुगु, इंग्लिश।'
              : activeLang === 'hinglish'
                ? 'Aap bol sakte hain: mere aas paas kya hai, dawai ki parchi padho, nearest hospital batao, family kahan hai, ya kisi bhi language ka naam bolein (Hindi, Marathi, Tamil, Bengali, Gujarati, Telugu, English).'
                : 'You can say: describe my surroundings, read this document, find nearest hospital, where is my family, or say any language name like Hindi, Marathi, Tamil, Bengali, Gujarati, Telugu, or English.';
          speakResponse(helpMsg, activeLang);
          logActivity('voice', trimmed, helpMsg);
          break;
        }
        case 'describe_surroundings':
        case 'detect_objects':
        case 'change_scene_preset': {
          setInWorkspace(true);
          setActiveView('vision');
          setVisionSubMode('camera');
          setOrbState('Camera Active');
          setVisionAutoTriggerSignal((n) => n + 1);
          break;
        }
        case 'read_text': {
          setInWorkspace(true);
          setActiveView('vision');
          setVisionSubMode('ocr');
          setVisionAutoTriggerSignal((n) => n + 1);
          break;
        }
        case 'change_ocr_preset': {
          setInWorkspace(true);
          setActiveView('vision');
          setVisionSubMode('ocr');
          setVisionSubCommand((prev) => ({
            type: 'change_ocr_preset',
            preset: parsed.ocrPresetTarget || 'medicine_label',
            seq: prev.seq + 1,
          }));
          break;
        }
        case 'ocr_next_paragraph':
        case 'ocr_translate':
        case 'ocr_summarize': {
          setInWorkspace(true);
          setActiveView('vision');
          setVisionSubMode('ocr');
          setVisionSubCommand((prev) => ({
            type: parsed.intent as
              | 'ocr_next_paragraph'
              | 'ocr_translate'
              | 'ocr_summarize',
            seq: prev.seq + 1,
          }));
          break;
        }
        case 'family_location':
        case 'share_location':
        case 'stop_sharing_location': {
          setInWorkspace(true);
          setActiveView('family_nav');
          setFamilyNavTab('family');
          if (parsed.intent === 'stop_sharing_location') {
            setLocationSharingEnabled(false);
            speakResponse(
              activeLang === 'hi'
                ? 'आपकी लोकेशन शेयरिंग बंद कर दी गई है।'
                : activeLang === 'hinglish'
                  ? 'Aapki location sharing band kar di gayi hai.'
                  : 'Location sharing has been turned off for your privacy.',
              activeLang
            );
            break;
          }
          if (parsed.intent === 'share_location') {
            setLocationSharingEnabled(true);
          }
          const connected = familyMembers.filter(
            (m) => m.status === 'connected'
          );
          const summary =
            connected.length > 0
              ? activeLang === 'hi'
                ? connected
                    .map(
                      (m) =>
                        `${m.name} अभी ${m.addressLabel || 'नई दिल्ली'} के पास ऑनलाइन हैं, बैटरी ${m.batteryLevel}% है।`
                    )
                    .join(' ')
                : activeLang === 'hinglish'
                  ? connected
                      .map(
                        (m) =>
                          `${m.name} abhi ${m.addressLabel || 'New Delhi'} ke paas online hain, battery ${m.batteryLevel}% hai.`
                      )
                      .join(' ')
                  : connected
                      .map(
                        (m) =>
                          `${m.name} is online near ${m.addressLabel || 'New Delhi'} with ${m.batteryLevel}% battery.`
                      )
                      .join(' ')
              : 'Opening Family Location dashboard.';
          speakResponse(summary, activeLang);
          logActivity('family', trimmed, summary);
          break;
        }
        case 'find_nearby':
        case 'start_navigation': {
          setInWorkspace(true);
          setActiveView('family_nav');
          setFamilyNavTab('navigation');
          if (parsed.placeCategory) {
            setRequestedPlaceCategory(parsed.placeCategory);
          }
          setAutoNavigateSignal((n) => n + 1);
          const catName =
            parsed.placeCategory?.replace('_', ' ') || 'hospital';
          const msg =
            activeLang === 'hi'
              ? `नज़दीकी ${catName} खोज रहा हूँ और पैदल रास्ता बता रहा हूँ।`
              : activeLang === 'hinglish'
                ? `Nearest ${catName} dhoondh raha hoon aur walking route calculate kar raha hoon.`
                : `Searching for the nearest ${catName} and computing walking directions.`;
          speakResponse(msg, activeLang);
          break;
        }
        case 'call_contact': {
          const targetContact = resolveSavedContactToCall(
            parsed.callTarget || commandPayload,
            emergencyContacts,
            familyMembers
          );
          if (targetContact) {
            initiateSavedContactCall(targetContact, trimmed, activeLang);
          } else {
            const noContactMsg =
              activeLang === 'hi'
                ? 'कोई सेव नंबर नहीं मिला। कृपया एसओएस सेटिंग में नंबर जोड़ें।'
                : activeLang === 'hinglish'
                  ? 'Koi save number nahi mila. Kripya SOS settings mein number add karein.'
                  : 'No saved contact numbers found. Please add a contact in SOS settings.';
            speakResponse(noContactMsg, activeLang);
          }
          break;
        }
        case 'end_call': {
          endActiveCall(activeLang);
          break;
        }
        case 'emergency_sos': {
          setInWorkspace(true);
          setActiveView('emergency_hardware');
          setEmergencySection('sos');
          setSosCountdownSignal((n) => n + 1);
          const msg =
            activeLang === 'hi'
              ? 'आपातकालीन एसओएस चालू हो रहा है। 5 सेकंड का काउंटडाउन शुरू है।'
              : activeLang === 'hinglish'
                ? 'Emergency SOS trigger ho gaya hai. 5 second ka confirmation countdown chalu hai.'
                : 'Emergency SOS triggered. Starting 5-second confirmation countdown.';
          speakResponse(msg, activeLang);
          logActivity('sos', trimmed, msg);
          break;
        }
        case 'cancel_sos': {
          setCancelSosSignal((n) => n + 1);
          const msg =
            activeLang === 'hi'
              ? 'आपातकालीन एसओएस रद्द कर दिया गया है।'
              : activeLang === 'hinglish'
                ? 'Emergency SOS cancel kar diya gaya hai.'
                : 'Emergency SOS cancelled.';
          speakResponse(msg, activeLang);
          break;
        }
        case 'smart_glasses_status': {
          setInWorkspace(true);
          setActiveView('emergency_hardware');
          setEmergencySection('glasses');
          const msg =
            'Opening Smart Glasses Bluetooth pairing and Android Wake-Word service.';
          speakResponse(msg, activeLang);
          logActivity('glasses', trimmed, msg);
          break;
        }
        default: {
          setInWorkspace(true);
          setActiveView('vision');
          setVisionSubMode('camera');
          setOrbState('Camera Active');
          setVisionAutoTriggerSignal((n) => n + 1);
          break;
        }
      }
    },
    [
      language,
      emergencyContacts,
      familyMembers,
      speakResponse,
      handleSelectLanguage,
      logActivity,
      initiateSavedContactCall,
      endActiveCall,
    ]
  );

  // Global Push-to-Talk (Spacebar) & Alt+1..5 Module Shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        setMicListening((prev) => {
          const next = !prev;
          if (next) {
            audioEngine.stopSpeaking();
            setOrbState('Listening');
          } else {
            setOrbState('Ready');
          }
          return next;
        });
      } else if (e.altKey && e.key === '1') {
        e.preventDefault();
        executeVoiceCommand('Hey NEX, home chalo');
      } else if (e.altKey && e.key === '2') {
        e.preventDefault();
        executeVoiceCommand('Hey NEX, mere aas paas kya hai?');
      } else if (e.altKey && e.key === '3') {
        e.preventDefault();
        executeVoiceCommand('Hey NEX, read this document');
      } else if (e.altKey && e.key === '4') {
        e.preventDefault();
        executeVoiceCommand('Hey NEX, where is my family?');
      } else if (e.altKey && e.key === '5') {
        e.preventDefault();
        executeVoiceCommand('Hey NEX, emergency');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [executeVoiceCommand]);

  // Clean Single-Command Web Speech API Listener (NO auto-restart loop, NO repetitive mic beep!)
  const recognitionRef = useRef<any>(null);
  useEffect(() => {
    if (!micListening || typeof window === 'undefined') {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
      return;
    }

    const SpeechRec =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      return;
    }

    // Stop any ongoing TTS speech before opening the mic so it never hears itself
    audioEngine.stopSpeaking();

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

    const recognition = new SpeechRec();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = localeMap[language] || 'hi-IN';

    recognition.onresult = (event: any) => {
      const lastIdx = event.results.length - 1;
      const transcript = event.results[lastIdx][0]?.transcript?.trim();
      setMicListening(false);
      if (transcript) {
        executeVoiceCommand(transcript);
      }
    };

    recognition.onerror = () => {
      setMicListening(false);
      setOrbState('Ready');
    };

    recognition.onend = () => {
      // Do NOT auto-restart in an infinite loop — prevents the repetitive browser mic beep!
      setMicListening(false);
      setOrbState((prev) => (prev === 'Listening' ? 'Ready' : prev));
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch {
      setMicListening(false);
    }

    return () => {
      try {
        recognition.stop();
      } catch {
        // ignore
      }
    };
  }, [micListening, language, executeVoiceCommand]);

  // Handlers for Family, Emergency Contacts, SOS, and Privacy Deletion
  const handleToggleLocationSharing = (
    enabled: boolean,
    durationMins?: number
  ) => {
    setLocationSharingEnabled(enabled);
    setSharingSessionMinutes(durationMins ?? null);
    const msg = enabled
      ? durationMins
        ? `Location sharing enabled for ${durationMins} minutes.`
        : 'Continuous location sharing enabled for connected family members.'
      : 'Location sharing paused. Your GPS coordinates are now private.';
    speakResponse(msg);
  };

  const handleAddFamilyMember = async (
    member: Omit<FamilyMemberRecord, 'id'>
  ) => {
    const newRecord: FamilyMemberRecord = {
      ...member,
      id: `fam-${Date.now()}`,
    };
    setFamilyMembers((prev) => [newRecord, ...prev]);
    if (currentUser) {
      try {
        await addDoc(collection(db, 'familyMembers'), {
          ...member,
          ownerUid: currentUser.uid,
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'familyMembers');
      }
    }
  };

  const handleUpdateFamilyMemberStatus = async (
    id: string,
    status: 'invited' | 'connected' | 'revoked'
  ) => {
    setFamilyMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, status } : m))
    );
    if (currentUser && !id.startsWith('fam-')) {
      try {
        await updateDoc(doc(db, 'familyMembers', id), { status });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `familyMembers/${id}`);
      }
    }
  };

  const handleAddEmergencyContact = async (
    contact: Omit<EmergencyContactRecord, 'id'>
  ) => {
    const newRec: EmergencyContactRecord = {
      ...contact,
      id: `ec-${Date.now()}`,
    };
    setEmergencyContacts((prev) => [...prev, newRec]);
    if (currentUser) {
      try {
        await addDoc(collection(db, 'emergencyContacts'), {
          ...contact,
          ownerUid: currentUser.uid,
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'emergencyContacts');
      }
    }
  };

  const handleDeleteEmergencyContact = async (id: string) => {
    setEmergencyContacts((prev) => prev.filter((c) => c.id !== id));
    if (currentUser && !id.startsWith('ec-')) {
      try {
        await deleteDoc(doc(db, 'emergencyContacts', id));
      } catch (err) {
        handleFirestoreError(
          err,
          OperationType.DELETE,
          `emergencyContacts/${id}`
        );
      }
    }
  };

  const handleTriggerSosConfirmed = async (phrase: string) => {
    const newSos: SosEventRecord = {
      id: `sos-${Date.now()}`,
      triggerPhrase: phrase,
      lat: userLocation.lat,
      lng: userLocation.lng,
      status: 'active',
      notifiedContactsCount: emergencyContacts.length,
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };
    setSosEvents((prev) => [newSos, ...prev]);
    if (currentUser) {
      try {
        await addDoc(collection(db, 'sosEvents'), {
          ownerUid: currentUser.uid,
          triggerPhrase: phrase,
          lat: userLocation.lat,
          lng: userLocation.lng,
          status: 'active',
          notifiedContactsCount: emergencyContacts.length,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'sosEvents');
      }
    }
  };

  const handleUpdateSosStatus = async (
    id: string,
    status: 'resolved' | 'cancelled'
  ) => {
    setSosEvents((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status } : s))
    );
    if (currentUser && !id.startsWith('sos-')) {
      try {
        await updateDoc(doc(db, 'sosEvents', id), { status });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `sosEvents/${id}`);
      }
    }
  };

  const handleClearAllUserData = async () => {
    setActivityLogs([]);
    setSosEvents([]);
    if (currentUser) {
      try {
        const logsSnap = await getDocs(
          query(
            collection(db, 'activityLogs'),
            where('ownerUid', '==', currentUser.uid)
          )
        );
        await Promise.all(logsSnap.docs.map((d) => deleteDoc(d.ref)));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, 'activityLogs');
      }
    }
  };

  const handleEnterFromLanding = (initialCommand?: string) => {
    setInWorkspace(true);
    if (initialCommand) {
      executeVoiceCommand(initialCommand);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      setInWorkspace(true);
    } catch {
      setInWorkspace(true);
    }
  };

  return (
    <div className="min-h-screen flex flex-col selection:bg-indigo-600 selection:text-white">
      {/* Mandatory Google Maps Demo Key Quota Exceeded Banner */}
      {quotaExceeded && (
        <div
          role="alert"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 9999,
            background: '#FEF3C7',
            color: '#78350F',
            borderBottom: '1px solid #F59E0B',
            padding: '10px 16px',
            fontSize: '14px',
            lineHeight: 1.5,
          }}
        >
          <strong>Demo Maps key quota reached.</strong> To keep using maps in
          this app, create your own Google Maps API key: in Google Cloud
          Console, enable the required Maps APIs on a billing-enabled project,
          create an API key under <em>Credentials</em> (restrict it to your
          app&apos;s referrer and the APIs in use), then add it in AI Studio
          under <strong>Settings → Secrets</strong> as{' '}
          <code>VITE_GOOGLE_MAPS_API_KEY</code>. See{' '}
          <a
            href="https://developers.google.com/maps/documentation/javascript/get-api-key"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#92400E', textDecoration: 'underline' }}
          >
            Get an API Key
          </a>
          .
        </div>
      )}

      {!inWorkspace ? (
        <LandingPage
          onEnterApp={handleEnterFromLanding}
          onSignInGoogle={handleGoogleSignIn}
          language={language}
          onLanguageChange={handleSelectLanguage}
        />
      ) : (
        <div className="flex-1 flex flex-col min-h-screen">
          {/* 1. Vibrant Daylight Studio Top Bar */}
          <header className="bg-white/95 backdrop-blur-xl border-b-2 border-indigo-100 px-4 lg:px-8 py-3.5 shadow-sm">
            <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
              {/* Clean Brand Emblem */}
              <button
                type="button"
                onClick={() => setActiveView('dashboard')}
                className="flex items-center gap-3 text-left cursor-pointer"
              >
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/30">
                  <Eye className="w-6 h-6 stroke-[2.4]" />
                </div>
                <div>
                  <span className="font-display font-extrabold text-xl tracking-tight text-slate-900 block">
                    NEX AI
                  </span>
                  <span className="text-xs text-slate-600 font-semibold block">
                    {ui.appTagline}
                  </span>
                </div>
              </button>

              {/* Theme & Font Controls */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setHighContrast((v) => !v)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 cursor-pointer ${
                    highContrast
                      ? 'bg-amber-400 text-slate-950 border-amber-500'
                      : 'bg-slate-100 text-slate-800 border-slate-300 hover:border-indigo-500'
                  }`}
                >
                  <Sun className="w-4 h-4 text-amber-500" />
                  <span>{highContrast ? 'Daylight' : 'Contrast'}</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setFontScale((prev) =>
                      prev === 'normal'
                        ? 'large'
                        : prev === 'large'
                          ? 'xl'
                          : 'normal'
                    )
                  }
                  className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 cursor-pointer ${
                    fontScale !== 'normal'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-100 text-slate-800 border-slate-300 hover:border-indigo-500'
                  }`}
                >
                  <Type className="w-4 h-4" />
                  <span className="uppercase">{fontScale}</span>
                </button>

                {currentUser ? (
                  <button
                    type="button"
                    onClick={() => signOut(auth)}
                    className="px-3 py-2 rounded-xl bg-emerald-50 text-xs font-bold text-emerald-700 border border-emerald-300 flex items-center gap-1.5 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Synced</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    className="px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-xs font-bold text-indigo-700 border border-indigo-200 flex items-center gap-1.5 cursor-pointer"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Sync</span>
                  </button>
                )}
              </div>
            </div>
          </header>

          {/* 2. Localized 5-Button Main Navigation Bar */}
          <nav
            aria-label="Main Application Modules"
            className="bg-white/85 backdrop-blur-md border-b border-slate-200 px-4 lg:px-8 py-3"
          >
            <div className="max-w-7xl mx-auto grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              <button
                type="button"
                onClick={() => setActiveView('dashboard')}
                className={`py-3 px-4 rounded-2xl font-display font-bold text-sm flex items-center justify-center gap-2 border-2 transition-all cursor-pointer ${
                  activeView === 'dashboard'
                    ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white border-indigo-600 shadow-md shadow-indigo-500/25'
                    : 'bg-white text-slate-800 border-slate-200 hover:border-indigo-400'
                }`}
              >
                <Radio className="w-4 h-4 shrink-0" />
                <span className="truncate">{ui.navHome}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  executeVoiceCommand('Hey NEX, mere aas paas kya hai?');
                }}
                className={`py-3 px-4 rounded-2xl font-display font-bold text-sm flex items-center justify-center gap-2 border-2 transition-all cursor-pointer ${
                  activeView === 'vision' && visionSubMode === 'camera'
                    ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white border-blue-600 shadow-md shadow-blue-500/25'
                    : 'bg-white text-slate-800 border-slate-200 hover:border-blue-400'
                }`}
              >
                <Camera className="w-4 h-4 shrink-0" />
                <span className="truncate">{ui.navCamera}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveView('vision');
                  setVisionSubMode('ocr');
                  setVisionAutoTriggerSignal((n) => n + 1);
                }}
                className={`py-3 px-4 rounded-2xl font-display font-bold text-sm flex items-center justify-center gap-2 border-2 transition-all cursor-pointer ${
                  activeView === 'vision' && visionSubMode === 'ocr'
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-600 shadow-md shadow-emerald-500/25'
                    : 'bg-white text-slate-800 border-slate-200 hover:border-emerald-400'
                }`}
              >
                <FileText className="w-4 h-4 shrink-0" />
                <span className="truncate">{ui.navOcr}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveView('family_nav')}
                className={`py-3 px-4 rounded-2xl font-display font-bold text-sm flex items-center justify-center gap-2 border-2 transition-all cursor-pointer ${
                  activeView === 'family_nav'
                    ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white border-purple-600 shadow-md shadow-purple-500/25'
                    : 'bg-white text-slate-800 border-slate-200 hover:border-purple-400'
                }`}
              >
                <Navigation className="w-4 h-4 shrink-0" />
                <span className="truncate">{ui.navMap}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveView('emergency_hardware');
                  setEmergencySection('sos');
                }}
                className={`col-span-2 sm:col-span-1 py-3 px-4 rounded-2xl font-display font-bold text-sm flex items-center justify-center gap-2 border-2 transition-all cursor-pointer ${
                  activeView === 'emergency_hardware'
                    ? 'bg-gradient-to-r from-rose-600 to-red-600 text-white border-rose-600 shadow-md shadow-rose-500/30'
                    : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                }`}
              >
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span className="truncate">{ui.navSos}</span>
              </button>
            </div>
          </nav>

          {/* 3. Compact, Single-Tap Voice Control Bar */}
          <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-xl border-b-2 border-indigo-100 px-4 lg:px-8 py-2.5 shadow-sm">
            <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={() => {
                  const next = !micListening;
                  setMicListening(next);
                  if (next) {
                    audioEngine.stopSpeaking();
                    setOrbState('Listening');
                  } else {
                    setOrbState('Ready');
                  }
                }}
                aria-pressed={micListening}
                className={`px-4 py-2.5 rounded-xl font-mono text-xs font-extrabold flex items-center gap-2 border-2 transition-all cursor-pointer ${
                  micListening
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600 shadow-md'
                }`}
              >
                <Mic className="w-4 h-4" />
                <span>{micListening ? ui.micActiveLabel : ui.micPausedLabel}</span>
              </button>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!voiceInputText.trim()) return;
                  executeVoiceCommand(voiceInputText);
                  setVoiceInputText('');
                }}
                className="flex-1 min-w-[220px] flex items-center gap-2"
              >
                <input
                  type="text"
                  value={voiceInputText}
                  onChange={(e) => setVoiceInputText(e.target.value)}
                  placeholder={ui.inputPlaceholder}
                  aria-label="Voice command input"
                  className="flex-1 bg-slate-50 border-2 border-slate-300 focus:border-indigo-600 rounded-xl px-4 py-2 text-sm text-slate-900 placeholder:text-slate-500 font-semibold"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>{ui.runCmdBtn}</span>
                </button>
              </form>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => audioEngine.repeatLast()}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Repeat className="w-4 h-4 text-indigo-600" />
                  <span>{ui.repeatBtn}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    audioEngine.stopSpeaking();
                    setMicListening(false);
                    setOrbState('Paused');
                  }}
                  className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <VolumeX className="w-4 h-4" />
                  <span>{ui.stopBtn}</span>
                </button>
              </div>
            </div>
          </div>

          {/* 4. Clean, Spacious Main Content */}
          <main className="flex-1 p-4 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
            {/* Live Outgoing Call Banner for Saved Numbers */}
            {activeCallState && (
              <section
                role="region"
                aria-label="Active Saved Contact Call"
                aria-live="assertive"
                className="rounded-3xl bg-emerald-50/95 border-2 border-emerald-500 p-5 sm:p-6 shadow-xl"
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-600 text-white nex-keep-white flex items-center justify-center shadow-lg shrink-0 animate-pulse">
                      <PhoneCall className="w-7 h-7 stroke-[2.4] nex-keep-white" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-3 py-0.5 rounded-full bg-emerald-600 font-mono text-xs font-extrabold uppercase tracking-wider text-white nex-keep-white">
                          {activeCallState.status === 'dialing'
                            ? 'Dialing Saved Number...'
                            : `Call Connected • ${String(Math.floor(activeCallState.elapsedSeconds / 60)).padStart(2, '0')}:${String(activeCallState.elapsedSeconds % 60).padStart(2, '0')}`}
                        </span>
                        <span className="text-xs font-bold text-emerald-900">
                          {activeCallState.contact.relation}
                        </span>
                      </div>
                      <h2 className="font-display text-xl sm:text-2xl font-extrabold text-slate-950 mt-1">
                        {activeCallState.contact.name}
                      </h2>
                      <p className="font-mono text-sm sm:text-base font-extrabold text-emerald-800 tabular-nums">
                        {activeCallState.contact.phone}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <a
                      href={`tel:${activeCallState.contact.phone.replace(/\s+/g, '')}`}
                      className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white nex-keep-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-md cursor-pointer"
                    >
                      <PhoneCall className="w-4 h-4 nex-keep-white" />
                      <span className="nex-keep-white">
                        Phone Dialer ({activeCallState.contact.phone})
                      </span>
                    </a>
                    <button
                      type="button"
                      onClick={() => endActiveCall()}
                      className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white nex-keep-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-md cursor-pointer"
                    >
                      <PhoneOff className="w-4 h-4 nex-keep-white" />
                      <span className="nex-keep-white">
                        Call Kaatein (End Call)
                      </span>
                    </button>
                  </div>
                </div>

                {/* Switch between Saved Contacts during Call */}
                <div className="mt-4 pt-3.5 border-t border-emerald-300 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-extrabold text-emerald-950 mr-1">
                    Saved Numbers:
                  </span>
                  {allSavedContacts.map((sc) => {
                    const isCurrent = sc.phone === activeCallState.contact.phone;
                    return (
                      <button
                        key={sc.id}
                        type="button"
                        onClick={() =>
                          initiateSavedContactCall(sc, `Call ${sc.name}`)
                        }
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                          isCurrent
                            ? 'bg-emerald-600 text-white nex-keep-white border-emerald-700 shadow-sm'
                            : 'bg-white hover:bg-emerald-100 text-slate-900 border-emerald-300'
                        }`}
                      >
                        <PhoneCall
                          className={`w-3.5 h-3.5 ${isCurrent ? 'nex-keep-white' : 'text-emerald-700'}`}
                        />
                        <span className={isCurrent ? 'nex-keep-white' : 'text-slate-900'}>
                          {sc.name}
                        </span>
                        <span
                          className={`font-mono ${isCurrent ? 'nex-keep-white opacity-95' : 'text-emerald-800'}`}
                        >
                          ({sc.phone})
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {activeView === 'dashboard' && (
              <div className="space-y-6">
                <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                  {/* Left 7 Cols: Minimal Giant Voice Orb + Spoken Output */}
                  <div className="lg:col-span-7 nex-glass-panel rounded-3xl p-6 lg:p-8 flex flex-col justify-between">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 font-mono text-xs font-bold text-indigo-700">
                          <Sparkles className="w-3.5 h-3.5" />
                          {ui.voiceBannerTitle}
                        </span>
                        <h1 className="font-display text-xl sm:text-2xl font-extrabold text-slate-900">
                          {ui.heroTitle}
                        </h1>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const nextRate = speechRate === 1.0 ? 0.8 : 1.0;
                          setSpeechRate(nextRate);
                          speakResponse(
                            nextRate < 1 ? '0.8x' : '1.0x',
                            language,
                            nextRate
                          );
                        }}
                        className="px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-xs font-mono font-bold text-indigo-700 flex items-center gap-1.5 cursor-pointer"
                      >
                        <Gauge className="w-3.5 h-3.5" />
                        <span>{speechRate}x</span>
                      </button>
                    </div>

                    {/* Giant Eye-Catching Voice Orb */}
                    <div className="my-6 flex flex-col items-center justify-center text-center">
                      <button
                        type="button"
                        onClick={() => {
                          const next = !micListening;
                          setMicListening(next);
                          if (next) {
                            audioEngine.stopSpeaking();
                            setOrbState('Listening');
                          } else {
                            setOrbState('Ready');
                          }
                        }}
                        aria-label="Tap to Speak"
                        className="relative group focus:outline-none cursor-pointer"
                      >
                        <div
                          className={`w-40 h-40 rounded-full flex items-center justify-center transition-all duration-300 border-4 ${
                            orbState === 'Speaking'
                              ? 'bg-gradient-to-br from-emerald-500 to-teal-600 border-emerald-200 nex-orb-speaking scale-105'
                              : micListening
                                ? 'bg-gradient-to-br from-rose-500 to-pink-600 border-rose-200 nex-orb-glow scale-105'
                                : 'bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 border-indigo-200 nex-orb-glow hover:scale-105'
                          }`}
                        >
                          <div className="w-28 h-28 rounded-full bg-white/95 flex flex-col items-center justify-center gap-1.5 shadow-inner">
                            {micListening ? (
                              <Mic className="w-10 h-10 text-rose-600 animate-bounce" />
                            ) : (
                              <Volume2 className="w-10 h-10 text-indigo-600" />
                            )}
                            <span className="font-mono text-[11px] font-extrabold tracking-wider uppercase text-slate-900">
                              {micListening ? ui.micActiveLabel : orbState}
                            </span>
                          </div>
                        </div>
                      </button>

                      <p
                        aria-live="polite"
                        className="mt-5 text-base sm:text-lg text-slate-900 max-w-lg font-bold leading-snug"
                      >
                        &ldquo;{assistantReply}&rdquo;
                      </p>
                    </div>
                  </div>

                  {/* Right 5 Cols: Clean In-App 8-Language Selector */}
                  <div className="lg:col-span-5 nex-glass-panel rounded-3xl p-6 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <span className="font-display text-lg font-extrabold text-slate-900 flex items-center gap-2">
                          <Globe className="w-5 h-5 text-indigo-600" />
                          {ui.langHubTitle}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        {LANGUAGE_OPTIONS.map((langItem) => {
                          const isSelected = language === langItem.code;
                          return (
                            <button
                              key={langItem.code}
                              type="button"
                              onClick={() => handleSelectLanguage(langItem.code)}
                              className={`p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-center justify-between ${
                                isSelected
                                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white border-indigo-600 shadow-md'
                                  : 'bg-white text-slate-900 border-slate-200 hover:border-indigo-400'
                              }`}
                            >
                              <span className="font-display font-extrabold text-base">
                                {langItem.nativeName}
                              </span>
                              <span
                                className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-md ${
                                  isSelected
                                    ? 'bg-white/20 text-white'
                                    : 'bg-indigo-50 text-indigo-700'
                                }`}
                              >
                                {langItem.name}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </section>

                {/* 4 Minimal, Bold Feature Cards (Icon + Translated Name Only — Zero Clutter!) */}
                <section aria-label="Core Assistance Modules">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <button
                      type="button"
                      onClick={() =>
                        executeVoiceCommand('Hey NEX, mere aas paas kya hai?')
                      }
                      className="rounded-3xl p-6 text-left bg-white border-2 border-indigo-200 hover:border-indigo-500 transition-all flex items-center gap-4 cursor-pointer shadow-md hover:shadow-xl"
                    >
                      <div className="w-13 h-13 rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white flex items-center justify-center shrink-0 shadow-md">
                        <Camera className="w-6 h-6 nex-keep-white" />
                      </div>
                      <h3 className="font-display font-extrabold text-lg text-slate-900">
                        {ui.cardCameraTitle}
                      </h3>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        executeVoiceCommand('Hey NEX, read this document')
                      }
                      className="rounded-3xl p-6 text-left bg-white border-2 border-emerald-200 hover:border-emerald-500 transition-all flex items-center gap-4 cursor-pointer shadow-md hover:shadow-xl"
                    >
                      <div className="w-13 h-13 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center shrink-0 shadow-md">
                        <FileText className="w-6 h-6 nex-keep-white" />
                      </div>
                      <h3 className="font-display font-extrabold text-lg text-slate-900">
                        {ui.cardOcrTitle}
                      </h3>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        executeVoiceCommand('Hey NEX, nearest hospital batao')
                      }
                      className="rounded-3xl p-6 text-left bg-white border-2 border-purple-200 hover:border-purple-500 transition-all flex items-center gap-4 cursor-pointer shadow-md hover:shadow-xl"
                    >
                      <div className="w-13 h-13 rounded-2xl bg-gradient-to-br from-purple-600 to-fuchsia-600 text-white flex items-center justify-center shrink-0 shadow-md">
                        <Navigation className="w-6 h-6 nex-keep-white" />
                      </div>
                      <h3 className="font-display font-extrabold text-lg text-slate-900">
                        {ui.cardMapTitle}
                      </h3>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        executeVoiceCommand('Hey NEX, emergency help')
                      }
                      className="rounded-3xl p-6 text-left bg-rose-50/70 border-2 border-rose-300 hover:border-rose-600 transition-all flex items-center gap-4 cursor-pointer shadow-md hover:shadow-xl"
                    >
                      <div className="w-13 h-13 rounded-2xl bg-gradient-to-br from-rose-600 to-red-600 text-white flex items-center justify-center shrink-0 shadow-md">
                        <ShieldAlert className="w-6 h-6 nex-keep-white" />
                      </div>
                      <h3 className="font-display font-extrabold text-lg text-rose-950">
                        {ui.cardSosTitle}
                      </h3>
                    </button>
                  </div>
                </section>

                {/* Quick Voice Call Saved Numbers Strip */}
                <section
                  aria-label="Saved Numbers Voice Call"
                  className="nex-glass-panel rounded-3xl p-5 flex flex-wrap items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md">
                      <PhoneCall className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="font-display font-extrabold text-base sm:text-lg text-slate-900">
                        Voice Call Saved Numbers (&ldquo;Call&rdquo; / &ldquo;Call Mummy&rdquo; / &ldquo;Call Aarav&rdquo;)
                      </h2>
                      <p className="text-xs font-semibold text-slate-600">
                        Bolein &ldquo;Call&rdquo; ya kisi bhi save number par tap karein:
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {allSavedContacts.map((sc) => (
                      <button
                        key={sc.id}
                        type="button"
                        onClick={() =>
                          initiateSavedContactCall(sc, `Call ${sc.name}`)
                        }
                        className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-2 border-emerald-300 font-bold text-xs flex items-center gap-2 cursor-pointer transition-all"
                      >
                        <PhoneCall className="w-3.5 h-3.5 text-emerald-700" />
                        <span>{sc.name}</span>
                        <span className="font-mono text-[11px] text-emerald-700">
                          {sc.phone}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {activeView === 'vision' && (
              <VisionWorkspace
                activeSubMode={visionSubMode}
                onChangeSubMode={setVisionSubMode}
                language={language}
                onLanguageChange={handleSelectLanguage}
                onLogActivity={logActivity}
                autoTriggerSignal={visionAutoTriggerSignal}
                onLiveSummaryChange={setAssistantReply}
                voiceSubCommand={visionSubCommand}
              />
            )}

            {activeView === 'family_nav' && (
              <FamilyAndNavigation
                activeTab={familyNavTab}
                onChangeTab={setFamilyNavTab}
                language={language}
                userLocation={userLocation}
                locationSharingEnabled={locationSharingEnabled}
                onToggleLocationSharing={handleToggleLocationSharing}
                sharingSessionMinutes={sharingSessionMinutes}
                familyMembers={familyMembers}
                onAddFamilyMember={handleAddFamilyMember}
                onUpdateFamilyMemberStatus={handleUpdateFamilyMemberStatus}
                requestedPlaceCategory={requestedPlaceCategory}
                onSelectPlaceCategory={setRequestedPlaceCategory}
                autoNavigateSignal={autoNavigateSignal}
                onLogActivity={logActivity}
              />
            )}

            {activeView === 'emergency_hardware' && (
              <EmergencyAndHardware
                activeSection={emergencySection}
                onChangeSection={setEmergencySection}
                language={language}
                onLanguageChange={handleSelectLanguage}
                speechRate={speechRate}
                onSpeechRateChange={setSpeechRate}
                highContrast={highContrast}
                onToggleHighContrast={() => setHighContrast((v) => !v)}
                fontScale={fontScale}
                onFontScaleChange={setFontScale}
                reducedMotion={reducedMotion}
                onToggleReducedMotion={() => setReducedMotion((v) => !v)}
                userLocation={userLocation}
                emergencyContacts={emergencyContacts}
                onAddEmergencyContact={handleAddEmergencyContact}
                onDeleteEmergencyContact={handleDeleteEmergencyContact}
                onCallContact={(c) =>
                  initiateSavedContactCall(c, `Call ${c.name}`)
                }
                sosEvents={sosEvents}
                onTriggerSosConfirmed={handleTriggerSosConfirmed}
                onUpdateSosStatus={handleUpdateSosStatus}
                sosCountdownSignal={sosCountdownSignal}
                cancelSosSignal={cancelSosSignal}
                activityLogs={activityLogs}
                onClearAllUserData={handleClearAllUserData}
              />
            )}
          </main>
        </div>
      )}
    </div>
  );
}
