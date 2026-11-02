import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectWakeWord,
  classifyVoiceIntent,
  resolveContextualFollowUp,
  analyzeBoundingBoxPosition,
  formatConciseSpatialSummary,
  shouldAnnounceSceneUpdate,
  splitOcrIntoParagraphs,
  getUiTranslations,
  getInstantSceneDescription,
  getLanguageConfirmation,
  resolveSavedContactToCall,
  formatVoiceCallAnnouncement,
} from './nexCore';

test('detectWakeWord identifies English, Hindi, and Hinglish wake phrases and extracts command', () => {
  const res1 = detectWakeWord('Hey NEX, describe my surroundings.');
  assert.equal(res1.detected, true);
  assert.equal(res1.commandRemainder, 'describe my surroundings');

  const res2 = detectWakeWord('हे नेक्स मेरे आस पास क्या है');
  assert.equal(res2.detected, true);
  assert.equal(res2.commandRemainder, 'मेरे आस पास क्या है');

  const res3 = detectWakeWord('random speech without wake word');
  assert.equal(res3.detected, false);
});

test('classifyVoiceIntent routes English, Hindi, and Hinglish commands accurately', () => {
  const surroundHinglish = classifyVoiceIntent('Hey NEX, mere aas paas kya hai?');
  assert.equal(surroundHinglish.intent, 'describe_surroundings');
  assert.equal(surroundHinglish.targetModule, 'camera');
  assert.equal(surroundHinglish.detectedLanguage, 'hinglish');

  const obstacleCheck = classifyVoiceIntent('Kya mere saamne koi obstacle hai?');
  assert.equal(obstacleCheck.intent, 'detect_objects');
  assert.equal(obstacleCheck.targetModule, 'yolo');

  const hospitalQuery = classifyVoiceIntent('Hey NEX, nearest hospital batao.');
  assert.equal(hospitalQuery.intent, 'find_nearby');
  assert.equal(hospitalQuery.placeCategory, 'hospital');
  assert.equal(hospitalQuery.targetModule, 'navigation');

  const familyQuery = classifyVoiceIntent("Hey NEX, show my mother's location");
  assert.equal(familyQuery.intent, 'family_location');
  assert.equal(familyQuery.familyTarget, 'Mother');
  assert.equal(familyQuery.targetModule, 'family');

  const sosCmd = classifyVoiceIntent('Hey NEX, emergency');
  assert.equal(sosCmd.intent, 'emergency_sos');
  assert.equal(sosCmd.targetModule, 'sos');

  const stopCmd = classifyVoiceIntent('Hey NEX, stop');
  assert.equal(stopCmd.intent, 'stop_speaking');

  const homeCmd = classifyVoiceIntent('Hey NEX, home chalo');
  assert.equal(homeCmd.intent, 'go_home');
  assert.equal(homeCmd.targetModule, 'dashboard');

  const prescriptionCmd = classifyVoiceIntent('Hey NEX, dawai ki parchi padho');
  assert.equal(prescriptionCmd.intent, 'change_ocr_preset');
  assert.equal(prescriptionCmd.ocrPresetTarget, 'medicine_label');

  const hiUi = getUiTranslations('hi');
  assert.match(hiUi.navHome, /वॉइस होम/);
  const hinglishUi = getUiTranslations('hinglish');
  assert.match(hinglishUi.navOcr, /Text Padho/);
});

test('classifyVoiceIntent switches among 8 languages simply by speaking the language name', () => {
  const mrSwitch = classifyVoiceIntent('Marathi');
  assert.equal(mrSwitch.intent, 'change_language');
  assert.equal(mrSwitch.targetLanguage, 'mr');

  const taSwitch = classifyVoiceIntent('Tamil la pesu');
  assert.equal(taSwitch.intent, 'change_language');
  assert.equal(taSwitch.targetLanguage, 'ta');

  const guSwitch = classifyVoiceIntent('Gujarati');
  assert.equal(guSwitch.intent, 'change_language');
  assert.equal(guSwitch.targetLanguage, 'gu');

  const bnSwitch = classifyVoiceIntent('Bangla');
  assert.equal(bnSwitch.intent, 'change_language');
  assert.equal(bnSwitch.targetLanguage, 'bn');

  const teSwitch = classifyVoiceIntent('Telugu');
  assert.equal(teSwitch.intent, 'change_language');
  assert.equal(teSwitch.targetLanguage, 'te');

  const mrScene = getInstantSceneDescription('indoor_room', 'mr');
  assert.match(mrScene.conciseSummary, /समोर/);
  assert.match(getLanguageConfirmation('mr'), /मराठी/);

  assert.match(getUiTranslations('mr').navCamera, /लाईव्ह कॅमेरा/);
  assert.match(getUiTranslations('ta').navCamera, /கேமரா/);
  assert.match(getUiTranslations('bn').navCamera, /ক্যামেরা/);
  assert.match(getUiTranslations('gu').navCamera, /કેમેરા/);
  assert.match(getUiTranslations('te').navCamera, /కెమెరా/);
});

test('resolveContextualFollowUp answers table follow-up and transitions to OCR on read command', () => {
  const memory = {
    lastSummary: 'Table ahead. Chair on right.',
    lastObjects: [
      { label: 'table', position: 'ahead' as const, details: 'a bottle and a book' },
      { label: 'chair', position: 'right' as const },
    ],
    lastOcrText: '',
    updatedAt: Date.now(),
  };

  const ans1 = resolveContextualFollowUp('What is on the table?', memory, 'en');
  assert.match(ans1.resolvedAnswer, /bottle and a book/i);

  const ans2 = resolveContextualFollowUp('Read the book', memory, 'en');
  assert.equal(ans2.shouldTriggerModule, 'ocr');
});

test('analyzeBoundingBoxPosition computes horizontal sector and confidence-aware obstacle alerts', () => {
  const chairRight = analyzeBoundingBoxPosition({
    label: 'chair',
    confidence: 0.92,
    box: [400, 680, 850, 950],
  });
  assert.equal(chairRight.position, 'right');
  assert.equal(chairRight.isObstacle, true);
  assert.match(chairRight.voiceAlertEn, /on your right/i);

  const stairsAhead = analyzeBoundingBoxPosition({
    label: 'stairs',
    confidence: 0.89,
    box: [300, 350, 900, 650],
  });
  assert.equal(stairsAhead.position, 'ahead');
  assert.equal(stairsAhead.priority, 'critical');
  assert.match(stairsAhead.voiceAlertEn, /Stairs detected ahead/i);
});

test('formatConciseSpatialSummary and shouldAnnounceSceneUpdate optimize continuous feedback', () => {
  const concise = formatConciseSpatialSummary(
    [
      { label: 'chair', position: 'right' },
      { label: 'table', position: 'ahead' },
      { label: 'door', position: 'left' },
    ],
    'en'
  );
  assert.equal(concise, 'Chair on your right. Table ahead. Door on your left.');

  const prev = [{ label: 'chair', position: 'right' }];
  const same = [{ label: 'chair', position: 'right' }];
  const diff = [{ label: 'chair', position: 'right' }, { label: 'person', position: 'ahead' }];

  assert.equal(shouldAnnounceSceneUpdate(prev, same, 3000, false), false);
  assert.equal(shouldAnnounceSceneUpdate(prev, diff, 3000, false), true);
});

test('splitOcrIntoParagraphs splits multi-paragraph document cleanly', () => {
  const text = 'CITY GENERAL HOSPITAL\n\nAppointment Notice: Room 204 at 10:30 AM.\n\nPlease bring your ID card.';
  const paragraphs = splitOcrIntoParagraphs(text);
  assert.equal(paragraphs.length, 3);
  assert.equal(paragraphs[0], 'CITY GENERAL HOSPITAL');
});

test('classifyVoiceIntent and resolveSavedContactToCall place calls to saved numbers on saying call', () => {
  const savedContacts = [
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
  ];

  // Saying just "call" or "call karo" routes to call_contact and picks the #1 saved contact
  const bareCall = classifyVoiceIntent('call');
  assert.equal(bareCall.intent, 'call_contact');
  const resolvedDefault = resolveSavedContactToCall(bareCall.callTarget || '', savedContacts);
  assert.equal(resolvedDefault?.name, 'Aarav Sharma');
  assert.equal(resolvedDefault?.phone, '+91 98112 44019');

  // Saying "call mummy" or "Meera ko call karo" resolves to Meera Nair
  const mummyCall = classifyVoiceIntent('Hey NEX, mummy ko call lagao');
  assert.equal(mummyCall.intent, 'call_contact');
  const resolvedMummy = resolveSavedContactToCall(mummyCall.callTarget || '', savedContacts);
  assert.equal(resolvedMummy?.name, 'Meera Nair');

  // Saying "call kaato" or "end call" routes to end_call
  const cutCall = classifyVoiceIntent('call kaato');
  assert.equal(cutCall.intent, 'end_call');

  // Formatted voice announcement includes contact name and saved number
  const msg = formatVoiceCallAnnouncement(savedContacts[0], 'hinglish');
  assert.match(msg, /Aarav Sharma/);
  assert.match(msg, /\+91 98112 44019/);
});

