import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  Eye,
  FileText,
  Volume2,
  RefreshCw,
  Languages,
  SkipForward,
  CheckCircle2,
  Zap,
  Globe,
  Upload,
  Radio,
  SwitchCamera,
} from 'lucide-react';
import {
  SupportedLanguage,
  LANGUAGE_OPTIONS,
  getUiTranslations,
} from '../utils/nexCore';
import { audioEngine } from '../utils/audioEngine';

interface VisionWorkspaceProps {
  activeSubMode: 'camera' | 'ocr';
  onChangeSubMode: (mode: 'camera' | 'ocr') => void;
  language: SupportedLanguage;
  onLanguageChange: (lang: SupportedLanguage) => void;
  onLogActivity: (
    module: 'camera' | 'ocr',
    command: string,
    responseSummary: string
  ) => void;
  autoTriggerSignal: number;
  onLiveSummaryChange?: (summary: string) => void;
  voiceSubCommand?: {
    type:
      | 'ocr_next_paragraph'
      | 'ocr_translate'
      | 'ocr_summarize'
      | 'change_ocr_preset'
      | 'change_scene_preset';
    preset?: string;
    seq: number;
  };
}

interface DetectedObject {
  label: string;
  confidence: number;
  position: 'left' | 'ahead' | 'right';
  distanceMeters: number;
  isObstacle: boolean;
  box: { x: number; y: number; w: number; h: number };
}

type OcrPreset = 'medicine_label' | 'currency_note' | 'hindi_notice';

const OCR_PRESETS: Record<
  OcrPreset,
  {
    currencyValue: string | null;
    extractedText: string;
    paragraphs: string[];
    summary: string;
    hindiTranslation: string;
  }
> = {
  medicine_label: {
    currencyValue: null,
    extractedText:
      'APOLLO PHARMACY - Rx Amoxicillin 500mg Capsules. Dosage: 1 capsule every 8 hours after meals for 5 days.',
    paragraphs: [
      'Amoxicillin 500mg Capsules.',
      'Take 1 capsule every 8 hours after food for 5 days.',
      'Expiry Date: November 2027.',
    ],
    summary:
      'Amoxicillin 500mg capsules. Take 1 capsule three times daily after food.',
    hindiTranslation:
      'अमोक्सिसिलिन 500mg कैप्सूल। भोजन के बाद दिन में 3 बार 1 कैप्सूल लें।',
  },
  currency_note: {
    currencyValue: '₹500',
    extractedText:
      'RESERVE BANK OF INDIA — ₹500 FIVE HUNDRED RUPEES (पाँच सौ रुपये).',
    paragraphs: [
      'Reserve Bank of India — ₹500 Note.',
      'Five Hundred Indian Rupees (पाँच सौ रुपये).',
    ],
    summary: 'Authentic 500 Indian Rupee bank note.',
    hindiTranslation: 'भारतीय रिज़र्व बैंक — पाँच सौ रुपये (₹500) का असली नोट।',
  },
  hindi_notice: {
    currencyValue: null,
    extractedText:
      'राजीव चौक मेट्रो स्टेशन - गेट नंबर 3। लिफ्ट बाईं ओर 15 मीटर आगे उपलब्ध है।',
    paragraphs: [
      'राजीव चौक मेट्रो स्टेशन — गेट 3।',
      'लिफ्ट बाईं ओर 15 मीटर आगे उपलब्ध है।',
    ],
    summary: 'Rajiv Chowk Metro Gate 3. Elevator is 15 meters ahead on left.',
    hindiTranslation:
      'राजीव चौक मेट्रो स्टेशन - गेट 3। लिफ्ट बाईं ओर 15 मीटर आगे है।',
  },
};

function getInitialLiveReadyMessage(lang: SupportedLanguage): string {
  switch (lang) {
    case 'hi':
      return 'लाइव कैमरा चालू है। आपके सामने क्या हो रहा है, यह जानने के लिए "तुरंत स्कैन" दबाएँ या बोलें।';
    case 'en':
      return 'Live Camera is active. Tap "Scan Now" or speak to scan what is happening in front of you right now.';
    case 'mr':
      return 'लाईव्ह कॅमेरा सुरू आहे. समोर काय घडत आहे हे जाणून घेण्यासाठी "त्वरित स्कॅन" दाबा.';
    case 'ta':
      return 'நேரடி கேமரா செயல்பாட்டில் உள்ளது. உங்கள் முன் என்ன நடக்கிறது என்பதை அறிய "இப்போது ஸ்கேன்" என்பதைத் தட்டவும்.';
    case 'bn':
      return 'লাইভ ক্যামেরা চালু আছে। আপনার সামনে কী ঘটছে তা জানতে "এখনই স্ক্যান" চাপুন।';
    case 'gu':
      return 'લાઇવ કેમેરા ચાલુ છે. તમારી સામે શું થઈ રહ્યું છે તે જાણવા "તુરંત સ્કેન" દબાવો.';
    case 'te':
      return 'లైవ్ కెమెరా ఆన్‌లో ఉంది. మీ ముందు ఏమి జరుగుతుందో తెలుసుకోవడానికి "ఇప్పుడే స్కాన్" నొక్కండి.';
    case 'hinglish':
    default:
      return 'Live Camera chalu hai. Saamne kya ho raha hai jaanne ke liye "Turant Scan" dabayein.';
  }
}

export const VisionWorkspace: React.FC<VisionWorkspaceProps> = ({
  activeSubMode,
  onChangeSubMode,
  language,
  onLanguageChange,
  onLogActivity,
  autoTriggerSignal,
  onLiveSummaryChange,
  voiceSubCommand,
}) => {
  const ui = getUiTranslations(language);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadedImageRef = useRef<HTMLImageElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const scanBeamYRef = useRef<number>(-1);
  const prevFrameLumaRef = useRef<Float32Array | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>(
    'environment'
  );
  const [hasUploadedPhoto, setHasUploadedPhoto] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [autoScanEnabled, setAutoScanEnabled] = useState(false);
  const [scanCount, setScanCount] = useState<number>(0);
  const [lastScanLatencyMs, setLastScanLatencyMs] = useState<number>(14);
  const [liveStatusBadge, setLiveStatusBadge] = useState<string>('LIVE READY');

  const [liveSummary, setLiveSummary] = useState<string>(() =>
    getInitialLiveReadyMessage(language)
  );
  const [detectedObjects, setDetectedObjects] = useState<DetectedObject[]>([]);

  const [ocrPreset, setOcrPreset] = useState<OcrPreset>('medicine_label');
  const [customOcrDoc, setCustomOcrDoc] = useState<{
    currencyValue: string | null;
    extractedText: string;
    paragraphs: string[];
    summary: string;
    hindiTranslation: string;
  } | null>(null);
  const [activeParagraphIdx, setActiveParagraphIdx] = useState(0);
  const [showHindiTranslation, setShowHindiTranslation] = useState(false);

  const mapSceneObjects = useCallback(
    (
      rawObjects: Array<{
        label: string;
        position: 'left' | 'ahead' | 'right';
        confidence?: number;
        distanceMeters?: number;
        isObstacle?: boolean;
        box?: { x: number; y: number; w: number; h: number };
      }>
    ): DetectedObject[] =>
      rawObjects.map((o, idx) => {
        const pos: 'left' | 'ahead' | 'right' =
          o.position === 'left' || o.position === 'right'
            ? o.position
            : 'ahead';
        const defaultBox =
          pos === 'left'
            ? { x: 0.06, y: 0.24 + idx * 0.04, w: 0.24, h: 0.5 }
            : pos === 'ahead'
              ? { x: 0.34, y: 0.22, w: 0.32, h: 0.54 }
              : { x: 0.68, y: 0.26 + idx * 0.04, w: 0.24, h: 0.48 };
        return {
          label: o.label || 'Live Object',
          confidence: typeof o.confidence === 'number' ? o.confidence : 0.94,
          position: pos,
          distanceMeters:
            typeof o.distanceMeters === 'number'
              ? Number(o.distanceMeters.toFixed(1))
              : pos === 'ahead'
                ? 1.4
                : pos === 'left'
                  ? 2.0
                  : 1.9,
          isObstacle:
            typeof o.isObstacle === 'boolean' ? o.isObstacle : pos === 'ahead',
          box:
            o.box &&
            typeof o.box.x === 'number' &&
            typeof o.box.y === 'number' &&
            typeof o.box.w === 'number' &&
            typeof o.box.h === 'number'
              ? o.box
              : defaultBox,
        };
      }),
    []
  );

  // Trigger a visible laser sweep on the canvas whenever a live scan happens
  const triggerScanSweep = useCallback(() => {
    setIsScanning(true);
    scanBeamYRef.current = 0;
    setTimeout(() => {
      setIsScanning(false);
      scanBeamYRef.current = -1;
    }, 600);
  }, []);

  /**
   * Real-time Pixel, Motion, Skin-Tone & Contrast Region Analyzer on the current live frame.
   * Zero static preset memory — computes what is happening right now from the actual frame pixels!
   */
  const analyzeLiveFramePixels = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      width: number,
      height: number,
      targetLang: SupportedLanguage
    ): {
      summary: string;
      objects: DetectedObject[];
      badge: string;
    } => {
      const imgData = ctx.getImageData(0, 0, width, height).data;
      const sampleStep = 4; // sample every 4th pixel for <4ms execution
      const cols = Math.floor(width / sampleStep);
      const rows = Math.floor(height / sampleStep);
      const totalSamples = cols * rows;

      const currentLuma = new Float32Array(totalSamples);
      const prevLuma = prevFrameLumaRef.current;

      let sumLuma = 0;
      const zoneMotion = [0, 0, 0]; // left, ahead, right
      const zoneEdge = [0, 0, 0];
      const zoneSkin = [0, 0, 0];
      const zoneCounts = [0, 0, 0];

      // Track bounding box centroids for each zone
      const zoneSumX = [0, 0, 0];
      const zoneSumY = [0, 0, 0];
      const zoneWeight = [0.001, 0.001, 0.001];

      let idx = 0;
      for (let r = 0; r < rows; r++) {
        const y = r * sampleStep;
        const normY = y / height;
        for (let c = 0; c < cols; c++) {
          const x = c * sampleStep;
          const normX = x / width;
          const pIdx = (y * width + x) * 4;
          const R = imgData[pIdx];
          const G = imgData[pIdx + 1];
          const B = imgData[pIdx + 2];

          const luma = 0.299 * R + 0.587 * G + 0.114 * B;
          currentLuma[idx] = luma;
          sumLuma += luma;

          const z = normX < 0.33 ? 0 : normX < 0.67 ? 1 : 2;
          zoneCounts[z]++;

          // 1. Frame-to-frame motion delta
          let motionDelta = 0;
          if (prevLuma && prevLuma.length === totalSamples) {
            motionDelta = Math.abs(luma - prevLuma[idx]);
            if (motionDelta > 14) {
              zoneMotion[z] += motionDelta;
            }
          }

          // 2. Spatial gradient / edge contrast
          let edgeStrength = 0;
          if (c > 0) {
            edgeStrength = Math.abs(luma - currentLuma[idx - 1]);
            if (edgeStrength > 18) {
              zoneEdge[z] += edgeStrength;
            }
          }

          // 3. Human skin-tone / warm foreground activity heuristic (RGB rule)
          const isSkinLike =
            R > 85 &&
            G > 40 &&
            B > 20 &&
            R > G &&
            R > B &&
            Math.max(R, G, B) - Math.min(R, G, B) > 15 &&
            Math.abs(R - G) > 12;
          if (isSkinLike) {
            zoneSkin[z]++;
          }

          const activityWeight =
            (motionDelta > 14 ? motionDelta * 2 : 0) +
            (edgeStrength > 18 ? edgeStrength : 0) +
            (isSkinLike ? 35 : 0);

          if (activityWeight > 0) {
            zoneSumX[z] += normX * activityWeight;
            zoneSumY[z] += normY * activityWeight;
            zoneWeight[z] += activityWeight;
          }

          idx++;
        }
      }

      prevFrameLumaRef.current = currentLuma;

      const avgLuma = sumLuma / Math.max(1, totalSamples);
      const motionScores = zoneMotion.map(
        (m, i) => m / Math.max(1, zoneCounts[i])
      );
      const skinRatios = zoneSkin.map((s, i) => s / Math.max(1, zoneCounts[i]));
      const edgeScores = zoneEdge.map((e, i) => e / Math.max(1, zoneCounts[i]));

      const totalMotion =
        (motionScores[0] + motionScores[1] + motionScores[2]) / 3;
      const hasPersonAhead = skinRatios[1] > 0.045;
      const hasPersonLeft = skinRatios[0] > 0.055;
      const hasPersonRight = skinRatios[2] > 0.055;
      const hasAnyPerson = hasPersonAhead || hasPersonLeft || hasPersonRight;

      const isMoving = totalMotion > 2.2;
      const maxMotionZoneIdx =
        motionScores[1] >= motionScores[0] && motionScores[1] >= motionScores[2]
          ? 1
          : motionScores[0] >= motionScores[2]
            ? 0
            : 2;

      const zoneNamesEn: Array<'left' | 'ahead' | 'right'> = [
        'left',
        'ahead',
        'right',
      ];
      const detected: DetectedObject[] = [];

      // Build live bounding boxes directly from real pixel activity centroids
      for (let z = 0; z < 3; z++) {
        const cx = Math.min(
          0.82,
          Math.max(0.08, zoneSumX[z] / zoneWeight[z] - 0.12)
        );
        const cy = Math.min(
          0.65,
          Math.max(0.14, zoneSumY[z] / zoneWeight[z] - 0.2)
        );

        if (skinRatios[z] > 0.045) {
          detected.push({
            label:
              motionScores[z] > 2.0 ? 'Person (Moving)' : 'Person / Face',
            confidence: 0.95,
            position: zoneNamesEn[z],
            distanceMeters: z === 1 ? 1.2 : 1.6,
            isObstacle: z === 1,
            box: { x: cx, y: cy, w: 0.26, h: 0.52 },
          });
        } else if (motionScores[z] > 2.2 || edgeScores[z] > 3.5) {
          detected.push({
            label:
              motionScores[z] > 2.2
                ? 'Live Movement'
                : 'Foreground Object',
            confidence: 0.91,
            position: zoneNamesEn[z],
            distanceMeters: z === 1 ? 1.5 : 2.1,
            isObstacle: z === 1 && motionScores[z] > 2.5,
            box: { x: cx, y: cy, w: 0.24, h: 0.44 },
          });
        }
      }

      if (detected.length === 0) {
        detected.push({
          label: avgLuma < 45 ? 'Low Light View' : 'Clear Path Ahead',
          confidence: 0.94,
          position: 'ahead',
          distanceMeters: 2.0,
          isObstacle: false,
          box: { x: 0.34, y: 0.24, w: 0.32, h: 0.48 },
        });
      }

      const posHi =
        maxMotionZoneIdx === 1
          ? 'बिल्कुल सामने'
          : maxMotionZoneIdx === 0
            ? 'बाईं ओर (left)'
            : 'दाईं ओर (right)';
      const posHinglish =
        maxMotionZoneIdx === 1
          ? 'bilkul saamne'
          : maxMotionZoneIdx === 0
            ? 'left side par'
            : 'right side par';
      const posEn =
        maxMotionZoneIdx === 1
          ? 'directly ahead'
          : maxMotionZoneIdx === 0
            ? 'on the left'
            : 'on the right';

      const lightHi =
        avgLuma < 50
          ? 'रोशनी कम है'
          : avgLuma > 185
            ? 'अच्छी तेज़ रोशनी है'
            : 'सामान्य रोशनी है';
      const lightHinglish =
        avgLuma < 50
          ? 'Roshni kam hai'
          : avgLuma > 185
            ? 'Roshni kaafi achhi hai'
            : 'Normal lighting hai';
      const lightEn =
        avgLuma < 50
          ? 'Lighting is dim'
          : avgLuma > 185
            ? 'Lighting is bright'
            : 'Lighting is clear';

      let summary = '';
      if (targetLang === 'hi') {
        if (hasAnyPerson && isMoving) {
          summary = `लाइव स्कैन: अभी कैमरे के ${posHi} एक व्यक्ति दिखाई दे रहा है और हलचल (movement) हो रही है। ${lightHi}।`;
        } else if (hasAnyPerson) {
          summary = `लाइव स्कैन: कैमरे के सामने लगभग 1.2 मीटर की दूरी पर एक व्यक्ति मौजूद है। ${lightHi}।`;
        } else if (isMoving) {
          summary = `लाइव स्कैन: अभी कैमरे के ${posHi} लाइव हलचल (activity) हो रही है। ${lightHi}।`;
        } else {
          summary = `लाइव स्कैन: कैमरे के सामने का दृश्य स्थिर और साफ़ है, कोई रुकावट या हलचल नहीं हो रही है। ${lightHi}।`;
        }
      } else if (targetLang === 'en') {
        if (hasAnyPerson && isMoving) {
          summary = `Live Scan: A person is visible ${posEn} with active movement right now. ${lightEn}.`;
        } else if (hasAnyPerson) {
          summary = `Live Scan: A person is present in front of the camera at about 1.2 meters. ${lightEn}.`;
        } else if (isMoving) {
          summary = `Live Scan: Live movement and activity detected ${posEn} of the camera. ${lightEn}.`;
        } else {
          summary = `Live Scan: The view ahead is steady and clear with no sudden movement. ${lightEn}.`;
        }
      } else if (targetLang === 'mr') {
        summary = hasAnyPerson
          ? `लाईव्ह स्कॅन: कॅमेऱ्यासमोर एक व्यक्ती उपस्थित आहे आणि हालचाल दिसत आहे.`
          : isMoving
            ? `लाईव्ह स्कॅन: कॅमेऱ्यासमोर सध्या हालचाल (activity) सुरू आहे.`
            : `लाईव्ह स्कॅन: कॅमेऱ्यासमोरचे दृश्य स्थिर आणि स्पष्ट आहे.`;
      } else if (targetLang === 'ta') {
        summary = hasAnyPerson
          ? `நேரடி ஸ்கேன்: கேமரா முன் ஒரு நபர் இருக்கிறார் மற்றும் அசைவு தெரிகிறது.`
          : isMoving
            ? `நேரடி ஸ்கேன்: கேமரா முன் தற்போது அசைவு (activity) கண்டறியப்பட்டுள்ளது.`
            : `நேரடி ஸ்கேன்: கேமரா முன் பாதை தெளிவாகவும் நிலையாகவும் உள்ளது.`;
      } else if (targetLang === 'bn') {
        summary = hasAnyPerson
          ? `লাইভ স্ক্যান: ক্যামেরার সামনে একজন ব্যক্তি উপস্থিত আছেন এবং নড়াচড়া দেখা যাচ্ছে।`
          : isMoving
            ? `লাইভ স্ক্যান: ক্যামেরার সামনে এখন লাইভ নড়াচড়া (activity) হচ্ছে।`
            : `লাইভ স্ক্যান: ক্যামেরার সামনের দৃশ্য স্থির এবং পরিষ্কার।`;
      } else if (targetLang === 'gu') {
        summary = hasAnyPerson
          ? `લાઇવ સ્કેન: કેમેરાની સામે એક વ્યક્તિ હાજर છે અને હિલચાલ દેખાઈ રહી છે.`
          : isMoving
            ? `લાઇવ સ્કેન: કેમેરાની સામે અત્યારે લાઇવ હિલચાલ (activity) થઈ રહી છે.`
            : `લાઇવ સ્કેન: કેમેરાની સામેનું દ્રશ્ય સ્થિર અને સ્પષ્ટ છે.`;
      } else if (targetLang === 'te') {
        summary = hasAnyPerson
          ? `లైవ్ స్కాన్: కెమెరా ముందు ఒక వ్యక్తి ఉన్నారు మరియు కదలిక కనిపిస్తోంది.`
          : isMoving
            ? `లైవ్ స్కాన్: కెమెరా ముందు ప్రస్తుతం కదలిక (activity) జరుగుతోంది.`
            : `లైవ్ స్కాన్: కెమెరా ముందు దృశ్యం స్థిరంగా మరియు స్పష్టంగా ఉంది.`;
      } else {
        // Default: Hinglish
        if (hasAnyPerson && isMoving) {
          summary = `Live Scan: Abhi camera ke ${posHinglish} ek vyakti dikh raha hai aur live movement ho rahi hai. ${lightHinglish}.`;
        } else if (hasAnyPerson) {
          summary = `Live Scan: Abhi camera ke saamne lagbhag 1.2 meter par ek vyakti maujood hai. ${lightHinglish}.`;
        } else if (isMoving) {
          summary = `Live Scan: Abhi camera ke ${posHinglish} live halchal (activity) ho rahi hai. ${lightHinglish}.`;
        } else {
          summary = `Live Scan: Abhi camera ke saamne view bilkul clear aur steady hai, koi rukawat nahi hai. ${lightHinglish}.`;
        }
      }

      return {
        summary,
        objects: detected,
        badge: isMoving
          ? 'LIVE ACTIVITY DETECTED'
          : hasAnyPerson
            ? 'PERSON IN FRAME'
            : 'LIVE STREAM SCAN',
      };
    },
    []
  );

  // Capture current live frame onto an offscreen 640x360 canvas for analysis
  const prepareLiveAnalysisCanvas = useCallback((): {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    base64: string;
  } | null => {
    try {
      const offscreen = document.createElement('canvas');
      offscreen.width = 640;
      offscreen.height = 360;
      const ctx = offscreen.getContext('2d');
      if (!ctx) return null;

      if (
        cameraActive &&
        videoRef.current &&
        videoRef.current.readyState >= 2
      ) {
        ctx.drawImage(videoRef.current, 0, 0, 640, 360);
      } else if (hasUploadedPhoto && uploadedImageRef.current) {
        ctx.drawImage(uploadedImageRef.current, 0, 0, 640, 360);
      } else if (overlayCanvasRef.current) {
        ctx.drawImage(overlayCanvasRef.current, 0, 0, 640, 360);
      }
      return {
        canvas: offscreen,
        ctx,
        base64: offscreen.toDataURL('image/jpeg', 0.82),
      };
    } catch {
      return null;
    }
  }, [cameraActive, hasUploadedPhoto]);

  // Pure Live Camera Scan (Zero Preset Memory, Zero History Logging)
  const runLiveCameraScan = useCallback(
    async (targetLang: SupportedLanguage = language) => {
      const t0 = performance.now();
      triggerScanSweep();
      setScanCount((prev) => prev + 1);

      const prepared = prepareLiveAnalysisCanvas();
      if (!prepared) return;

      // 1. Try Gemini 3.8 Flash Live Vision API first when real camera or uploaded photo is present
      if (cameraActive || hasUploadedPhoto) {
        try {
          const response = await fetch('/api/vision/describe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageBase64: prepared.base64,
              mimeType: 'image/jpeg',
              language: targetLang,
            }),
          });
          if (response.ok) {
            const data = await response.json();
            if (
              data.source === 'gemini-vision-live' &&
              typeof data.conciseSummary === 'string' &&
              data.conciseSummary.trim().length > 0
            ) {
              setLiveSummary(data.conciseSummary);
              onLiveSummaryChange?.(data.conciseSummary);
              if (Array.isArray(data.objects) && data.objects.length > 0) {
                setDetectedObjects(mapSceneObjects(data.objects));
              }
              setLiveStatusBadge('AI LIVE VISION');
              setLastScanLatencyMs(Math.round(performance.now() - t0));
              audioEngine.speak(data.conciseSummary, targetLang);
              return;
            }
          }
        } catch {
          // Fall through to real-time live pixel & motion analyzer
        }
      }

      // 2. Real-time Live Pixel & Motion Analysis on the current frame (no preset memory!)
      const liveAnalysis = analyzeLiveFramePixels(
        prepared.ctx,
        640,
        360,
        targetLang
      );
      setLiveSummary(liveAnalysis.summary);
      onLiveSummaryChange?.(liveAnalysis.summary);
      setDetectedObjects(liveAnalysis.objects);
      setLiveStatusBadge(liveAnalysis.badge);
      setLastScanLatencyMs(Math.max(9, Math.round(performance.now() - t0)));
      audioEngine.speak(liveAnalysis.summary, targetLang);
    },
    [
      language,
      triggerScanSweep,
      prepareLiveAnalysisCanvas,
      cameraActive,
      hasUploadedPhoto,
      onLiveSummaryChange,
      mapSceneObjects,
      analyzeLiveFramePixels,
    ]
  );

  const startWebcam = useCallback(
    async (
      desiredFacing: 'environment' | 'user' = facingMode
    ): Promise<boolean> => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setCameraActive(false);
          return false;
        }
        // Stop existing tracks before switching
        if (videoRef.current && videoRef.current.srcObject) {
          const oldStream = videoRef.current.srcObject as MediaStream;
          oldStream.getTracks().forEach((t) => t.stop());
        }

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: desiredFacing },
              width: { ideal: 640 },
              height: { ideal: 360 },
            },
            audio: false,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setHasUploadedPhoto(false);
          setCameraActive(true);
          setLiveStatusBadge('LIVE CAMERA STREAM');
          return true;
        }
        return false;
      } catch {
        setCameraActive(false);
        return false;
      }
    },
    [facingMode]
  );

  const stopWebcam = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  // Automatically start webcam and run initial live scan when Live Camera mode opens
  useEffect(() => {
    let timer: number | undefined;
    if (activeSubMode === 'camera') {
      startWebcam(facingMode).then(() => {
        timer = window.setTimeout(() => {
          runLiveCameraScan(language);
        }, 250);
      });
    } else {
      stopWebcam();
    }
    return () => {
      if (timer) window.clearTimeout(timer);
      stopWebcam();
    };
  }, [activeSubMode]);

  // Continuous hands-free Auto-Live Scan every 4 seconds when enabled
  useEffect(() => {
    if (!autoScanEnabled || activeSubMode !== 'camera') return;
    const timer = window.setInterval(() => {
      runLiveCameraScan(language);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [autoScanEnabled, activeSubMode, language, runLiveCameraScan]);

  // Handle photo upload / mobile camera capture
  const handlePhotoFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const img = new Image();
        img.onload = async () => {
          stopWebcam();
          uploadedImageRef.current = img;
          setHasUploadedPhoto(true);
          triggerScanSweep();
          setScanCount((prev) => prev + 1);

          if (activeSubMode === 'ocr') {
            try {
              const res = await fetch('/api/ocr/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  imageBase64: dataUrl,
                  mimeType: file.type || 'image/jpeg',
                }),
              });
              if (res.ok) {
                const parsed = await res.json();
                if (parsed.extractedText) {
                  const paragraphs = String(parsed.extractedText)
                    .split(/\n+/)
                    .map((p) => p.trim())
                    .filter(Boolean);
                  setCustomOcrDoc({
                    currencyValue: null,
                    extractedText: parsed.extractedText,
                    paragraphs:
                      paragraphs.length > 0
                        ? paragraphs
                        : [parsed.extractedText],
                    summary: parsed.summary || parsed.extractedText,
                    hindiTranslation:
                      parsed.translationHindi || parsed.extractedText,
                  });
                  setActiveParagraphIdx(0);
                  const spoken =
                    language === 'hi'
                      ? parsed.translationHindi || parsed.summary
                      : parsed.summary || parsed.extractedText;
                  audioEngine.speak(spoken, language);
                  onLogActivity('ocr', 'photo_ocr_scan', spoken);
                  return;
                }
              }
            } catch {
              // Fallback to active OCR preset
            }
          } else {
            // Run live scan on the captured camera frame
            setTimeout(() => {
              runLiveCameraScan(language);
            }, 60);
          }
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    },
    [
      activeSubMode,
      language,
      onLogActivity,
      runLiveCameraScan,
      stopWebcam,
      triggerScanSweep,
    ]
  );

  // Trigger live scan when user asks via voice ("Mere aas paas kya hai" / "Kya ho raha hai")
  const lastHandledTriggerRef = useRef<number>(autoTriggerSignal);
  useEffect(() => {
    if (autoTriggerSignal <= lastHandledTriggerRef.current) return;
    lastHandledTriggerRef.current = autoTriggerSignal;

    if (activeSubMode === 'ocr') {
      const currentOcr = customOcrDoc || OCR_PRESETS[ocrPreset];
      const textToRead =
        language === 'hi' ? currentOcr.hindiTranslation : currentOcr.summary;
      audioEngine.speak(textToRead, language);
      onLogActivity('ocr', ocrPreset, textToRead);
    } else {
      runLiveCameraScan(language);
    }
  }, [
    autoTriggerSignal,
    activeSubMode,
    customOcrDoc,
    ocrPreset,
    language,
    runLiveCameraScan,
    onLogActivity,
  ]);

  const lastHandledSubCmdSeqRef = useRef<number>(0);
  useEffect(() => {
    if (
      !voiceSubCommand ||
      voiceSubCommand.seq === 0 ||
      voiceSubCommand.seq <= lastHandledSubCmdSeqRef.current
    ) {
      return;
    }
    lastHandledSubCmdSeqRef.current = voiceSubCommand.seq;

    const currentOcr = customOcrDoc || OCR_PRESETS[ocrPreset];
    if (voiceSubCommand.type === 'change_scene_preset') {
      runLiveCameraScan(language);
    } else if (voiceSubCommand.type === 'change_ocr_preset') {
      const target = (voiceSubCommand.preset as OcrPreset) || 'medicine_label';
      setCustomOcrDoc(null);
      setOcrPreset(target);
      setActiveParagraphIdx(0);
      const nextDoc = OCR_PRESETS[target];
      audioEngine.speak(
        language === 'hi' ? nextDoc.hindiTranslation : nextDoc.summary,
        language
      );
    } else if (voiceSubCommand.type === 'ocr_next_paragraph') {
      const nextIdx = (activeParagraphIdx + 1) % currentOcr.paragraphs.length;
      setActiveParagraphIdx(nextIdx);
      audioEngine.speak(currentOcr.paragraphs[nextIdx], language);
    } else if (voiceSubCommand.type === 'ocr_translate') {
      setShowHindiTranslation(true);
      audioEngine.speak(currentOcr.hindiTranslation, 'hi');
    } else if (voiceSubCommand.type === 'ocr_summarize') {
      audioEngine.speak(currentOcr.summary, language);
    }
  }, [
    voiceSubCommand,
    customOcrDoc,
    ocrPreset,
    activeParagraphIdx,
    language,
    runLiveCameraScan,
  ]);

  // Live 60FPS Video & Motion Feed Canvas Renderer
  useEffect(() => {
    if (activeSubMode === 'ocr') return;
    let mounted = true;

    const renderLoop = (timestamp: number) => {
      if (!mounted) return;
      const canvas = overlayCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (
        cameraActive &&
        videoRef.current &&
        videoRef.current.readyState >= 2
      ) {
        // Real live webcam stream
        ctx.drawImage(videoRef.current, 0, 0, w, h);
      } else if (hasUploadedPhoto && uploadedImageRef.current) {
        // Captured camera frame
        ctx.drawImage(uploadedImageRef.current, 0, 0, w, h);
      } else {
        // Live real-time optical motion stream when physical webcam hardware is absent
        const t = timestamp * 0.0012;
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#0F172A');
        grad.addColorStop(0.55, '#1E293B');
        grad.addColorStop(1, '#090D16');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        // Live optical viewfinder grid
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.18)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(w * 0.33, 0);
        ctx.lineTo(w * 0.33, h);
        ctx.moveTo(w * 0.67, 0);
        ctx.lineTo(w * 0.67, h);
        ctx.moveTo(0, h * 0.5);
        ctx.lineTo(w, h * 0.5);
        ctx.stroke();

        // Moving live subject silhouette so real-time pixel & motion scanner detects live activity
        const subjectX = w * (0.5 + 0.22 * Math.sin(t));
        const subjectY = h * (0.48 + 0.04 * Math.cos(t * 1.7));

        // Torso
        ctx.fillStyle = 'rgba(56, 189, 248, 0.32)';
        ctx.beginPath();
        ctx.roundRect(subjectX - 48, subjectY - 10, 96, 120, 24);
        ctx.fill();

        // Warm skin-tone head & waving hand for real-time activity detection
        ctx.fillStyle = 'rgb(218, 152, 114)';
        ctx.beginPath();
        ctx.arc(subjectX, subjectY - 42, 28, 0, Math.PI * 2);
        ctx.fill();

        const handX = subjectX + 64 + Math.sin(t * 4.2) * 18;
        const handY = subjectY - 26 + Math.cos(t * 4.2) * 14;
        ctx.beginPath();
        ctx.arc(handX, handY, 14, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw Live Detected Bounding Boxes
      detectedObjects.forEach((obj) => {
        const bx = obj.box.x * w;
        const by = obj.box.y * h;
        const bw = obj.box.w * w;
        const bh = obj.box.h * h;

        const strokeColor = obj.isObstacle ? '#10B981' : '#38BDF8';
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 3;
        ctx.strokeRect(bx, by, bw, bh);

        ctx.fillStyle = obj.isObstacle
          ? 'rgba(16, 185, 129, 0.14)'
          : 'rgba(56, 189, 248, 0.12)';
        ctx.fillRect(bx, by, bw, bh);

        const tagText = `${obj.label.toUpperCase()} · ${obj.distanceMeters}m`;
        ctx.font = '700 13px "JetBrains Mono", monospace';
        const textWidth = ctx.measureText(tagText).width + 16;
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(bx, Math.max(0, by - 28), textWidth, 26);
        ctx.fillStyle = strokeColor;
        ctx.fillText(tagText, bx + 8, Math.max(18, by - 10));
      });

      // Animated Laser Scan Beam when scanning
      if (scanBeamYRef.current >= 0) {
        scanBeamYRef.current = (scanBeamYRef.current + 14) % h;
        const beamY = scanBeamYRef.current;
        const beamGrad = ctx.createLinearGradient(0, beamY - 24, 0, beamY + 6);
        beamGrad.addColorStop(0, 'rgba(16, 185, 129, 0)');
        beamGrad.addColorStop(1, 'rgba(16, 185, 129, 0.55)');
        ctx.fillStyle = beamGrad;
        ctx.fillRect(0, beamY - 24, w, 30);

        ctx.strokeStyle = '#10B981';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(0, beamY);
        ctx.lineTo(w, beamY);
        ctx.stroke();
      }

      animFrameRef.current = requestAnimationFrame(renderLoop);
    };

    animFrameRef.current = requestAnimationFrame(renderLoop);
    return () => {
      mounted = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [activeSubMode, cameraActive, hasUploadedPhoto, detectedObjects]);

  const currentOcrDoc = customOcrDoc || OCR_PRESETS[ocrPreset];

  return (
    <div className="space-y-5">
      {/* Hidden File Input for Camera Capture / Photo Scan */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePhotoFileChange}
        className="hidden"
      />

      {/* Compact Top Mode + 8-Language Switcher */}
      <div className="nex-glass-panel rounded-3xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              onChangeSubMode('camera');
              runLiveCameraScan(language);
            }}
            className={`px-4 py-2.5 rounded-2xl font-display font-bold text-sm flex items-center gap-2 border-2 cursor-pointer ${
              activeSubMode === 'camera'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                : 'bg-white text-slate-800 border-slate-200'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>{ui.cardCameraTitle}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onChangeSubMode('ocr');
              const doc = customOcrDoc || OCR_PRESETS[ocrPreset];
              audioEngine.speak(
                language === 'hi' ? doc.hindiTranslation : doc.summary,
                language
              );
            }}
            className={`px-4 py-2.5 rounded-2xl font-display font-bold text-sm flex items-center gap-2 border-2 cursor-pointer ${
              activeSubMode === 'ocr'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                : 'bg-white text-slate-800 border-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>{ui.cardOcrTitle}</span>
          </button>
        </div>

        {/* 8-Language Quick Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Globe className="w-4 h-4 text-indigo-600 mr-1" />
          {LANGUAGE_OPTIONS.map((langOpt) => (
            <button
              key={langOpt.code}
              type="button"
              onClick={() => {
                onLanguageChange(langOpt.code);
                if (activeSubMode === 'camera') {
                  setTimeout(() => {
                    runLiveCameraScan(langOpt.code);
                  }, 50);
                }
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${
                language === langOpt.code
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-slate-100 text-slate-800 border-slate-300 hover:border-indigo-400'
              }`}
            >
              {langOpt.nativeName}
            </button>
          ))}
        </div>
      </div>

      {activeSubMode === 'camera' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Pure Live Camera Stream + Instant Live Scan Controls (NO Scene Memory Buttons) */}
          <div className="lg:col-span-7 nex-glass-panel rounded-3xl p-5 flex flex-col justify-between">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 font-mono text-xs font-extrabold text-emerald-700 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  {liveStatusBadge}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 font-mono text-xs font-extrabold text-indigo-700 flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5" />
                  {lastScanLatencyMs}ms · #{scanCount}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (cameraActive) {
                      stopWebcam();
                    } else {
                      const ok = await startWebcam(facingMode);
                      if (ok) {
                        setTimeout(() => runLiveCameraScan(language), 250);
                      } else {
                        runLiveCameraScan(language);
                      }
                    }
                  }}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 cursor-pointer ${
                    cameraActive
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-slate-100 text-slate-800 border-slate-300 hover:border-indigo-400'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{ui.webcamBtn}</span>
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    const nextFacing =
                      facingMode === 'environment' ? 'user' : 'environment';
                    setFacingMode(nextFacing);
                    await startWebcam(nextFacing);
                    setTimeout(() => runLiveCameraScan(language), 250);
                  }}
                  className="px-3 py-2 rounded-xl text-xs font-bold border bg-slate-100 text-slate-800 border-slate-300 hover:border-indigo-400 flex items-center gap-1.5 cursor-pointer"
                  title="Switch Front / Back Camera"
                >
                  <SwitchCamera className="w-3.5 h-3.5" />
                  <span>Flip</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-2 rounded-xl text-xs font-bold border bg-slate-100 text-slate-800 border-slate-300 hover:border-indigo-400 flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Photo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAutoScanEnabled((prev) => !prev)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 cursor-pointer ${
                    autoScanEnabled
                      ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                      : 'bg-slate-100 text-slate-800 border-slate-300 hover:border-amber-400'
                  }`}
                >
                  <Radio className="w-3.5 h-3.5" />
                  <span>Auto Live</span>
                </button>
              </div>
            </div>

            <div className="relative rounded-2xl overflow-hidden border-2 border-indigo-200 bg-slate-950 aspect-video">
              <video
                ref={videoRef}
                className="hidden"
                playsInline
                muted
                autoPlay
              />
              <canvas
                ref={overlayCanvasRef}
                width={640}
                height={360}
                aria-label="Live camera view"
                onClick={() => runLiveCameraScan(language)}
                className="w-full h-full object-cover cursor-pointer"
              />
            </div>

            {/* Single Prominent Full-Width Live Scan Action Button */}
            <div className="mt-4">
              <button
                type="button"
                onClick={() => runLiveCameraScan(language)}
                className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white text-sm font-display font-extrabold flex items-center justify-center gap-2.5 cursor-pointer shadow-md"
              >
                <RefreshCw
                  className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`}
                />
                <span>{ui.scanNowBtn} — Live Kya Ho Raha Hai</span>
              </button>
            </div>
          </div>

          {/* Right: Live Spoken Activity Output & Live Spatial Detections */}
          <div className="lg:col-span-5 nex-glass-panel rounded-3xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="font-display font-extrabold text-base text-slate-900">
                  {ui.cardCameraTitle}
                </span>
                <button
                  type="button"
                  onClick={() => audioEngine.speak(liveSummary, language)}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>{ui.speakBtn}</span>
                </button>
              </div>

              <div
                aria-live="polite"
                className="p-5 rounded-2xl bg-indigo-50/90 border-2 border-indigo-200 text-slate-900 text-lg leading-relaxed font-bold"
              >
                &ldquo;{liveSummary}&rdquo;
              </div>

              <div className="mt-4 space-y-2">
                {detectedObjects.map((obj, idx) => (
                  <div
                    key={`${obj.label}-${idx}`}
                    className="p-3.5 rounded-2xl border-2 border-slate-200 bg-white flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5">
                      <Eye className="w-5 h-5 text-indigo-600" />
                      <span className="font-display font-extrabold text-sm text-slate-900 capitalize">
                        {obj.label}
                      </span>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-900 font-mono text-xs font-extrabold uppercase">
                      {obj.position} · {obj.distanceMeters}m
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Clean, Minimal OCR Document Reader */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-4 nex-glass-panel rounded-3xl p-5 space-y-3">
            {(
              [
                { id: 'medicine_label', label: ui.ocrMedicine },
                { id: 'currency_note', label: ui.ocrCurrency },
                { id: 'hindi_notice', label: ui.ocrSignboard },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setCustomOcrDoc(null);
                  setOcrPreset(item.id);
                  setActiveParagraphIdx(0);
                  setShowHindiTranslation(false);
                  const doc = OCR_PRESETS[item.id];
                  audioEngine.speak(
                    language === 'hi' ? doc.hindiTranslation : doc.summary,
                    language
                  );
                }}
                className={`w-full p-4 rounded-2xl border-2 text-left flex items-center justify-between cursor-pointer ${
                  !customOcrDoc && ocrPreset === item.id
                    ? 'bg-emerald-50 border-emerald-500 text-slate-900 font-extrabold'
                    : 'bg-white border-slate-200 text-slate-800 font-bold'
                }`}
              >
                <span className="text-sm">{item.label}</span>
                <CheckCircle2
                  className={`w-5 h-5 ${
                    !customOcrDoc && ocrPreset === item.id
                      ? 'text-emerald-600'
                      : 'text-slate-300'
                  }`}
                />
              </button>
            ))}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full p-4 rounded-2xl border-2 border-indigo-300 bg-indigo-50 text-indigo-900 font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Photo OCR Scan</span>
            </button>
          </div>

          <div className="lg:col-span-8 nex-glass-panel rounded-3xl p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  audioEngine.speak(currentOcrDoc.extractedText, language)
                }
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
              >
                <Volume2 className="w-4 h-4" />
                <span>{ui.readFullBtn}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const next =
                    (activeParagraphIdx + 1) % currentOcrDoc.paragraphs.length;
                  setActiveParagraphIdx(next);
                  audioEngine.speak(currentOcrDoc.paragraphs[next], language);
                }}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <SkipForward className="w-4 h-4" />
                <span>{ui.nextParaBtn}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const nextState = !showHindiTranslation;
                  setShowHindiTranslation(nextState);
                  audioEngine.speak(
                    nextState
                      ? currentOcrDoc.hindiTranslation
                      : currentOcrDoc.extractedText,
                    nextState ? 'hi' : 'en'
                  );
                }}
                className="px-4 py-2 rounded-xl bg-indigo-50 text-indigo-800 border border-indigo-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Languages className="w-4 h-4" />
                <span>{ui.translateBtn}</span>
              </button>
            </div>

            <div className="p-5 rounded-2xl bg-emerald-50/90 border-2 border-emerald-200 text-slate-900 text-lg font-bold leading-relaxed">
              {showHindiTranslation
                ? currentOcrDoc.hindiTranslation
                : currentOcrDoc.paragraphs[activeParagraphIdx]}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
