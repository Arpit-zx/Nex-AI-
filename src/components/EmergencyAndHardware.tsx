import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  PhoneCall,
  UserPlus,
  Trash2,
  Glasses,
  Bluetooth,
  Smartphone,
  Sliders,
  Volume2,
  History,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { SupportedLanguage } from '../utils/nexCore';
import { audioEngine } from '../utils/audioEngine';

export interface EmergencyContactRecord {
  id: string;
  name: string;
  relation: string;
  phone: string;
  priority: number;
}

export interface SosEventRecord {
  id: string;
  triggerPhrase: string;
  lat: number;
  lng: number;
  status: 'active' | 'resolved' | 'cancelled';
  notifiedContactsCount: number;
  timestamp: string;
}

export interface ActivityLogRecord {
  id: string;
  module: 'voice' | 'camera' | 'yolo' | 'ocr' | 'family' | 'navigation' | 'sos' | 'glasses';
  command: string;
  responseSummary: string;
  language: SupportedLanguage;
  timestamp: string;
}

interface EmergencyAndHardwareProps {
  activeSection: 'sos' | 'glasses' | 'settings' | 'history';
  onChangeSection: (sec: 'sos' | 'glasses' | 'settings' | 'history') => void;
  language: SupportedLanguage;
  onLanguageChange: (lang: SupportedLanguage) => void;
  speechRate: number;
  onSpeechRateChange: (rate: number) => void;
  highContrast: boolean;
  onToggleHighContrast: () => void;
  fontScale: 'normal' | 'large' | 'xl';
  onFontScaleChange: (scale: 'normal' | 'large' | 'xl') => void;
  reducedMotion: boolean;
  onToggleReducedMotion: () => void;
  userLocation: { lat: number; lng: number };
  emergencyContacts: EmergencyContactRecord[];
  onAddEmergencyContact: (c: Omit<EmergencyContactRecord, 'id'>) => void;
  onDeleteEmergencyContact: (id: string) => void;
  onCallContact?: (contact: EmergencyContactRecord) => void;
  sosEvents: SosEventRecord[];
  onTriggerSosConfirmed: (phrase: string) => void;
  onUpdateSosStatus: (id: string, status: 'resolved' | 'cancelled') => void;
  sosCountdownSignal: number;
  cancelSosSignal?: number;
  activityLogs: ActivityLogRecord[];
  onClearAllUserData: () => void;
}

export const EmergencyAndHardware: React.FC<EmergencyAndHardwareProps> = ({
  activeSection,
  onChangeSection,
  language,
  onLanguageChange,
  speechRate,
  onSpeechRateChange,
  highContrast,
  onToggleHighContrast,
  fontScale,
  onFontScaleChange,
  reducedMotion,
  onToggleReducedMotion,
  userLocation,
  emergencyContacts,
  onAddEmergencyContact,
  onDeleteEmergencyContact,
  onCallContact,
  sosEvents,
  onTriggerSosConfirmed,
  onUpdateSosStatus,
  sosCountdownSignal,
  cancelSosSignal = 0,
  activityLogs,
  onClearAllUserData,
}) => {
  // SOS Confirmation Countdown State (prevents silent false speech triggers)
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
  const [contactName, setContactName] = useState('');
  const [contactRelation, setContactRelation] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactError, setContactError] = useState<string | null>(null);

  // Smart Glasses Hardware Connection State (Honest hardware state)
  const [bluetoothConnected, setBluetoothConnected] = useState(false);
  const [pairedDeviceName, setPairedDeviceName] = useState<string | null>(null);
  const [bluetoothStatusMsg, setBluetoothStatusMsg] = useState<string>(
    'No external AI smart glasses currently connected. Using primary device camera and audio.'
  );
  const [cameraSourcePref, setCameraSourcePref] = useState<'phone' | 'glasses'>('phone');
  const [audioOutputPref, setAudioOutputPref] = useState<'speaker' | 'bone_conduction'>('speaker');

  // Start 5-second confirmation countdown when triggered by voice or button
  const startSosConfirmation = () => {
    setCountdownSeconds(5);
    audioEngine.playSosCountdownBeep();
    const msg =
      language === 'hi'
        ? 'आपातकालीन एसओएस 5 सेकंड में सक्रिय होगा। रद्द करने के लिए कैंसिल बोलें या बटन दबाएं।'
        : language === 'hinglish'
        ? 'Emergency SOS 5 seconds mein activate hoga. Cancel karne ke liye Cancel button dabayein.'
        : 'Emergency SOS will dispatch in 5 seconds. Press Cancel or say Cancel Emergency to abort.';
    audioEngine.speak(msg, language);
  };

  const cancelSosCountdown = () => {
    setCountdownSeconds(null);
    const msg =
      language === 'hi'
        ? 'आपातकालीन एसओएस रद्द कर दिया गया है।'
        : language === 'hinglish'
        ? 'Emergency SOS cancel kar diya gaya hai.'
        : 'Emergency SOS cancelled. No alert was sent.';
    audioEngine.speak(msg, language);
  };

  useEffect(() => {
    if (sosCountdownSignal > 0) {
      startSosConfirmation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sosCountdownSignal]);

  useEffect(() => {
    if (cancelSosSignal > 0) {
      cancelSosCountdown();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelSosSignal]);

  useEffect(() => {
    if (countdownSeconds === null) return;
    if (countdownSeconds <= 0) {
      setCountdownSeconds(null);
      onTriggerSosConfirmed('Confirmed Emergency SOS');
      return;
    }
    const timer = setTimeout(() => {
      audioEngine.playSosCountdownBeep();
      setCountdownSeconds((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdownSeconds, onTriggerSosConfirmed]);

  const handleAddContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName.trim() || !contactRelation.trim()) {
      setContactError('Please enter contact name and relationship.');
      return;
    }
    if (!/^\+?[0-9\-\s]{7,20}$/.test(contactPhone.trim())) {
      setContactError('Please enter a valid phone number.');
      return;
    }
    setContactError(null);
    onAddEmergencyContact({
      name: contactName.trim(),
      relation: contactRelation.trim(),
      phone: contactPhone.trim(),
      priority: emergencyContacts.length + 1,
    });
    setContactName('');
    setContactRelation('');
    setContactPhone('');
    audioEngine.speak(`Added ${contactName.trim()} to your trusted emergency contacts.`, language);
  };

  const handleScanSmartGlasses = async () => {
    const navWithBt = navigator as unknown as {
      bluetooth?: {
        requestDevice: (opts: unknown) => Promise<{ name?: string }>;
      };
    };

    if (!navWithBt.bluetooth) {
      const msg =
        'Web Bluetooth API is unavailable in this browser window or no physical smart glasses were detected nearby. Continuing with primary device camera and microphone.';
      setBluetoothStatusMsg(msg);
      setBluetoothConnected(false);
      audioEngine.speak(msg, language);
      return;
    }

    try {
      const device = await navWithBt.bluetooth.requestDevice({
        acceptAllDevices: true,
      });
      setBluetoothConnected(true);
      setPairedDeviceName(device.name || 'NEX Optic Glasses');
      setBluetoothStatusMsg(`Connected to ${device.name || 'NEX Optic Glasses'} via Bluetooth LE.`);
      audioEngine.speak(`Connected to ${device.name || 'Smart Glasses'}.`, language);
    } catch {
      setBluetoothConnected(false);
      setPairedDeviceName(null);
      setBluetoothStatusMsg(
        'Bluetooth pairing cancelled or no compatible AI glasses hardware found nearby. Operating on primary mobile/web device.'
      );
    }
  };

  const androidKotlinServiceCode = `// android/app/src/main/java/ai/nex/accessibility/NexWakeWordService.kt
package ai.nex.accessibility

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.IBinder
import ai.picovoice.porcupine.PorcupineManager

class NexWakeWordService : Service() {
    private var porcupineManager: PorcupineManager? = null

    override fun onCreate() {
        super.onCreate()
        startForeground(101, buildPersistentAccessibilityNotification())
        // Continuous low-power DSP wake-word detection for "Hey NEX"
        porcupineManager = PorcupineManager.Builder()
            .setAccessKey(BuildConfig.PORCUPINE_ACCESS_KEY)
            .setKeywordPath("hey_nex_android.ppn")
            .setSensitivity(0.65f)
            .build(applicationContext) { _ ->
                val launchIntent = Intent("ai.nex.ACTION_WAKE_DETECTED").apply {
                    setPackage(packageName)
                }
                sendBroadcast(launchIntent)
            }
        porcupineManager?.start()
    }

    override fun onDestroy() {
        porcupineManager?.stop()
        porcupineManager?.delete()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}`;

  return (
    <div className="space-y-6">
      {/* Sub-Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[#0C1322] border border-slate-800 rounded-2xl p-4">
        <div
          role="tablist"
          aria-label="Emergency, Hardware, Settings, and History Tabs"
          className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl"
        >
          <button
            role="tab"
            aria-selected={activeSection === 'sos'}
            type="button"
            onClick={() => onChangeSection('sos')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === 'sos'
                ? 'bg-rose-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <ShieldAlert className="w-4 h-4" aria-hidden="true" />
            <span>Emergency SOS</span>
          </button>

          <button
            role="tab"
            aria-selected={activeSection === 'glasses'}
            type="button"
            onClick={() => onChangeSection('glasses')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === 'glasses'
                ? 'bg-cyan-400 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Glasses className="w-4 h-4" aria-hidden="true" />
            <span>Smart Glasses & Android Native</span>
          </button>

          <button
            role="tab"
            aria-selected={activeSection === 'settings'}
            type="button"
            onClick={() => onChangeSection('settings')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === 'settings'
                ? 'bg-cyan-400 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Sliders className="w-4 h-4" aria-hidden="true" />
            <span>Accessibility & Privacy</span>
          </button>

          <button
            role="tab"
            aria-selected={activeSection === 'history'}
            type="button"
            onClick={() => onChangeSection('history')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
              activeSection === 'history'
                ? 'bg-cyan-400 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <History className="w-4 h-4" aria-hidden="true" />
            <span>Activity History ({activityLogs.length})</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: EMERGENCY SOS SYSTEM */}
      {activeSection === 'sos' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-6 bg-[#0C1322] border border-slate-800 rounded-2xl p-6 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <span className="text-xs text-rose-400 font-medium">
                    Confirmation-Protected Emergency Workflow
                  </span>
                  <h2 className="text-xl font-bold text-white font-display">
                    Emergency SOS Dispatch
                  </h2>
                </div>
                <ShieldAlert className="w-6 h-6 text-rose-400" />
              </div>

              <p className="text-sm text-slate-300 leading-relaxed">
                Say <strong className="text-white">&ldquo;Hey NEX, emergency&rdquo;</strong> or
                activate the button below. To prevent false alarms from background speech errors, a
                5-second audible confirmation countdown runs before notifying your trusted contacts
                with your live GPS coordinates (
                <span className="font-mono tabular-nums">
                  {userLocation.lat.toFixed(4)}° N, {userLocation.lng.toFixed(4)}° E
                </span>
                ).
              </p>

              {/* Countdown Banner OR Primary Trigger */}
              {countdownSeconds !== null ? (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="p-6 rounded-2xl bg-rose-950/90 border-2 border-rose-500 text-center space-y-4"
                >
                  <p className="text-2xl font-bold text-white font-mono tabular-nums">
                    Dispatching SOS in {countdownSeconds}s...
                  </p>
                  <div className="flex items-center justify-center gap-4">
                    <button
                      type="button"
                      onClick={cancelSosCountdown}
                      className="px-6 py-3 rounded-xl bg-white text-slate-950 font-bold text-sm cursor-pointer"
                    >
                      Cancel Emergency (False Alarm)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCountdownSeconds(null);
                        onTriggerSosConfirmed('Immediate Emergency Dispatch');
                      }}
                      className="px-5 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm cursor-pointer"
                    >
                      Send Immediately
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={startSosConfirmation}
                  className="w-full py-5 px-6 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-lg transition-colors flex items-center justify-center gap-3 cursor-pointer shadow-lg shadow-rose-600/20"
                >
                  <ShieldAlert className="w-6 h-6" />
                  <span>Activate Emergency SOS (5s Confirmation)</span>
                </button>
              )}

              {/* SOS Event Log */}
              <div className="space-y-2 pt-3 border-t border-slate-800">
                <h3 className="text-xs font-semibold text-slate-400">
                  Recent SOS Dispatch Log ({sosEvents.length})
                </h3>
                {sosEvents.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No emergency alerts triggered in this session.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {sosEvents.map((ev) => (
                      <div
                        key={ev.id}
                        className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <p className="font-semibold text-white">
                            {ev.triggerPhrase} · Status: {ev.status.toUpperCase()}
                          </p>
                          <p className="text-slate-400 font-mono tabular-nums">
                            GPS: {ev.lat.toFixed(4)}, {ev.lng.toFixed(4)} · Notified{' '}
                            {ev.notifiedContactsCount} contacts · {ev.timestamp}
                          </p>
                        </div>
                        {ev.status === 'active' && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onUpdateSosStatus(ev.id, 'resolved')}
                              className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 font-medium cursor-pointer"
                            >
                              Mark Safe
                            </button>
                            <button
                              type="button"
                              onClick={() => onUpdateSosStatus(ev.id, 'cancelled')}
                              className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 font-medium cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Trusted Emergency Contacts CRUD */}
          <div className="lg:col-span-6 bg-[#0C1322] border border-slate-800 rounded-2xl p-6 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <span className="text-xs text-cyan-400 font-medium">Direct Calling & SMS Dispatch</span>
                <h3 className="text-lg font-bold text-white font-display">
                  Trusted Emergency Contacts ({emergencyContacts.length})
                </h3>
              </div>

              <div className="space-y-2.5">
                {emergencyContacts.map((c) => (
                  <div
                    key={c.id}
                    className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {c.priority}. {c.name}{' '}
                        <span className="text-xs font-normal text-cyan-400">· {c.relation}</span>
                      </p>
                      <p className="text-xs text-slate-400 font-mono tabular-nums">{c.phone}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={`tel:${c.phone.replace(/\s+/g, '')}`}
                        onClick={(e) => {
                          if (onCallContact) {
                            e.preventDefault();
                            onCallContact(c);
                          }
                        }}
                        aria-label={`Call ${c.name} at ${c.phone}`}
                        className="px-3 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <PhoneCall className="w-3.5 h-3.5" />
                        <span>Call</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => onDeleteEmergencyContact(c.id)}
                        aria-label={`Remove ${c.name} from emergency contacts`}
                        className="p-2 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <form
              onSubmit={handleAddContactSubmit}
              className="space-y-3 pt-4 border-t border-slate-800"
            >
              <p className="text-xs font-semibold text-white flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-cyan-400" />
                <span>Add Trusted Emergency Contact</span>
              </p>
              {contactError && (
                <p role="alert" className="text-xs text-rose-400">
                  {contactError}
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Contact Name"
                  aria-label="Emergency contact name"
                  className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
                <input
                  type="text"
                  value={contactRelation}
                  onChange={(e) => setContactRelation(e.target.value)}
                  placeholder="Relation"
                  aria-label="Emergency contact relationship"
                  className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="Phone Number"
                  aria-label="Emergency contact phone number"
                  className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 px-4 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-semibold text-xs cursor-pointer"
              >
                Save Emergency Contact
              </button>
            </form>
          </div>
        </div>
      )}

      {/* SECTION 2: SMART GLASSES & NATIVE ANDROID FOREGROUND WAKE-WORD BRIDGE */}
      {activeSection === 'glasses' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-6 bg-[#0C1322] border border-slate-800 rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-xs text-cyan-400 font-medium">
                  External Wearable Hardware Interface
                </span>
                <h2 className="text-xl font-bold text-white font-display">
                  AI Smart Glasses Connection & I/O Routing
                </h2>
              </div>
              <Glasses className="w-6 h-6 text-cyan-400" />
            </div>

            {/* Honest Hardware Connection Status */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Hardware Status</span>
                <span className="text-xs font-semibold flex items-center gap-1.5 text-slate-200">
                  {bluetoothConnected ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Connected: {pairedDeviceName}</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-amber-400" />
                      <span>Disconnected (Primary Device Active)</span>
                    </>
                  )}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{bluetoothStatusMsg}</p>
            </div>

            {/* Camera & Audio Abstraction Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
                <label
                  htmlFor="cam-routing-select"
                  className="text-xs font-semibold text-white block"
                >
                  Camera Input Abstraction
                </label>
                <select
                  id="cam-routing-select"
                  value={cameraSourcePref}
                  onChange={(e) => setCameraSourcePref(e.target.value as 'phone' | 'glasses')}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
                >
                  <option value="phone">Primary Device Camera (Default)</option>
                  <option value="glasses" disabled={!bluetoothConnected}>
                    Smart Glasses Temple Camera {bluetoothConnected ? '' : '(Requires Pairing)'}
                  </option>
                </select>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
                <label
                  htmlFor="audio-routing-select"
                  className="text-xs font-semibold text-white block"
                >
                  Audio Output Abstraction
                </label>
                <select
                  id="audio-routing-select"
                  value={audioOutputPref}
                  onChange={(e) =>
                    setAudioOutputPref(e.target.value as 'speaker' | 'bone_conduction')
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
                >
                  <option value="speaker">System Speaker / Earphones</option>
                  <option value="bone_conduction" disabled={!bluetoothConnected}>
                    Open-Ear Bone Conduction {bluetoothConnected ? '' : '(Requires Pairing)'}
                  </option>
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={handleScanSmartGlasses}
              className="w-full py-3 px-4 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <Bluetooth className="w-4 h-4" />
              <span>Scan for Bluetooth LE Smart Glasses Hardware</span>
            </button>
          </div>

          {/* Native Android Foreground Service Integration */}
          <div className="lg:col-span-6 bg-[#0C1322] border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-xs text-cyan-400 font-medium">
                  True Background Wake-Word Architecture
                </span>
                <h3 className="text-lg font-bold text-white font-display">
                  Native Android Foreground Service Integration
                </h3>
              </div>
              <Smartphone className="w-5 h-5 text-cyan-400" />
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Browser security policies pause Web Speech API listening when the browser tab is
              closed or the phone screen locks. For persistent background wake-word detection on
              Android, NEX AI provides the native Kotlin Foreground Service bridge below using the
              Porcupine Wake-Word Engine (<code className="font-mono text-cyan-300">HEY NEX</code>).
            </p>

            <pre className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-60">
              {androidKotlinServiceCode}
            </pre>
          </div>
        </div>
      )}

      {/* SECTION 3: ACCESSIBILITY, VOICE & PRIVACY SETTINGS */}
      {activeSection === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[#0C1322] border border-slate-800 rounded-2xl p-6 space-y-5">
            <h2 className="text-lg font-bold text-white font-display border-b border-slate-800 pb-3">
              Accessibility & Visual Controls
            </h2>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">High-Contrast Mode</p>
                  <p className="text-xs text-slate-400">
                    Pure black canvas with high-luminance cyan borders for low-vision clarity
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onToggleHighContrast}
                  aria-pressed={highContrast}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                    highContrast
                      ? 'bg-cyan-400 text-slate-950'
                      : 'bg-slate-900 border border-slate-700 text-slate-200'
                  }`}
                >
                  {highContrast ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">Typography Scale</p>
                  <p className="text-xs text-slate-400">Adjust global font size across all screens</p>
                </div>
                <div className="inline-flex gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
                  {(['normal', 'large', 'xl'] as const).map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => onFontScaleChange(sz)}
                      className={`px-3 py-1.5 rounded text-xs font-medium cursor-pointer ${
                        fontScale === sz ? 'bg-cyan-400 text-slate-950 font-semibold' : 'text-slate-300'
                      }`}
                    >
                      {sz === 'normal' ? '100%' : sz === 'large' ? '118%' : '132%'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">Reduced Motion</p>
                  <p className="text-xs text-slate-400">
                    Disable decorative transitions and animations
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onToggleReducedMotion}
                  aria-pressed={reducedMotion}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                    reducedMotion
                      ? 'bg-cyan-400 text-slate-950'
                      : 'bg-slate-900 border border-slate-700 text-slate-200'
                  }`}
                >
                  {reducedMotion ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-[#0C1322] border border-slate-800 rounded-2xl p-6 space-y-5">
            <h2 className="text-lg font-bold text-white font-display border-b border-slate-800 pb-3">
              Voice Synthesis & Privacy Controls
            </h2>

            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <label htmlFor="speech-rate-slider" className="font-semibold text-white">
                    Voice Speech Rate ({speechRate.toFixed(1)}x)
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      audioEngine.speak(
                        'Testing NEX AI voice speed at current setting.',
                        language,
                        speechRate
                      )
                    }
                    className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Test Voice</span>
                  </button>
                </div>
                <input
                  id="speech-rate-slider"
                  type="range"
                  min={0.6}
                  max={1.8}
                  step={0.1}
                  value={speechRate}
                  onChange={(e) => onSpeechRateChange(Number(e.target.value))}
                  className="w-full accent-cyan-400"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-white">Primary Voice Language</span>
                <div className="inline-flex gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
                  {(['en', 'hi', 'hinglish'] as SupportedLanguage[]).map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => onLanguageChange(lang)}
                      className={`px-3 py-1.5 rounded text-xs font-medium cursor-pointer ${
                        language === lang
                          ? 'bg-cyan-400 text-slate-950 font-semibold'
                          : 'text-slate-300'
                      }`}
                    >
                      {lang === 'en' ? 'English' : lang === 'hi' ? 'हिंदी' : 'Hinglish'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-rose-300">Delete Activity & Local Data</p>
                  <p className="text-xs text-slate-400">
                    Immediately purge activity logs, cached scene memory, and revoke location
                    sharing
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClearAllUserData}
                  className="px-4 py-2 rounded-xl bg-rose-950 hover:bg-rose-900 border border-rose-700 text-rose-200 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Delete My Data
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 4: ACTIVITY HISTORY */}
      {activeSection === 'history' && (
        <div className="bg-[#0C1322] border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <span className="text-xs text-cyan-400 font-medium">User-Auditable Interaction Log</span>
              <h2 className="text-lg font-bold text-white font-display">
                Voice & Vision Activity History ({activityLogs.length})
              </h2>
            </div>
            <button
              type="button"
              onClick={onClearAllUserData}
              className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-slate-300 cursor-pointer"
            >
              Clear History
            </button>
          </div>

          {activityLogs.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">
              No voice or vision interactions logged yet. Say &ldquo;Hey NEX, describe my
              surroundings&rdquo; to begin.
            </p>
          ) : (
            <div className="space-y-2.5 max-h-96 overflow-y-auto">
              {activityLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-cyan-400 font-mono">
                      <span className="uppercase">{log.module}</span>
                      <span>·</span>
                      <span>{log.language.toUpperCase()}</span>
                      <span>·</span>
                      <span className="text-slate-400 tabular-nums">{log.timestamp}</span>
                    </div>
                    <p className="text-sm font-semibold text-white">&ldquo;{log.command}&rdquo;</p>
                    <p className="text-xs text-slate-300">{log.responseSummary}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => audioEngine.speak(log.responseSummary, log.language)}
                    aria-label={`Replay response: ${log.responseSummary}`}
                    className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 shrink-0 cursor-pointer"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
