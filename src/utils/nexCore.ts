export type SupportedLanguage =
  | 'en'
  | 'hi'
  | 'hinglish'
  | 'mr'
  | 'ta'
  | 'bn'
  | 'gu'
  | 'te';

export type AssistantModule =
  | 'dashboard'
  | 'camera'
  | 'yolo'
  | 'ocr'
  | 'family'
  | 'navigation'
  | 'sos'
  | 'glasses'
  | 'settings'
  | 'history';

export type PlaceCategory =
  | 'hospital'
  | 'pharmacy'
  | 'restaurant'
  | 'bus_station'
  | 'train_station'
  | 'atm';

export type VoiceIntentType =
  | 'wake_only'
  | 'go_home'
  | 'describe_surroundings'
  | 'detect_objects'
  | 'change_scene_preset'
  | 'read_text'
  | 'change_ocr_preset'
  | 'ocr_next_paragraph'
  | 'ocr_translate'
  | 'ocr_summarize'
  | 'find_nearby'
  | 'start_navigation'
  | 'family_location'
  | 'share_location'
  | 'stop_sharing_location'
  | 'emergency_sos'
  | 'cancel_sos'
  | 'call_contact'
  | 'end_call'
  | 'repeat_last'
  | 'stop_speaking'
  | 'pause_listening'
  | 'resume_listening'
  | 'read_slowly'
  | 'read_faster'
  | 'toggle_high_contrast'
  | 'font_larger'
  | 'change_language'
  | 'smart_glasses_status'
  | 'help'
  | 'contextual_followup';

export interface ParsedVoiceCommand {
  intent: VoiceIntentType;
  targetModule?: AssistantModule;
  detectedLanguage: SupportedLanguage;
  targetLanguage?: SupportedLanguage;
  placeCategory?: PlaceCategory;
  scenePresetTarget?: 'indoor_room' | 'street_crosswalk' | 'staircase_hallway';
  ocrPresetTarget?: 'hospital_notice' | 'medicine_label' | 'currency_note';
  familyTarget?: string;
  callTarget?: string;
  cleanedQuery: string;
  confidence: number;
}

export interface RawDetectionBox {
  label: string;
  confidence: number;
  /** Normalized [ymin, xmin, ymax, xmax] in range 0..1000 or 0..1 */
  box: [number, number, number, number];
}

export interface AnalyzedDetectionObject {
  label: string;
  confidence: number;
  position: 'left' | 'ahead' | 'right';
  coverageRatio: number;
  isObstacle: boolean;
  priority: 'critical' | 'moderate' | 'informational';
  voiceAlertEn: string;
  voiceAlertHi: string;
  voiceAlertHinglish: string;
  calibrationNote: string;
  normalizedBox: [number, number, number, number];
}

export interface SceneMemoryState {
  lastSummary: string;
  lastObjects: Array<{ label: string; position: 'left' | 'ahead' | 'right'; details?: string }>;
  lastOcrText: string;
  lastPlaceQuery?: PlaceCategory;
  updatedAt: number;
}

const WAKE_PHRASES = [
  'hey nex',
  'hi nex',
  'hello nex',
  'ok nex',
  'okay nex',
  'namaste nex',
  'suno nex',
  'हे नेक्स',
  'हेलो नेक्स',
  'नमस्ते नेक्स',
  'सुनो नेक्स',
  'hey next',
  'hay nex',
];

/**
 * Detects whether an utterance contains the "Hey NEX" wake phrase,
 * and extracts any trailing command spoken in the same utterance.
 */
export function detectWakeWord(transcript: string): {
  detected: boolean;
  wakePhraseMatched: string | null;
  commandRemainder: string;
} {
  const normalized = transcript
    .trim()
    .toLowerCase()
    .replace(/[.,!?।]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return { detected: false, wakePhraseMatched: null, commandRemainder: '' };
  }

  for (const phrase of WAKE_PHRASES) {
    const idx = normalized.indexOf(phrase);
    if (idx !== -1) {
      const remainder = normalized.slice(idx + phrase.length).trim();
      return {
        detected: true,
        wakePhraseMatched: phrase,
        commandRemainder: remainder,
      };
    }
  }

  return { detected: false, wakePhraseMatched: null, commandRemainder: normalized };
}

/**
 * Detects whether text is primarily Hindi (Devanagari), Hinglish, or English.
 */
export function detectTranscriptLanguage(text: string): SupportedLanguage {
  if (/[\u0900-\u097F]/.test(text)) {
    return 'hi';
  }
  const lower = text.toLowerCase();
  const hinglishMarkers = [
    'mere', 'aas', 'paas', 'kya', 'hai', 'saamne', 'batao', 'kahan',
    'padho', 'padh', 'karo', 'ruk', 'jao', 'dheere', 'bolo', 'rasta',
    'dikhao', 'mummy', 'papa', 'bachao', 'koi', 'dikha', 'रहा'
  ];
  const words = lower.split(/\s+/);
  const markerHits = words.filter((w) => hinglishMarkers.includes(w)).length;
  if (markerHits >= 1) {
    return 'hinglish';
  }
  return 'en';
}

/**
 * Classifies a natural voice command in English, Hindi, or Hinglish into a structured intent.
 */
export function classifyVoiceIntent(
  rawInput: string,
  currentLanguage: SupportedLanguage = 'en'
): ParsedVoiceCommand {
  const wakeCheck = detectWakeWord(rawInput);
  const cleaned = (wakeCheck.detected ? wakeCheck.commandRemainder : rawInput)
    .trim()
    .replace(/[.,!?।]/g, '')
    .trim();
  const lower = cleaned.toLowerCase();
  const detectedLang = cleaned ? detectTranscriptLanguage(cleaned) : currentLanguage;

  if (!cleaned) {
    return {
      intent: 'wake_only',
      detectedLanguage: detectedLang,
      cleanedQuery: '',
      confidence: 0.99,
    };
  }

  // 1. Stop / Cancel speaking
  if (
    /^(stop|stop speaking|stop reading|stop assistance|quiet|silence|ruk jao|chup|band karo|bas karo|रुक जाओ|चुप|बंद करो)$/i.test(
      lower
    )
  ) {
    return {
      intent: 'stop_speaking',
      detectedLanguage: detectedLang,
      cleanedQuery: cleaned,
      confidence: 0.98,
    };
  }

  // 2. Cancel SOS
  if (/(cancel emergency|cancel sos|false alarm|sos band karo|इमरजेंसी रद्द)/i.test(lower)) {
    return {
      intent: 'cancel_sos',
      targetModule: 'sos',
      detectedLanguage: detectedLang,
      cleanedQuery: cleaned,
      confidence: 0.97,
    };
  }

  // 2b. End / Cut Active Phone Call
  if (
    /^(end call|cut call|hang up|disconnect call|call kaato|call kaat do|call band karo|phone kaato|phone rakh do|कॉल काटो|फ़ोन काटो|कॉल बंद करो)$/i.test(
      lower
    ) ||
    /(call kaato|call kaat do|phone kaato|disconnect call|end the call|कॉल काट दो|फ़ोन काट दो)/i.test(lower)
  ) {
    return {
      intent: 'end_call',
      targetModule: 'sos',
      detectedLanguage: detectedLang,
      cleanedQuery: cleaned,
      confidence: 0.98,
    };
  }

  // 2c. Direct Voice Call to Saved Numbers ("call", "call karo", "call mummy", "call aarav", "phone lagao", etc.)
  if (
    /^(call|phone|dial|call karo|call lagao|phone karo|phone lagao|baat karao|कॉल|कॉल करो|कॉल लगाओ|फ़ोन|फ़ोन करो|फ़ोन लगाओ)$/i.test(
      lower
    ) ||
    /\b(call|phone|dial)\b/i.test(lower) ||
    /(कॉल|फ़ोन|फोन|नंबर लगाओ|बात कराओ)/i.test(lower)
  ) {
    return {
      intent: 'call_contact',
      targetModule: 'sos',
      detectedLanguage: detectedLang,
      callTarget: cleaned,
      cleanedQuery: cleaned,
      confidence: 0.98,
    };
  }

  // 3. Emergency SOS
  if (
    /(emergency|sos|help me emergency|bachao|madad karo|इमरजेंसी|बचाओ|मदद करो)/i.test(
      lower
    )
  ) {
    return {
      intent: 'emergency_sos',
      targetModule: 'sos',
      detectedLanguage: detectedLang,
      cleanedQuery: cleaned,
      confidence: 0.98,
    };
  }

  // 4. Repeat last response
  if (/(repeat|repeat that|say that again|dobara bolo|phir se bolo|फिर से बोलो|दोहराओ)/i.test(lower)) {
    return {
      intent: 'repeat_last',
      detectedLanguage: detectedLang,
      cleanedQuery: cleaned,
      confidence: 0.96,
    };
  }

  // 5. Pause / Resume listening or camera
  if (/(pause listening|pause camera|pause assistance|wait a second|थोड़ी देर रुको)/i.test(lower)) {
    return {
      intent: 'pause_listening',
      detectedLanguage: detectedLang,
      cleanedQuery: cleaned,
      confidence: 0.95,
    };
  }
  if (/(resume listening|resume camera|start listening|continue assistance|फिर से शुरू करो)/i.test(lower)) {
    return {
      intent: 'resume_listening',
      detectedLanguage: detectedLang,
      cleanedQuery: cleaned,
      confidence: 0.95,
    };
  }

  // 6. Read slowly / faster / accessibility voice controls
  if (/(read slowly|speak slowly|slow down|slow bolo|dheere bolo|dheere padho|धीरे बोलो|धीरे पढ़ो)/i.test(lower)) {
    return {
      intent: 'read_slowly',
      detectedLanguage: detectedLang,
      cleanedQuery: cleaned,
      confidence: 0.95,
    };
  }
  if (/(speak faster|fast bolo|tez bolo|normal speed|तेज़ बोलो|सामान्य गति)/i.test(lower)) {
    return {
      intent: 'read_faster',
      detectedLanguage: detectedLang,
      cleanedQuery: cleaned,
      confidence: 0.95,
    };
  }
  if (/(high contrast|contrast mode|contrast on|contrast badhao|हाई कॉन्ट्रास्ट)/i.test(lower)) {
    return {
      intent: 'toggle_high_contrast',
      detectedLanguage: detectedLang,
      cleanedQuery: cleaned,
      confidence: 0.95,
    };
  }
  if (/(large font|bigger text|bada font|font bada karo|बड़ा फ़ॉन्ट)/i.test(lower)) {
    return {
      intent: 'font_larger',
      detectedLanguage: detectedLang,
      cleanedQuery: cleaned,
      confidence: 0.95,
    };
  }

  // 6b. Navigate to Home / Main Dashboard
  if (/^(home|go home|go to home|open home|dashboard|home chalo|home kholo|main screen|होम|होम पर चलो|डैशबोर्ड खोलो)$/i.test(lower)) {
    return {
      intent: 'go_home',
      targetModule: 'dashboard',
      detectedLanguage: detectedLang,
      cleanedQuery: cleaned,
      confidence: 0.96,
    };
  }

  // 7. Instant Voice Language Switch (works by just saying the language name or "speak in <lang>")
  if (
    /^(hindi|हिंदी|हिन्दी)$/i.test(lower) ||
    /(speak in hindi|switch to hindi|hindi mein bolo|hindi mode|hindi bhasha|change language to hindi|हिंदी में बोलो|हिंदी भाषा|हिंदी चालू करो)/i.test(
      lower
    )
  ) {
    return {
      intent: 'change_language',
      detectedLanguage: 'hi',
      targetLanguage: 'hi',
      cleanedQuery: cleaned,
      confidence: 0.98,
    };
  }
  if (
    /^(hinglish|हिंग्लिश)$/i.test(lower) ||
    /(speak in hinglish|switch to hinglish|hinglish mode|hinglish mein bolo|हिंग्लिश में बोलो)/i.test(
      lower
    )
  ) {
    return {
      intent: 'change_language',
      detectedLanguage: 'hinglish',
      targetLanguage: 'hinglish',
      cleanedQuery: cleaned,
      confidence: 0.98,
    };
  }
  if (
    /^(english|अंग्रेजी|इंग्लिश)$/i.test(lower) ||
    /(speak in english|switch to english|english mein bolo|english mode|change language to english|अंग्रेजी में बोलो)/i.test(
      lower
    )
  ) {
    return {
      intent: 'change_language',
      detectedLanguage: 'en',
      targetLanguage: 'en',
      cleanedQuery: cleaned,
      confidence: 0.98,
    };
  }
  if (
    /^(marathi|मराठी)$/i.test(lower) ||
    /(speak in marathi|switch to marathi|marathi mein bolo|marathi madhe bola|मराठीत बोला|मराठी में बोलो)/i.test(
      lower
    )
  ) {
    return {
      intent: 'change_language',
      detectedLanguage: 'mr',
      targetLanguage: 'mr',
      cleanedQuery: cleaned,
      confidence: 0.98,
    };
  }
  if (
    /^(tamil|तमिल|தமிழ்)$/i.test(lower) ||
    /(speak in tamil|switch to tamil|tamil mein bolo|tamil la pesu|தமிழில் பேசு|तमिल में बोलो)/i.test(
      lower
    )
  ) {
    return {
      intent: 'change_language',
      detectedLanguage: 'ta',
      targetLanguage: 'ta',
      cleanedQuery: cleaned,
      confidence: 0.98,
    };
  }
  if (
    /^(bengali|bangla|बंगाली|बांग्ला|বাংলা)$/i.test(lower) ||
    /(speak in bengali|switch to bengali|bengali mein bolo|bangla te bolo|বাংলায় বলুন|बंगाली में बोलो)/i.test(
      lower
    )
  ) {
    return {
      intent: 'change_language',
      detectedLanguage: 'bn',
      targetLanguage: 'bn',
      cleanedQuery: cleaned,
      confidence: 0.98,
    };
  }
  if (
    /^(gujarati|गुजराती|ગુજરાતી)$/i.test(lower) ||
    /(speak in gujarati|switch to gujarati|gujarati mein bolo|gujarati ma bolo|ગુજરાતીમાં બોલો|गुजराती में बोलो)/i.test(
      lower
    )
  ) {
    return {
      intent: 'change_language',
      detectedLanguage: 'gu',
      targetLanguage: 'gu',
      cleanedQuery: cleaned,
      confidence: 0.98,
    };
  }
  if (
    /^(telugu|तेलुगु|తెలుగు)$/i.test(lower) ||
    /(speak in telugu|switch to telugu|telugu mein bolo|telugu lo cheppu|తెలుగులో మాట్లాడు|तेलुगु में बोलो)/i.test(
      lower
    )
  ) {
    return {
      intent: 'change_language',
      detectedLanguage: 'te',
      targetLanguage: 'te',
      cleanedQuery: cleaned,
      confidence: 0.98,
    };
  }

  // 8. OCR sub-commands (next paragraph, translate, summarize, preset switch, read)
  if (/(next paragraph|read the next paragraph|agla paragraph|aage padho|अगला पैराग्राफ|आगे पढ़ो)/i.test(lower)) {
    return {
      intent: 'ocr_next_paragraph',
      targetModule: 'ocr',
      detectedLanguage: detectedLang,
      cleanedQuery: cleaned,
      confidence: 0.95,
    };
  }
  if (/(translate this|translate document|hindi mein translate|english mein translate|translate karo|anuvad karo|अनुवाद करो)/i.test(lower)) {
    return {
      intent: 'ocr_translate',
      targetModule: 'ocr',
      detectedLanguage: detectedLang,
      cleanedQuery: cleaned,
      confidence: 0.95,
    };
  }
  if (/(summarize this|summarize document|summary batao|summarize karo|short mein batao|सारांश बताओ)/i.test(lower)) {
    return {
      intent: 'ocr_summarize',
      targetModule: 'ocr',
      detectedLanguage: detectedLang,
      cleanedQuery: cleaned,
      confidence: 0.95,
    };
  }
  if (/(prescription|medicine label|dawai ki parchi|tablet|दवाई की पर्ची|दवा का नाम)/i.test(lower)) {
    return {
      intent: 'change_ocr_preset',
      targetModule: 'ocr',
      ocrPresetTarget: 'medicine_label',
      detectedLanguage: detectedLang,
      cleanedQuery: cleaned,
      confidence: 0.96,
    };
  }
  if (/(currency|rupee|note check|kitne ka note|500 note|नोट चेक करो|कितने का नोट)/i.test(lower)) {
    return {
      intent: 'change_ocr_preset',
      targetModule: 'ocr',
      ocrPresetTarget: 'currency_note',
      detectedLanguage: detectedLang,
      cleanedQuery: cleaned,
      confidence: 0.96,
    };
  }
  if (
    /(read this|read the|read document|read notice|read book|read sign|read menu|open ocr|ocr kholo|text padho|padh kar batao|kya likha hai|इसे पढ़ो|क्या लिखा है|ओसीआर खोलो)/i.test(
      lower
    )
  ) {
    return {
      intent: 'read_text',
      targetModule: 'ocr',
      detectedLanguage: detectedLang,
      cleanedQuery: cleaned,
      confidence: 0.96,
    };
  }

  // 8b. Specific Scene Preset Switching by Voice
  if (/(crosswalk|street scene|traffic scene|sadak dikhao|क्रॉसवॉक|सड़क का दृश्य)/i.test(lower)) {
    return {
      intent: 'change_scene_preset',
      targetModule: 'camera',
      scenePresetTarget: 'street_crosswalk',
      detectedLanguage: detectedLang,
      cleanedQuery: cleaned,
      confidence: 0.95,
    };
  }
  if (/(staircase|stairs ahead|seedhiyan dikhao|सीढ़ियां दिखाओ|सीढ़ी)/i.test(lower)) {
    return {
      intent: 'change_scene_preset',
      targetModule: 'camera',
      scenePresetTarget: 'staircase_hallway',
      detectedLanguage: detectedLang,
      cleanedQuery: cleaned,
      confidence: 0.95,
    };
  }

  // 9. Obstacle & YOLO Object Detection
  if (
    /(obstacle|object detection|detect objects|yolo|kya mere saamne koi obstacle|koi rukawat|saamne kya hai check karo|रास्ते में कोई रुकावट|ऑब्जेक्ट डिटेक्शन)/i.test(
      lower
    )
  ) {
    return {
      intent: 'detect_objects',
      targetModule: 'yolo',
      detectedLanguage: detectedLang,
      cleanedQuery: cleaned,
      confidence: 0.95,
    };
  }

  // 10. Live Surroundings Description
  if (
    /(describe my surroundings|what is in front of me|what's in front of me|describe surroundings|what do you see|start camera|open camera|camera kholo|camera chalu karo|mere aas paas kya hai|mere saamne kya hai|aas paas kya hai|aage kya hai|मेरे आस पास क्या है|मेरे सामने क्या है|कैमरा चालू करो|कैमरा खोलो)/i.test(
      lower
    )
  ) {
    return {
      intent: 'describe_surroundings',
      targetModule: 'camera',
      detectedLanguage: detectedLang,
      cleanedQuery: cleaned,
      confidence: 0.97,
    };
  }

  // 11. Family Location & Consent
  if (/(stop sharing my location|disable location sharing|location sharing band karo|लोकेशन शेयरिंग बंद)/i.test(lower)) {
    return {
      intent: 'stop_sharing_location',
      targetModule: 'family',
      detectedLanguage: detectedLang,
      cleanedQuery: cleaned,
      confidence: 0.96,
    };
  }
  if (/(share my location|enable location sharing|meri location share karo|लोकेशन शेयर करो)/i.test(lower)) {
    return {
      intent: 'share_location',
      targetModule: 'family',
      detectedLanguage: detectedLang,
      cleanedQuery: cleaned,
      confidence: 0.96,
    };
  }
  if (
    /(where is my family|mother's location|father's location|show my family|family kahan hai|mummy kahan|papa kahan|मेरा परिवार कहाँ है|मम्मी कहाँ हैं)/i.test(
      lower
    )
  ) {
    const familyTarget = /mother|mummy|mom|मम्मी/i.test(lower)
      ? 'Mother'
      : /father|papa|dad|पापा/i.test(lower)
      ? 'Father'
      : undefined;
    return {
      intent: 'family_location',
      targetModule: 'family',
      detectedLanguage: detectedLang,
      familyTarget,
      cleanedQuery: cleaned,
      confidence: 0.96,
    };
  }

  // 12. Smart Navigation & Nearby Places
  if (
    /(hospital|pharmacy|chemist|medical store|restaurant|food|cafe|bus stop|railway station|train station|metro|atm|bank|अस्पताल|दवाखाना|बस स्टॉप|रेलवे स्टेशन)/i.test(
      lower
    )
  ) {
    let placeCategory: PlaceCategory = 'hospital';
    if (/(pharmacy|chemist|medical store|दवाखाना)/i.test(lower)) placeCategory = 'pharmacy';
    else if (/(restaurant|food|cafe|होटल|रेस्टोरेंट)/i.test(lower)) placeCategory = 'restaurant';
    else if (/(bus stop|bus stand|बस स्टॉप)/i.test(lower)) placeCategory = 'bus_station';
    else if (/(railway|train|metro|रेलवे|ट्रेन)/i.test(lower)) placeCategory = 'train_station';
    else if (/(atm|bank|एटीएम)/i.test(lower)) placeCategory = 'atm';

    return {
      intent: 'find_nearby',
      targetModule: 'navigation',
      detectedLanguage: detectedLang,
      placeCategory,
      cleanedQuery: cleaned,
      confidence: 0.95,
    };
  }

  if (/^(yes|yes please|start navigation|give directions|navigate|haan|chalo|rasta batao|हाँ|नेविगेशन शुरू करो)$/i.test(lower)) {
    return {
      intent: 'start_navigation',
      targetModule: 'navigation',
      detectedLanguage: detectedLang,
      cleanedQuery: cleaned,
      confidence: 0.92,
    };
  }

  // 13. Smart Glasses
  if (/(smart glasses|connect glasses|glasses status|चश्मा|स्मार्ट ग्लासेस)/i.test(lower)) {
    return {
      intent: 'smart_glasses_status',
      targetModule: 'glasses',
      detectedLanguage: detectedLang,
      cleanedQuery: cleaned,
      confidence: 0.94,
    };
  }

  // 14. Help
  if (/^(help|what can you do|commands|kya kar sakte ho|madad|मदद)$/i.test(lower)) {
    return {
      intent: 'help',
      detectedLanguage: detectedLang,
      cleanedQuery: cleaned,
      confidence: 0.95,
    };
  }

  // 15. Contextual follow-up (e.g., "What is on the table?", "Is anyone near the door?")
  return {
    intent: 'contextual_followup',
    detectedLanguage: detectedLang,
    cleanedQuery: cleaned,
    confidence: 0.85,
  };
}

/**
 * Resolves contextual follow-up questions against the assistant's scene memory.
 */
export function resolveContextualFollowUp(
  question: string,
  memory: SceneMemoryState,
  language: SupportedLanguage = 'en'
): {
  resolvedAnswer: string;
  shouldTriggerModule?: AssistantModule;
} {
  const lower = question.toLowerCase();

  if (/(read|padho|book|notice|document|text)/i.test(lower)) {
    return {
      shouldTriggerModule: 'ocr',
      resolvedAnswer:
        language === 'hi'
          ? 'कृपया कैमरा टेक्स्ट या किताब की ओर रखें, मैं अभी पढ़कर सुनाता हूँ।'
          : language === 'hinglish'
          ? 'Kripya camera book ya text ki taraf rakhein, main abhi read karta hoon.'
          : 'Activating Smart OCR Reader. Please hold the camera steady toward the text.',
    };
  }

  if (/(on the table|table par kya|टेबल पर क्या)/i.test(lower)) {
    const tableObj = memory.lastObjects.find((o) => o.label.toLowerCase().includes('table'));
    const detail = tableObj?.details || 'a water bottle and a hardcover book';
    if (language === 'hi') {
      return { resolvedAnswer: `टेबल पर ${detail} रखे हुए हैं।` };
    }
    if (language === 'hinglish') {
      return { resolvedAnswer: `Table par ${detail} rakha hua hai.` };
    }
    return { resolvedAnswer: `There is ${detail} on the table.` };
  }

  if (memory.lastObjects.length > 0) {
    const summary = formatConciseSpatialSummary(
      memory.lastObjects.map((o) => ({ label: o.label, position: o.position })),
      language
    );
    return { resolvedAnswer: summary };
  }

  return {
    shouldTriggerModule: 'camera',
    resolvedAnswer:
      language === 'hi'
        ? 'आइए आपके आस-पास के दृश्य को स्कैन करते हैं।'
        : language === 'hinglish'
        ? 'Aaiye aapke aas-paas ka scene check karte hain.'
        : 'Scanning your surroundings now to answer your question.',
  };
}

const OBSTACLE_CLASSES = new Set([
  'person',
  'pedestrian',
  'car',
  'vehicle',
  'truck',
  'bus',
  'bicycle',
  'motorcycle',
  'bike',
  'stairs',
  'staircase',
  'step',
  'chair',
  'table',
  'desk',
  'door',
  'pole',
  'dog',
  'animal',
]);

const HINDI_LABELS: Record<string, string> = {
  person: 'व्यक्ति',
  car: 'गाड़ी',
  vehicle: 'वाहन',
  bike: 'बाइक',
  bicycle: 'साइकिल',
  chair: 'कुर्सी',
  table: 'मेज़ (टेबल)',
  door: 'दरवाज़ा',
  window: 'खिड़की',
  stairs: 'सीढ़ियाँ',
  bottle: 'बोतल',
  book: 'किताब',
  laptop: 'लैपटॉप',
  sign: 'साइनबोर्ड',
  tree: 'पेड़',
};

/**
 * Analyzes a YOLO / Vision bounding box to estimate relative horizontal position
 * (left, ahead, right) and obstacle priority without claiming uncalibrated exact distances.
 */
export function analyzeBoundingBoxPosition(det: RawDetectionBox): AnalyzedDetectionObject {
  const [rawYmin, rawXmin, rawYmax, rawXmax] = det.box;
  const scale = rawYmax > 1.5 || rawXmax > 1.5 ? 1000 : 1;

  const ymin = Math.max(0, Math.min(1, rawYmin / scale));
  const xmin = Math.max(0, Math.min(1, rawXmin / scale));
  const ymax = Math.max(0, Math.min(1, rawYmax / scale));
  const xmax = Math.max(0, Math.min(1, rawXmax / scale));

  const centerX = (xmin + xmax) / 2;
  const width = Math.max(0.01, xmax - xmin);
  const height = Math.max(0.01, ymax - ymin);
  const coverageRatio = Number((width * height).toFixed(3));

  let position: 'left' | 'ahead' | 'right' = 'ahead';
  if (centerX < 0.36) {
    position = 'left';
  } else if (centerX > 0.64) {
    position = 'right';
  }

  const cleanLabel = det.label.trim().toLowerCase();
  const isObstacle = OBSTACLE_CLASSES.has(cleanLabel) || coverageRatio > 0.18;

  let priority: 'critical' | 'moderate' | 'informational' = 'informational';
  if (
    cleanLabel.includes('stair') ||
    cleanLabel.includes('car') ||
    cleanLabel.includes('vehicle') ||
    (isObstacle && position === 'ahead' && coverageRatio >= 0.15)
  ) {
    priority = 'critical';
  } else if (isObstacle) {
    priority = 'moderate';
  }

  const posEn =
    position === 'ahead' ? 'ahead' : position === 'left' ? 'on your left' : 'on your right';
  const posHi =
    position === 'ahead' ? 'आपके सामने' : position === 'left' ? 'आपके बाईं ओर' : 'आपके दाईं ओर';
  const posHinglish =
    position === 'ahead'
      ? 'aapke saamne'
      : position === 'left'
      ? 'aapke left side par'
      : 'aapke right side par';

  const hiLabel = HINDI_LABELS[cleanLabel] || det.label;
  const confidencePct = Math.round(det.confidence * 100);

  let voiceAlertEn = `A ${det.label} is detected ${posEn} (${confidencePct}% confidence).`;
  let voiceAlertHi = `${posHi} ${hiLabel} दिखाई दे रहा है (${confidencePct}% विश्वास)।`;
  let voiceAlertHinglish = `${posHinglish} ek ${det.label} detect hua hai (${confidencePct}% confidence).`;

  if (cleanLabel.includes('stair')) {
    voiceAlertEn = `Stairs detected ${posEn}. Please proceed carefully.`;
    voiceAlertHi = `${posHi} सीढ़ियाँ हैं। कृपया सावधानी से आगे बढ़ें।`;
    voiceAlertHinglish = `${posHinglish} stairs detect hui hain. Kripya savdhani rakhein.`;
  } else if (priority === 'critical' && coverageRatio >= 0.2) {
    voiceAlertEn = `Close obstacle: ${det.label} directly ${posEn}. Please proceed with caution.`;
    voiceAlertHi = `निकट अवरोध: ${posHi} ${hiLabel} है। कृपया सावधानी रखें।`;
    voiceAlertHinglish = `Close obstacle: ${posHinglish} ${det.label} hai. Kripya savdhani rakhein.`;
  }

  return {
    label: det.label,
    confidence: Number(det.confidence.toFixed(2)),
    position,
    coverageRatio,
    isObstacle,
    priority,
    voiceAlertEn,
    voiceAlertHi,
    voiceAlertHinglish,
    calibrationNote:
      'Relative position estimated from 2D frame geometry. Exact metric distance requires LiDAR/depth sensor calibration.',
    normalizedBox: [ymin, xmin, ymax, xmax],
  };
}

/**
 * Formats a concise, low-latency spatial announcement ("Chair on your right. Table ahead.").
 */
export function formatConciseSpatialSummary(
  objects: Array<{ label: string; position: 'left' | 'ahead' | 'right' }>,
  language: SupportedLanguage = 'en'
): string {
  if (!objects.length) {
    if (language === 'hi') return 'सामने का रास्ता साफ दिख रहा है।';
    if (language === 'hinglish') return 'Saamne ka rasta clear dikh raha hai.';
    return 'Path ahead appears clear.';
  }

  const topItems = objects.slice(0, 4);

  if (language === 'hi') {
    return topItems
      .map((item) => {
        const labelHi = HINDI_LABELS[item.label.toLowerCase()] || item.label;
        const posHi =
          item.position === 'ahead'
            ? 'सामने'
            : item.position === 'left'
            ? 'बाईं ओर'
            : 'दाईं ओर';
        return `${posHi} ${labelHi} है`;
      })
      .join('। ') + '।';
  }

  if (language === 'hinglish') {
    return topItems
      .map((item) => {
        const pos =
          item.position === 'ahead'
            ? 'saamne'
            : item.position === 'left'
            ? 'left side par'
            : 'right side par';
        return `Aapke ${pos} ${item.label} hai`;
      })
      .join('. ') + '.';
  }

  return (
    topItems
      .map((item) => {
        const capitalized = item.label.charAt(0).toUpperCase() + item.label.slice(1);
        const pos =
          item.position === 'ahead'
            ? 'ahead'
            : item.position === 'left'
            ? 'on your left'
            : 'on your right';
        return `${capitalized} ${pos}`;
      })
      .join('. ') + '.'
  );
}

/**
 * Prevents repeating identical scene descriptions during continuous camera mode.
 * Returns true only if the spatial signature has meaningfully changed or force=true.
 */
export function shouldAnnounceSceneUpdate(
  previousObjects: Array<{ label: string; position: string }>,
  currentObjects: Array<{ label: string; position: string }>,
  elapsedMs: number,
  force = false
): boolean {
  if (force) return true;
  if (elapsedMs < 2000) return false;

  const toSignature = (items: Array<{ label: string; position: string }>) =>
    items
      .map((i) => `${i.label.toLowerCase().trim()}@${i.position}`)
      .sort()
      .join('|');

  const prevSig = toSignature(previousObjects);
  const currSig = toSignature(currentObjects);

  if (prevSig !== currSig) return true;
  // Re-confirm every 15 seconds even if static so user knows continuous mode is alive
  return elapsedMs >= 15000;
}

/**
 * Splits extracted OCR text into clean readable paragraphs for paragraph-by-paragraph voice navigation.
 */
export function splitOcrIntoParagraphs(rawText: string): string[] {
  if (!rawText || !rawText.trim()) return [];
  return rawText
    .split(/\n\s*\n|\r\n\s*\r\n|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export interface LanguageOptionMeta {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  voicePrompt: string;
  confirmationText: string;
}

export const LANGUAGE_OPTIONS: LanguageOptionMeta[] = [
  {
    code: 'hi',
    name: 'Hindi',
    nativeName: 'हिंदी',
    voicePrompt: '"Hindi mein bolo" या "हिंदी"',
    confirmationText: 'हिंदी भाषा चालू हो गई है। अब मैं हिंदी में जानकारी दूँगा।',
  },
  {
    code: 'hinglish',
    name: 'Hinglish',
    nativeName: 'Hinglish',
    voicePrompt: '"Hinglish mein bolo"',
    confirmationText: 'Hinglish mode chalu ho gaya hai. Ab main Hinglish mein bataunga.',
  },
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    voicePrompt: '"Speak in English"',
    confirmationText: 'English language is now active. I will describe everything in English.',
  },
  {
    code: 'mr',
    name: 'Marathi',
    nativeName: 'मराठी',
    voicePrompt: '"Marathi madhe bola"',
    confirmationText: 'मराठी भाषा सुरू झाली आहे. आता मी सर्व माहिती मराठीत सांगेन.',
  },
  {
    code: 'ta',
    name: 'Tamil',
    nativeName: 'தமிழ்',
    voicePrompt: '"Tamil la pesu"',
    confirmationText: 'தமிழ் மொழி செயல்படுத்தப்பட்டது. இனி நான் தமிழில் விவரிப்பேன்.',
  },
  {
    code: 'bn',
    name: 'Bengali',
    nativeName: 'বাংলা',
    voicePrompt: '"Bangla te bolo"',
    confirmationText: 'বাংলা ভাষা চালু হয়েছে। এখন मैं বাংলায় সবকিছু বলব।',
  },
  {
    code: 'gu',
    name: 'Gujarati',
    nativeName: 'ગુજરાતી',
    voicePrompt: '"Gujarati ma bolo"',
    confirmationText: 'ગુજરાતી ભાષા શરૂ થઈ ગઈ છે. હવે હું ગુજરાતીમાં માહિતી આપીશ.',
  },
  {
    code: 'te',
    name: 'Telugu',
    nativeName: 'తెలుగు',
    voicePrompt: '"Telugu lo cheppu"',
    confirmationText: 'తెలుగు భాష ప్రారంభించబడింది. ఇకపై నేను తెలుగులో వివరిస్తాను.',
  },
];

export function getLanguageConfirmation(lang: SupportedLanguage): string {
  const found = LANGUAGE_OPTIONS.find((l) => l.code === lang);
  return found ? found.confirmationText : 'Language updated.';
}

/**
 * Ultra-fast (< 1ms) instant surrounding descriptions in all 8 supported languages
 * so Live Camera scan speaks immediately with zero lag!
 */
export function getInstantSceneDescription(
  preset: 'indoor_room' | 'street_crosswalk' | 'staircase_hallway',
  lang: SupportedLanguage
): {
  conciseSummary: string;
  detailedDescription: string;
  environmentType: string;
  objects: Array<{ label: string; position: 'left' | 'ahead' | 'right'; details?: string }>;
} {
  if (preset === 'street_crosswalk') {
    const summaries: Record<SupportedLanguage, { concise: string; detailed: string; env: string }> = {
      hi: {
        concise: 'सावधान! सामने जेब्रा क्रॉसिंग है। बाईं ओर एक कार रुक रही है और दाईं ओर पैदल रास्ता साफ है।',
        detailed: 'आप एक सड़क के चौराहे पर हैं। ठीक सामने पैदल पार करने की क्रॉसवॉक है। बाईं तरफ एक नीली कार है और दाईं तरफ एक व्यक्ति खड़ा है।',
        env: 'सड़क चौराहा (Crosswalk)',
      },
      hinglish: {
        concise: 'Savdhan! Aapke saamne zebra crossing hai. Left side par ek car ruk rahi hai aur right side rasta saaf hai.',
        detailed: 'Aap ek street crosswalk ke paas hain. Saamne pedestrian crossing hai, left par ek car hai aur right side par sidewalk खुला hai.',
        env: 'Street Crosswalk',
      },
      en: {
        concise: 'Caution! Pedestrian crosswalk ahead. A car is stopping on your left; the sidewalk on your right is clear.',
        detailed: 'You are standing at an urban street crosswalk. A vehicle is on your left, a crosswalk sign is ahead, and a pedestrian is on your right.',
        env: 'Urban Crosswalk',
      },
      mr: {
        concise: 'सावधान! समोर झेब्रा क्रॉसिंग आहे. डाव्या बाजूला एक गाडी थांबत आहे आणि उजवी बाजू मोकळी आहे.',
        detailed: 'तुम्ही रस्त्याच्या क्रॉसवॉकजवळ आहात. समोर पादचारी मार्ग आहे आणि डाव्या बाजूला कार आहे.',
        env: 'रस्ता क्रॉसवॉक',
      },
      ta: {
        concise: 'கவனம்! முன்னால் நடைபாதை क्रॉஸிங் உள்ளது. இடதுபுறம் ஒரு கார் நிற்கிறது, வலதுபுறம் வழி காலியாக உள்ளது.',
        detailed: 'நீங்கள் சாலையின் குறுக்கு வழியில் இருக்கிறீர்கள். இடதுபுறம் வாகனம் உள்ளது, முன்னால் பாதை உள்ளது.',
        env: 'சாலை (Crosswalk)',
      },
      bn: {
        concise: 'সাবধান! সামনে জেব্রা ক্রসিং। বাম দিকে একটি গাড়ি থামছে এবং ডান দিকের রাস্তা পরিষ্কার।',
        detailed: 'আপনি একটি রাস্তার মোড়ে আছেন। সামনে রাস্তা পারাপারের জায়গা এবং বাম দিকে একটি গাড়ি রয়েছে।',
        env: 'রাস্তার মোড়',
      },
      gu: {
        concise: 'સાવધાન! સામે ઝેબ્રા ક્રોસિંગ છે. ડાબી બાજુ એક કાર ઊભી રહે છે અને જમણી બાજુ રસ્તો ખુલ્લો છે.',
        detailed: 'તમે રસ્તાના ક્રોસવોક પાસે છો. સામે ચાલવાનો રસ્તો છે અને ડાબી બાજુ ગાડી છે.',
        env: 'રોડ ક્રોસિંગ',
      },
      te: {
        concise: 'జాగ్రత్త! ఎదురుగా జీబ్రా క్రాసింగ్ ఉంది. ఎడమవైపు కారు ఆగుతోంది, కుడివైపు దారి ఖాళీగా ఉంది.',
        detailed: 'మీరు రోడ్డు క్రాసింగ్ వద్ద ఉన్నారు. ఎదురుగా పాదచారుల మార్గం మరియు ఎడమవైపు కారు ఉన్నాయి.',
        env: 'రోడ్డు క్రాసింగ్',
      },
    };
    const item = summaries[lang] || summaries.hinglish;
    return {
      conciseSummary: item.concise,
      detailedDescription: item.detailed,
      environmentType: item.env,
      objects: [
        { label: 'car', position: 'left', details: 'sedan stopping' },
        { label: 'crosswalk sign', position: 'ahead', details: 'pedestrian crossing' },
        { label: 'person', position: 'right', details: 'standing on sidewalk' },
      ],
    };
  }

  if (preset === 'staircase_hallway') {
    const summaries: Record<SupportedLanguage, { concise: string; detailed: string; env: string }> = {
      hi: {
        concise: 'सावधान! आपके ठीक सामने ऊपर जाने की सीढ़ियाँ हैं। दाईं ओर पकड़ने की रेलिंग है।',
        detailed: 'आप एक कॉरिडोर में हैं जहाँ ठीक सामने सीढ़ियाँ शुरू हो रही हैं। सुरक्षा के लिए दाईं तरफ की रेलिंग पकड़ें।',
        env: 'सीढ़ियों का कॉरिडोर',
      },
      hinglish: {
        concise: 'Savdhan! Aapke theek saamne seedhiyan (stairs) hain. Right side par pakadne ke liye handrail hai.',
        detailed: 'Aap staircase corridor mein hain. Saamne upar jaane ki stairs hain aur right side par support railing lagi hai.',
        env: 'Staircase Corridor',
      },
      en: {
        concise: 'Caution! Stairs ascending directly ahead. A support handrail is available on your right.',
        detailed: 'You are in an indoor hallway approaching a flight of stairs. Please use the handrail on your right side.',
        env: 'Staircase Corridor',
      },
      mr: {
        concise: 'सावधान! तुमच्या अगदी समोर पायऱ्या आहेत. उजव्या बाजूला पकडण्यासाठी रेलिंग आहे.',
        detailed: 'तुम्ही जिन्याच्या कॉरिडॉरमध्ये आहात. समोर वर जाणाऱ्या पायऱ्या आहेत आणि उजवीकडे रेलिंग आहे.',
        env: 'जिना कॉरिडॉर',
      },
      ta: {
        concise: 'கவனம்! உங்கள் முன்னால் படிக்கட்டுகள் உள்ளன. வலதுபுறம் பிடிக்க கைப்பிடி உள்ளது.',
        detailed: 'நீங்கள் படிக்கட்டு பாதையில் இருக்கிறீர்கள். பாதுகாப்பிற்கு வலதுபுற கைப்பிடியைப் பயன்படுத்தவும்.',
        env: 'படிக்கட்டு பாதை',
      },
      bn: {
        concise: 'সাবধান! আপনার ঠিক সামনে সিঁড়ি। ডান দিকে ধরার জন্য রেলিং আছে।',
        detailed: 'আপনি সিঁড়ির করিডোরে আছেন। সামনে উপরে ওঠার সিঁড়ি এবং ডান দিকে হাতল রয়েছে।',
        env: 'সিঁড়ি করিডোর',
      },
      gu: {
        concise: 'સાવધાન! તમારી બરાબર સામે સીડી (પગથિયાં) છે. જમણી બાજુ પકડવા માટે રેલિંગ છે.',
        detailed: 'તમે સીડી પાસેના કોરિડોરમાં છો. સુરક્ષા માટે જમણી બાજુની રેલિંગ પકડો.',
        env: 'સીડી કોરિડોર',
      },
      te: {
        concise: 'జాగ్రత్త! మీ ఎదురుగా మెట్లు ఉన్నాయి. కుడివైపు పట్టుకోవడానికి రెయిలింగ్ ఉంది.',
        detailed: 'మీరు మెట్ల కారిడార్‌లో ఉన్నారు. ఎదురుగా పైకి వెళ్ళే మెట్లు మరియు కుడివైపు హ్యాండ్‌రెయిల్ ఉన్నాయి.',
        env: 'మెట్ల కారిడార్',
      },
    };
    const item = summaries[lang] || summaries.hinglish;
    return {
      conciseSummary: item.concise,
      detailedDescription: item.detailed,
      environmentType: item.env,
      objects: [
        { label: 'stairs', position: 'ahead', details: 'ascending steps' },
        { label: 'handrail', position: 'right', details: 'metal support rail' },
      ],
    };
  }

  // Default: indoor_room
  const summaries: Record<SupportedLanguage, { concise: string; detailed: string; env: string }> = {
    hi: {
      concise: 'आपके सामने एक मेज़ है जिस पर पानी की बोतल और किताब रखी है। दाईं ओर कुर्सी है और बाईं ओर दरवाज़ा है।',
      detailed: 'आप एक कमरे में हैं। ठीक सामने लकड़ी की टेबल है जिस पर बोतल और किताब है। दाईं तरफ एक कुर्सी है और बाईं तरफ खुला दरवाज़ा है।',
      env: 'कमरा (Indoor Room)',
    },
    hinglish: {
      concise: 'Aapke saamne ek table hai jis par bottle aur book rakhi hai. Right side par chair hai aur left par darwaza hai.',
      detailed: 'Aap ek room mein hain. Saamne table par paani ki bottle aur book hai, right par chair hai aur left side par darwaza hai.',
      env: 'Indoor Study Room',
    },
    en: {
      concise: 'Table ahead with a water bottle and a book. Chair on your right, and a doorway on your left.',
      detailed: 'You are in an indoor room. Directly ahead is a desk with a bottle and book, a chair is on your right, and a door is on your left.',
      env: 'Indoor Study Room',
    },
    mr: {
      concise: 'तुमच्या समोर एक टेबल आहे ज्यावर पाण्याची बाटली आणि पुस्तक आहे. उजवीकडे खुर्ची आणि डावीकडे दरवाजा आहे.',
      detailed: 'तुम्ही एका खोलीत आहात. समोर टेबलवर बाटली आणि पुस्तक आहे, उजव्या बाजूला खुर्ची आणि डाव्या बाजूला दरवाजा आहे.',
      env: 'इनडोअर रूम',
    },
    ta: {
      concise: 'முன்னால் ஒரு மேஜை உள்ளது, அதன் மேல் தண்ணீர் பாட்டில் மற்றும் புத்தகம் உள்ளது. வலதுபுறம் நாற்காலி, இடதுபுறம் கதவு உள்ளது.',
      detailed: 'நீங்கள் ஒரு அறையில் இருக்கிறீர்கள். முன்னால் மேஜை, வலதுபுறம் நாற்காலி மற்றும் இடதுபுறம் கதவு உள்ளன.',
      env: 'அறை (Indoor Room)',
    },
    bn: {
      concise: 'আপনার সামনে একটি টেবিল আছে যার ওপর জলের বোতল ও বই রাখা। ডান দিকে চেয়ার এবং বাম দিকে দরজা আছে।',
      detailed: 'আপনি একটি ঘরের ভেতরে আছেন। সামনে টেবিল, ডান দিকে চেয়ার এবং বাম দিকে দরজা রয়েছে।',
      env: 'ঘর (Indoor Room)',
    },
    gu: {
      concise: 'તમારી સામે એક ટેબલ છે જેના પર પાણીની બોટલ અને પુસ્તક છે. જમણી બાજુ ખુરશી અને ડાબી બાજુ દરવાજો છે.',
      detailed: 'તમે એક રૂમમાં છો. સામે ટેબલ પર બોટલ અને પુસ્તક છે, જમણી તરફ ખુરશી અને ડાબી તરફ દરવાજો છે.',
      env: 'રૂમ (Indoor Room)',
    },
    te: {
      concise: 'మీ ఎదురుగా ఒక టేబుల్ ఉంది, దానిపై వాటర్ బాటిల్ మరియు పుస్తకం ఉన్నాయి. కుడివైపు కుర్చీ, ఎడమవైపు తలుపు ఉన్నాయి.',
      detailed: 'మీరు ఒక గదిలో ఉన్నారు. ఎదురుగా టేబుల్, కుడివైపు కుర్చీ మరియు ఎడమవైపు తలుపు ఉన్నాయి.',
      env: 'గది (Indoor Room)',
    },
  };
  const item = summaries[lang] || summaries.hinglish;
  return {
    conciseSummary: item.concise,
    detailedDescription: item.detailed,
    environmentType: item.env,
    objects: [
      { label: 'table', position: 'ahead', details: 'water bottle and book' },
      { label: 'chair', position: 'right', details: 'office chair' },
      { label: 'door', position: 'left', details: 'wooden doorway' },
    ],
  };
}

export interface UiTranslationStrings {
  appTagline: string;
  voiceBannerTitle: string;
  micActiveLabel: string;
  micPausedLabel: string;
  pushToTalkHint: string;
  inputPlaceholder: string;
  runCmdBtn: string;
  repeatBtn: string;
  stopBtn: string;
  navHome: string;
  navCamera: string;
  navOcr: string;
  navMap: string;
  navSos: string;
  quickCommandsTitle: string;
  liveMemoryTitle: string;
  moduleGridTitle: string;
  heroTitle: string;
  langHubTitle: string;
  cardCameraTitle: string;
  cardOcrTitle: string;
  cardMapTitle: string;
  cardSosTitle: string;
  scanNowBtn: string;
  webcamBtn: string;
  speakBtn: string;
  sceneRoom: string;
  sceneRoad: string;
  sceneStairs: string;
  ocrMedicine: string;
  ocrCurrency: string;
  ocrSignboard: string;
  readFullBtn: string;
  nextParaBtn: string;
  translateBtn: string;
}

const UI_DICTIONARY: Record<SupportedLanguage, UiTranslationStrings> = {
  hi: {
    appTagline: 'आपकी आवाज़ • आपकी आँखें',
    voiceBannerTitle: 'वॉइस असिस्टेंट',
    micActiveLabel: 'बोलिए...',
    micPausedLabel: 'माइक दबाएं',
    pushToTalkHint: 'Space दबाएं',
    inputPlaceholder: 'कमांड बोलें या लिखें...',
    runCmdBtn: 'चलाएं',
    repeatBtn: 'दोहराएं',
    stopBtn: 'रोकें',
    navHome: '1. वॉइस होम',
    navCamera: '2. लाइव कैमरा',
    navOcr: '3. टेक्स्ट पढ़ें',
    navMap: '4. मैप व परिवार',
    navSos: '5. आपातकालीन SOS',
    quickCommandsTitle: 'वॉइस कमांड्स',
    liveMemoryTitle: 'भाषा चुनें',
    moduleGridTitle: 'मुख्य सुविधाएं',
    heroTitle: 'बोलकर ऐप चलाएं',
    langHubTitle: 'भाषा चुनें (बोलें या दबाएं)',
    cardCameraTitle: 'लाइव कैमरा',
    cardOcrTitle: 'टेक्स्ट रीडर',
    cardMapTitle: 'परिवार और मैप',
    cardSosTitle: 'इमरजेंसी SOS',
    scanNowBtn: 'तुरंत स्कैन करें',
    webcamBtn: 'असली कैमरा',
    speakBtn: 'सुनें',
    sceneRoom: 'कमरा',
    sceneRoad: 'सड़क',
    sceneStairs: 'सीढ़ियाँ',
    ocrMedicine: 'दवाई की पर्ची',
    ocrCurrency: '₹500 का नोट',
    ocrSignboard: 'साइनबोर्ड',
    readFullBtn: 'पूरा पढ़ें',
    nextParaBtn: 'अगली लाइन',
    translateBtn: 'अनुवाद',
  },
  hinglish: {
    appTagline: 'Aapki Aavaaz • Aapki Aankhein',
    voiceBannerTitle: 'Voice Assistant',
    micActiveLabel: 'Boliye...',
    micPausedLabel: 'Mic Dabayein',
    pushToTalkHint: 'Spacebar = Mic',
    inputPlaceholder: 'Command bolein ya likhein...',
    runCmdBtn: 'Run',
    repeatBtn: 'Repeat',
    stopBtn: 'Stop',
    navHome: '1. Voice Home',
    navCamera: '2. Live Camera',
    navOcr: '3. Text Padho',
    navMap: '4. Family & Map',
    navSos: '5. Emergency SOS',
    quickCommandsTitle: 'Quick Commands',
    liveMemoryTitle: 'Language',
    moduleGridTitle: 'Main Features',
    heroTitle: 'Bol Kar App Chalayein',
    langHubTitle: 'Bhasha Chunein (Speak or Tap)',
    cardCameraTitle: 'Live Camera',
    cardOcrTitle: 'Text Padho',
    cardMapTitle: 'Family & Map',
    cardSosTitle: 'Emergency SOS',
    scanNowBtn: 'Turant Scan',
    webcamBtn: 'Real Camera',
    speakBtn: 'Sunein',
    sceneRoom: 'Kamra (Room)',
    sceneRoad: 'Sadak (Road)',
    sceneStairs: 'Seedhiyan (Stairs)',
    ocrMedicine: 'Dawai Parchi',
    ocrCurrency: '₹500 Note',
    ocrSignboard: 'Signboard',
    readFullBtn: 'Pura Padho',
    nextParaBtn: 'Next Line',
    translateBtn: 'Hindi Anuvad',
  },
  en: {
    appTagline: 'Your Voice • Your Eyes',
    voiceBannerTitle: 'Voice Assistant',
    micActiveLabel: 'Listening...',
    micPausedLabel: 'Tap Mic',
    pushToTalkHint: 'Spacebar = Mic',
    inputPlaceholder: 'Speak or type a command...',
    runCmdBtn: 'Run',
    repeatBtn: 'Repeat',
    stopBtn: 'Stop',
    navHome: '1. Voice Home',
    navCamera: '2. Live Camera',
    navOcr: '3. Read Text',
    navMap: '4. Family & Map',
    navSos: '5. Emergency SOS',
    quickCommandsTitle: 'Quick Commands',
    liveMemoryTitle: 'Language',
    moduleGridTitle: 'Core Features',
    heroTitle: 'Control by Voice',
    langHubTitle: 'Choose Language (Speak or Tap)',
    cardCameraTitle: 'Live Camera',
    cardOcrTitle: 'Text Reader',
    cardMapTitle: 'Family & Map',
    cardSosTitle: 'Emergency SOS',
    scanNowBtn: 'Instant Scan',
    webcamBtn: 'Real Camera',
    speakBtn: 'Speak',
    sceneRoom: 'Room',
    sceneRoad: 'Street',
    sceneStairs: 'Stairs',
    ocrMedicine: 'Medicine Label',
    ocrCurrency: '₹500 Note',
    ocrSignboard: 'Signboard',
    readFullBtn: 'Read All',
    nextParaBtn: 'Next Line',
    translateBtn: 'Translate',
  },
  mr: {
    appTagline: 'तुमचा आवाज • तुमचे डोळे',
    voiceBannerTitle: 'व्हॉइस असिस्टंट',
    micActiveLabel: 'बोला...',
    micPausedLabel: 'माइक दाबा',
    pushToTalkHint: 'Space दाबा',
    inputPlaceholder: 'कमांड बोला किंवा लिहा...',
    runCmdBtn: 'चालवा',
    repeatBtn: 'पुन्हा ऐका',
    stopBtn: 'थांबा',
    navHome: '1. व्हॉइस होम',
    navCamera: '2. लाईव्ह कॅमेरा',
    navOcr: '3. मजकूर वाचा',
    navMap: '4. कुटुंब आणि नकाशा',
    navSos: '5. तातडीची मदत (SOS)',
    quickCommandsTitle: 'व्हॉइस कमांड्स',
    liveMemoryTitle: 'भाषा निवडा',
    moduleGridTitle: 'मुख्य सुविधा',
    heroTitle: 'आवाजाने ॲप चालवा',
    langHubTitle: 'भाषा निवडा (बोला किंवा दाबा)',
    cardCameraTitle: 'लाईव्ह कॅमेरा',
    cardOcrTitle: 'मजकूर वाचक',
    cardMapTitle: 'कुटुंब व नकाशा',
    cardSosTitle: 'तातडीची SOS',
    scanNowBtn: 'लगेच स्कॅन करा',
    webcamBtn: 'खरा कॅमेरा',
    speakBtn: 'ऐका',
    sceneRoom: 'खोली',
    sceneRoad: 'रस्ता',
    sceneStairs: 'पायऱ्या',
    ocrMedicine: 'औषधाची चिठ्ठी',
    ocrCurrency: '₹500 नोट',
    ocrSignboard: 'फलक',
    readFullBtn: 'पूर्ण वाचा',
    nextParaBtn: 'पुढील ओळ',
    translateBtn: 'भाषांतर',
  },
  ta: {
    appTagline: 'உங்கள் குரல் • உங்கள் கண்கள்',
    voiceBannerTitle: 'குரல் உதவியாளர்',
    micActiveLabel: 'பேசுங்கள்...',
    micPausedLabel: 'மைக் அழுத்தவும்',
    pushToTalkHint: 'Space = Mic',
    inputPlaceholder: 'கட்டளையைப் பேசுங்கள்...',
    runCmdBtn: 'இயக்கு',
    repeatBtn: 'மீண்டும்',
    stopBtn: 'நிறுத்து',
    navHome: '1. முகப்பு',
    navCamera: '2. நேரடி கேமரா',
    navOcr: '3. எழுத்து படிப்பான்',
    navMap: '4. குடும்பம் & வரைபடம்',
    navSos: '5. அவசர உதவி (SOS)',
    quickCommandsTitle: 'குரல் கட்டளைகள்',
    liveMemoryTitle: 'மொழி',
    moduleGridTitle: 'முக்கிய வசதிகள்',
    heroTitle: 'குரலால் இயக்கவும்',
    langHubTitle: 'மொழியைத் தேர்ந்தெடுக்கவும்',
    cardCameraTitle: 'நேரடி கேமரா',
    cardOcrTitle: 'எழுத்து படிப்பான்',
    cardMapTitle: 'குடும்பம் & வழி',
    cardSosTitle: 'அவசர SOS',
    scanNowBtn: 'உடனடி ஸ்கேன்',
    webcamBtn: 'கேமரா',
    speakBtn: 'கேட்க',
    sceneRoom: 'அறை',
    sceneRoad: 'சாலை',
    sceneStairs: 'படிக்கட்டு',
    ocrMedicine: 'மருந்து சீட்டு',
    ocrCurrency: '₹500 நோட்டு',
    ocrSignboard: 'பலகை',
    readFullBtn: 'முழுவதும் படி',
    nextParaBtn: 'அடுத்த வரி',
    translateBtn: 'மொழிபெயர்',
  },
  bn: {
    appTagline: 'আপনার কণ্ঠ • আপনার চোখ',
    voiceBannerTitle: 'ভয়েস অ্যাসিস্ট্যান্ট',
    micActiveLabel: 'বলুন...',
    micPausedLabel: 'মাইক চাপুন',
    pushToTalkHint: 'Space = Mic',
    inputPlaceholder: 'কমান্ড বলুন বা লিখুন...',
    runCmdBtn: 'চালান',
    repeatBtn: 'পুনরায়',
    stopBtn: 'থামুন',
    navHome: '1. ভয়েস হোম',
    navCamera: '2. লাইভ ক্যামেরা',
    navOcr: '3. লেখা পড়ুন',
    navMap: '4. পরিবার ও ম্যাপ',
    navSos: '5. জরুরি SOS',
    quickCommandsTitle: 'ভয়েস কমান্ড',
    liveMemoryTitle: 'ভাষা',
    moduleGridTitle: 'প্রধান সুবিধা',
    heroTitle: 'কণ্ঠস্বরে অ্যাপ চালান',
    langHubTitle: 'ভাষা বেছে নিন (বলুন বা চাপুন)',
    cardCameraTitle: 'লাইভ ক্যামেরা',
    cardOcrTitle: 'টেক্সট রিডার',
    cardMapTitle: 'পরিবার ও ম্যাপ',
    cardSosTitle: 'জরুরি SOS',
    scanNowBtn: 'দ্রুত স্ক্যান',
    webcamBtn: 'আসল ক্যামেরা',
    speakBtn: 'শুনুন',
    sceneRoom: 'ঘর',
    sceneRoad: 'রাস্তা',
    sceneStairs: 'সিঁড়ি',
    ocrMedicine: 'ওষুধের কাগজ',
    ocrCurrency: '₹500 নোট',
    ocrSignboard: 'সাইনবোর্ড',
    readFullBtn: 'পুরোটা পড়ুন',
    nextParaBtn: 'পরের লাইন',
    translateBtn: 'অনুবাদ',
  },
  gu: {
    appTagline: 'તમારો અવાજ • તમારી આંખો',
    voiceBannerTitle: 'વોઇસ આસિસ્ટન્ટ',
    micActiveLabel: 'બોલો...',
    micPausedLabel: 'માઇક દબાવો',
    pushToTalkHint: 'Space = Mic',
    inputPlaceholder: 'કમાન્ડ બોલો અથવા લખો...',
    runCmdBtn: 'ચલાવો',
    repeatBtn: 'ફરીથી',
    stopBtn: 'રોકો',
    navHome: '1. વોઇસ હોમ',
    navCamera: '2. લાઇવ કેમેરા',
    navOcr: '3. લખાણ વાંચો',
    navMap: '4. પરિવાર અને નકશો',
    navSos: '5. કટોકટી SOS',
    quickCommandsTitle: 'વોઇસ કમાન્ડ',
    liveMemoryTitle: 'ભાષા',
    moduleGridTitle: 'મુખ્ય સુવિધાઓ',
    heroTitle: 'બોલીને એપ ચલાવો',
    langHubTitle: 'ભાષા પસંદ કરો (બોલો અથવા દબાવો)',
    cardCameraTitle: 'લાઇવ કેમેરા',
    cardOcrTitle: 'ટેક્સ્ટ રીડર',
    cardMapTitle: 'પરિવાર અને મેપ',
    cardSosTitle: 'ઇમરજન્સી SOS',
    scanNowBtn: 'તરત સ્કેન કરો',
    webcamBtn: 'કેમેરા',
    speakBtn: 'સાંભળો',
    sceneRoom: 'રૂમ',
    sceneRoad: 'રસ્તો',
    sceneStairs: 'સીડી',
    ocrMedicine: 'દવાની ચિઠ્ઠી',
    ocrCurrency: '₹500 નોટ',
    ocrSignboard: 'બોર્ડ',
    readFullBtn: 'पूरा વાંચો',
    nextParaBtn: 'આગળની લાઇન',
    translateBtn: 'અનુવાદ',
  },
  te: {
    appTagline: 'మీ గొంతు • మీ కళ్ళు',
    voiceBannerTitle: 'వాయిస్ అసిస్టెంట్',
    micActiveLabel: 'మాట్లాడండి...',
    micPausedLabel: 'మైక్ నొక్కండి',
    pushToTalkHint: 'Space = Mic',
    inputPlaceholder: 'ఆదేశం చెప్పండి లేదా టైప్ చేయండి...',
    runCmdBtn: 'రన్',
    repeatBtn: 'మళ్ళీ వినండి',
    stopBtn: 'ఆపు',
    navHome: '1. వాయిస్ హోమ్',
    navCamera: '2. లైవ్ కెమెరా',
    navOcr: '3. టెక్స్ట్ చదవండి',
    navMap: '4. కుటుంబం & మ్యాప్',
    navSos: '5. అత్యవసర SOS',
    quickCommandsTitle: 'వాయిస్ కమాండ్స్',
    liveMemoryTitle: 'భాష',
    moduleGridTitle: 'ప్రధాన ఫీచర్లు',
    heroTitle: 'మాటతో యాప్ నడపండి',
    langHubTitle: 'భాష ఎంచుకోండి (చెప్పండి / నొక్కండి)',
    cardCameraTitle: 'లైవ్ కెమెరా',
    cardOcrTitle: 'టెక్స్ట్ రీడర్',
    cardMapTitle: 'కుటుంబం & మ్యాప్',
    cardSosTitle: 'ఎమర్జెన్సీ SOS',
    scanNowBtn: 'తక్షణ స్కాన్',
    webcamBtn: 'రియల్ కెమెరా',
    speakBtn: 'వినండి',
    sceneRoom: 'గది',
    sceneRoad: 'రోడ్డు',
    sceneStairs: 'మెట్లు',
    ocrMedicine: 'మందుల చీటీ',
    ocrCurrency: '₹500 నోటు',
    ocrSignboard: 'బోర్డు',
    readFullBtn: 'మొత్తం చదవండి',
    nextParaBtn: 'తదుపరి లైన్',
    translateBtn: 'అనువాదం',
  },
};

export function getUiTranslations(lang: SupportedLanguage): UiTranslationStrings {
  return UI_DICTIONARY[lang] || UI_DICTIONARY.hinglish;
}

export interface SavedContactCandidate {
  id: string;
  name: string;
  relation: string;
  phone: string;
  priority?: number;
}

/**
 * Resolves which saved contact to call when the user says "call", "call karo",
 * "call mummy", "call brother", "call Aarav", "call 2", etc.
 * If no specific name/relation is mentioned, defaults to the #1 primary saved contact.
 */
export function resolveSavedContactToCall(
  rawQuery: string,
  emergencyContacts: SavedContactCandidate[],
  familyMembers: SavedContactCandidate[] = []
): SavedContactCandidate | null {
  const combined: SavedContactCandidate[] = [];
  const seenPhones = new Set<string>();

  const sortedEmergency = [...emergencyContacts].sort(
    (a, b) => (a.priority ?? 99) - (b.priority ?? 99)
  );

  for (const c of [...sortedEmergency, ...familyMembers]) {
    if (!c.phone) continue;
    const normPhone = c.phone.replace(/\s+/g, '');
    if (!seenPhones.has(normPhone)) {
      seenPhones.add(normPhone);
      combined.push(c);
    }
  }

  if (combined.length === 0) return null;

  const q = (rawQuery || '').toLowerCase().trim();
  if (!q) return combined[0];

  // 1. Direct name or phone match
  for (const contact of combined) {
    const nameParts = contact.name
      .toLowerCase()
      .split(/[\s.]+/)
      .filter((w) => w.length >= 3 && w !== 'dr');
    if (nameParts.some((part) => q.includes(part))) {
      return contact;
    }
    const cleanDigits = contact.phone.replace(/\D/g, '');
    if (cleanDigits.length >= 3 && q.includes(cleanDigits)) {
      return contact;
    }
  }

  // 2. Relationship synonyms (Mother/Mummy, Brother/Bhai, Doctor, Father/Papa, Emergency/112)
  if (/(mother|mummy|mom|maa|ammi|aai|मम्मी|माँ|माता|आई)/i.test(q)) {
    const motherMatch = combined.find((c) =>
      /(mother|mummy|mom|meera)/i.test(`${c.name} ${c.relation}`)
    );
    if (motherMatch) return motherMatch;
  }

  if (/(brother|bhai|bhaiya|dada|भाई|भैया)/i.test(q)) {
    const brotherMatch = combined.find((c) =>
      /(brother|bhai|aarav)/i.test(`${c.name} ${c.relation}`)
    );
    if (brotherMatch) return brotherMatch;
  }

  if (/(doctor|dr|specialist|clinic|hospital|डॉक्टर)/i.test(q)) {
    const docMatch = combined.find((c) =>
      /(dr|doctor|specialist|kabir)/i.test(`${c.name} ${c.relation}`)
    );
    if (docMatch) return docMatch;
  }

  if (/(father|papa|dad|baba|पापा|पिता)/i.test(q)) {
    const fatherMatch = combined.find((c) =>
      /(father|papa|dad)/i.test(`${c.name} ${c.relation}`)
    );
    if (fatherMatch) return fatherMatch;
  }

  if (/(112|police|ambulance|helpline|control room|पुलिस|एम्बुलेंस)/i.test(q)) {
    const helplineMatch = combined.find(
      (c) => c.phone.includes('112') || /dispatch|response/i.test(c.name)
    );
    if (helplineMatch) return helplineMatch;
  }

  // 3. Ordinal/index selection ("call 2", "second number", "doosra number")
  if (/\b(2|second|two|doosra|dusra|दूसरा)\b/i.test(q) && combined[1]) {
    return combined[1];
  }
  if (/\b(3|third|three|teesra|तीसरा)\b/i.test(q) && combined[2]) {
    return combined[2];
  }

  // 4. Default: pick the #1 Primary Saved Contact when user simply says "call" or "call karo"
  return combined[0];
}

/**
 * Formats a clear spoken announcement in all 8 supported languages when dialing a saved contact.
 */
export function formatVoiceCallAnnouncement(
  contact: SavedContactCandidate,
  lang: SupportedLanguage
): string {
  switch (lang) {
    case 'hi':
      return `आपके सेव नंबर ${contact.name} (${contact.phone}) पर कॉल लगाया जा रहा है।`;
    case 'hinglish':
      return `Aapke save number ${contact.name} (${contact.phone}) par call lagaya ja raha hai.`;
    case 'mr':
      return `तुमच्या सेव्ह केलेल्या नंबरवर ${contact.name} (${contact.phone}) कॉल लावला जात आहे.`;
    case 'ta':
      return `உங்கள் சேமிக்கப்பட்ட எண் ${contact.name} (${contact.phone}) க்கு அழைப்பு இணைக்கப்படுகிறது.`;
    case 'bn':
      return `আপনার সেভ করা নম্বর ${contact.name} (${contact.phone}) এ কল করা হচ্ছে।`;
    case 'gu':
      return `તમારા સેવ કરેલા નંબર ${contact.name} (${contact.phone}) પર કોલ લગાડવામાં આવી રહ્યો છે.`;
    case 'te':
      return `మీ సేవ్ చేసిన నంబర్ ${contact.name} (${contact.phone}) కు కాల్ చేయబడుతోంది.`;
    default:
      return `Calling your saved contact ${contact.name} at ${contact.phone}.`;
  }
}

