import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Users,
  Navigation,
  MapPin,
  BatteryCharging,
  ShieldCheck,
  UserPlus,
  Volume2,
  Route as RouteIcon,
  AlertTriangle,
  Clock,
  Lock,
} from 'lucide-react';
import { PlaceCategory, SupportedLanguage } from '../utils/nexCore';
import { audioEngine } from '../utils/audioEngine';

export interface FamilyMemberRecord {
  id: string;
  name: string;
  relation: string;
  phone: string;
  inviteEmail: string;
  status: 'invited' | 'connected' | 'revoked';
  lat: number;
  lng: number;
  batteryLevel: number;
  isOnline: boolean;
  lastUpdated: string;
  addressLabel?: string;
}

export interface NearbyPlaceItem {
  id: string;
  name: string;
  category: PlaceCategory;
  address: string;
  distanceKm: number;
  durationMins: number;
  lat: number;
  lng: number;
  rating?: number;
}

interface FamilyAndNavigationProps {
  activeTab: 'family' | 'navigation';
  onChangeTab: (tab: 'family' | 'navigation') => void;
  language: SupportedLanguage;
  userLocation: { lat: number; lng: number };
  locationSharingEnabled: boolean;
  onToggleLocationSharing: (enabled: boolean, durationMins?: number) => void;
  sharingSessionMinutes: number | null;
  familyMembers: FamilyMemberRecord[];
  onAddFamilyMember: (member: Omit<FamilyMemberRecord, 'id'>) => void;
  onUpdateFamilyMemberStatus: (id: string, status: 'invited' | 'connected' | 'revoked') => void;
  requestedPlaceCategory: PlaceCategory;
  onSelectPlaceCategory: (cat: PlaceCategory) => void;
  autoNavigateSignal: number;
  onLogActivity: (module: 'family' | 'navigation', command: string, responseSummary: string) => void;
}

const MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || '';

interface RouteOverlayAndPlacesProps {
  userLocation: { lat: number; lng: number };
  selectedCategory: PlaceCategory;
  activeDestination: NearbyPlaceItem | null;
  travelMode: 'WALKING' | 'DRIVING';
  onPlacesLoaded: (places: NearbyPlaceItem[]) => void;
  onRouteComputed: (details: { distanceMeters: number; durationMillis: number; steps: string[] } | null) => void;
}

interface MapPolylineLike {
  setMap: (map: unknown) => void;
  setOptions: (options: { strokeColor?: string; strokeWeight?: number }) => void;
}

const RouteOverlayAndPlaces: React.FC<RouteOverlayAndPlacesProps> = ({
  userLocation,
  selectedCategory,
  activeDestination,
  travelMode,
  onPlacesLoaded,
  onRouteComputed,
}) => {
  const map = useMap();
  const placesLib = useMapsLibrary('places');
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<MapPolylineLike[]>([]);

  // Live Nearby Search using Places API (New) `Place.searchNearby`
  useEffect(() => {
    if (!placesLib || !placesLib.Place) return;

    let cancelled = false;
    const runSearch = async () => {
      try {
        const req = {
          fields: ['displayName', 'location', 'formattedAddress', 'rating', 'primaryType'],
          locationRestriction: {
            center: userLocation,
            radius: 3500,
          },
          includedPrimaryTypes: [selectedCategory],
          maxResultCount: 6,
        };

        const response = await (placesLib.Place as unknown as {
          searchNearby: (r: unknown) => Promise<{ places?: Array<{
            id?: string;
            displayName?: string;
            formattedAddress?: string;
            rating?: number;
            location?: { lat: () => number; lng: () => number } | { lat: number; lng: number };
          }> }>;
        }).searchNearby(req);

        if (cancelled || !response?.places || response.places.length === 0) return;

        const mapped: NearbyPlaceItem[] = response.places.map((p, idx) => {
          const lat =
            typeof p.location?.lat === 'function'
              ? p.location.lat()
              : Number((p.location as { lat?: number })?.lat ?? userLocation.lat + 0.008);
          const lng =
            typeof p.location?.lng === 'function'
              ? p.location.lng()
              : Number((p.location as { lng?: number })?.lng ?? userLocation.lng + 0.008);

          const dLat = (lat - userLocation.lat) * 111;
          const dLng = (lng - userLocation.lng) * 96;
          const distKm = Number(Math.max(0.2, Math.sqrt(dLat * dLat + dLng * dLng)).toFixed(1));

          return {
            id: p.id || `gmp-place-${idx}`,
            name: p.displayName || `${selectedCategory} ${idx + 1}`,
            category: selectedCategory,
            address: p.formattedAddress || 'Verified Google Maps Location',
            distanceKm: distKm,
            durationMins: Math.max(3, Math.round(distKm * 11)),
            lat,
            lng,
            rating: p.rating,
          };
        });

        onPlacesLoaded(mapped);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes('OVER_QUERY_LIMIT') ||
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('429')
        ) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
      }
    };

    runSearch();
    return () => {
      cancelled = true;
    };
  }, [placesLib, userLocation, selectedCategory, onPlacesLoaded]);

  // Modern Routes API computation using `Route.computeRoutes`
  useEffect(() => {
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

    if (!routesLib || !map || !activeDestination) {
      onRouteComputed(null);
      return;
    }

    const RouteClass = (routesLib as unknown as {
      Route?: {
        computeRoutes?: (req: unknown) => Promise<{
          routes?: Array<{
            distanceMeters?: number;
            durationMillis?: number;
            viewport?: Parameters<typeof map.fitBounds>[0];
            createPolylines?: () => MapPolylineLike[];
          }>;
        }>;
      };
    }).Route;

    if (!RouteClass?.computeRoutes) return;

    RouteClass.computeRoutes({
      origin: userLocation,
      destination: { lat: activeDestination.lat, lng: activeDestination.lng },
      travelMode,
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
    })
      .then((res) => {
        const primaryRoute = res?.routes?.[0];
        if (!primaryRoute) return;

        if (typeof primaryRoute.createPolylines === 'function') {
          const lines = primaryRoute.createPolylines();
          lines.forEach((line) => {
            line.setOptions({
              strokeColor: '#22D3EE',
              strokeWeight: 5,
            });
            line.setMap(map);
          });
          polylinesRef.current = lines;
        }

        if (primaryRoute.viewport) {
          map.fitBounds(primaryRoute.viewport);
        }

        onRouteComputed({
          distanceMeters: primaryRoute.distanceMeters ?? activeDestination.distanceKm * 1000,
          durationMillis: primaryRoute.durationMillis ?? activeDestination.durationMins * 60000,
          steps: [
            `Head toward ${activeDestination.name} (${activeDestination.distanceKm} km).`,
            'Proceed along the pedestrian sidewalk and use your primary mobility aid at intersections.',
            `Arrive at ${activeDestination.address}.`,
          ],
        });
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes('OVER_QUERY_LIMIT') ||
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('429')
        ) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
      });

    return () => {
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [routesLib, map, userLocation, activeDestination, travelMode, onRouteComputed]);

  return null;
};

export const FamilyAndNavigation: React.FC<FamilyAndNavigationProps> = ({
  activeTab,
  onChangeTab,
  language,
  userLocation,
  locationSharingEnabled,
  onToggleLocationSharing,
  sharingSessionMinutes,
  familyMembers,
  onAddFamilyMember,
  onUpdateFamilyMemberStatus,
  requestedPlaceCategory,
  onSelectPlaceCategory,
  autoNavigateSignal,
  onLogActivity,
}) => {
  // Invite Form State
  const [inviteName, setInviteName] = useState('');
  const [inviteRelation, setInviteRelation] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(
    familyMembers[0]?.id || null
  );

  // Smart Navigation State
  const [travelMode, setTravelMode] = useState<'WALKING' | 'DRIVING'>('WALKING');
  const [livePlaces, setLivePlaces] = useState<NearbyPlaceItem[]>([]);
  const [activeDestination, setActiveDestination] = useState<NearbyPlaceItem | null>(null);
  const [computedRouteInfo, setComputedRouteInfo] = useState<{
    distanceMeters: number;
    durationMillis: number;
    steps: string[];
  } | null>(null);

  const placeCategories: Array<{ value: PlaceCategory; label: string; hiLabel: string }> = [
    { value: 'hospital', label: 'Hospitals', hiLabel: 'अस्पताल' },
    { value: 'pharmacy', label: 'Pharmacies', hiLabel: 'दवाखाना' },
    { value: 'bus_station', label: 'Bus Stops', hiLabel: 'बस स्टॉप' },
    { value: 'train_station', label: 'Railway Stations', hiLabel: 'रेलवे स्टेशन' },
    { value: 'atm', label: 'ATMs', hiLabel: 'एटीएम' },
    { value: 'restaurant', label: 'Restaurants', hiLabel: 'रेस्टोरेंट' },
  ];

  // Clear live places when category changes so Google Maps Places API (New) loads fresh results
  useEffect(() => {
    setLivePlaces([]);
    setActiveDestination(null);
    setComputedRouteInfo(null);
  }, [requestedPlaceCategory]);

  // Handle voice-triggered navigation start
  useEffect(() => {
    if (autoNavigateSignal === 0) return;
    if (livePlaces.length > 0 && !activeDestination) {
      const target = livePlaces[0];
      setActiveDestination(target);
      const msg =
        language === 'hi'
          ? `${target.name} के लिए नेविगेशन शुरू हो रहा है। दूरी लगभग ${target.distanceKm} किलोमीटर है।`
          : language === 'hinglish'
          ? `${target.name} ke liye navigation start ho raha hai. Distance approximately ${target.distanceKm} kilometers hai.`
          : `Starting navigation to ${target.name}, approximately ${target.distanceKm} kilometers away.`;
      audioEngine.speak(msg, language);
      onLogActivity('navigation', `Navigate to ${target.name}`, msg);
    }
  }, [autoNavigateSignal, livePlaces, activeDestination, language, onLogActivity]);

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName.trim() || !inviteRelation.trim()) {
      setInviteError('Please enter both the family member name and relationship.');
      return;
    }
    if (!/^\+?[0-9\-\s]{7,20}$/.test(invitePhone.trim())) {
      setInviteError('Please enter a valid phone number (7 to 20 digits).');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.trim())) {
      setInviteError('Please enter a valid email address for the invitation.');
      return;
    }

    setInviteError(null);
    onAddFamilyMember({
      name: inviteName.trim(),
      relation: inviteRelation.trim(),
      phone: invitePhone.trim(),
      inviteEmail: inviteEmail.trim(),
      status: 'invited',
      lat: Number((userLocation.lat + (Math.random() - 0.5) * 0.015).toFixed(5)),
      lng: Number((userLocation.lng + (Math.random() - 0.5) * 0.015).toFixed(5)),
      batteryLevel: 88,
      isOnline: true,
      lastUpdated: 'Invitation sent just now',
    });

    const msg = `Invitation sent to ${inviteName.trim()} (${inviteRelation.trim()}). Location will only be shared when both parties consent.`;
    audioEngine.speak(msg, language);
    setInviteName('');
    setInviteRelation('');
    setInvitePhone('');
    setInviteEmail('');
  };

  const handleAnnounceFamilyMember = (member: FamilyMemberRecord) => {
    setSelectedMemberId(member.id);
    const speech =
      language === 'hi'
        ? `${member.name} (${member.relation}) अभी ${member.isOnline ? 'ऑनलाइन' : 'ऑफ़लाइन'} हैं। बैटरी ${member.batteryLevel}% है। अंतिम अपडेट: ${member.lastUpdated}।`
        : language === 'hinglish'
        ? `${member.name} (${member.relation}) abhi ${member.isOnline ? 'online' : 'offline'} hain. Battery ${member.batteryLevel}% hai. Last update: ${member.lastUpdated}.`
        : `${member.name} (${member.relation}) is currently ${member.isOnline ? 'online' : 'offline'} with ${member.batteryLevel}% battery. Last location update: ${member.lastUpdated}.`;
    audioEngine.speak(speech, language);
    onLogActivity('family', `Locate ${member.name}`, speech);
  };

  const handleStartRouteToPlace = (place: NearbyPlaceItem) => {
    setActiveDestination(place);
    const speech =
      language === 'hi'
        ? `${place.name} लगभग ${place.distanceKm} किलोमीटर दूर है। मार्ग मार्गदर्शन शुरू किया जा रहा है।`
        : language === 'hinglish'
        ? `${place.name} approximately ${place.distanceKm} kilometers door hai. Route guidance start ho rahi hai.`
        : `Starting route guidance to ${place.name}, ${place.distanceKm} kilometers away. Estimated time: ${place.durationMins} minutes.`;
    audioEngine.speak(speech, language);
    onLogActivity('navigation', `Directions to ${place.name}`, speech);
  };

  return (
    <div className="space-y-6">
      {/* Top Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[#0C1322] border border-slate-800 rounded-2xl p-4">
        <div
          role="tablist"
          aria-label="Family Safety and Smart Navigation Tabs"
          className="inline-flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl"
        >
          <button
            role="tab"
            aria-selected={activeTab === 'family'}
            type="button"
            onClick={() => onChangeTab('family')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'family'
                ? 'bg-cyan-400 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" aria-hidden="true" />
            <span>Family Safety & Live Location</span>
          </button>

          <button
            role="tab"
            aria-selected={activeTab === 'navigation'}
            type="button"
            onClick={() => onChangeTab('navigation')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'navigation'
                ? 'bg-cyan-400 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Navigation className="w-4 h-4" aria-hidden="true" />
            <span>Smart Navigation Assistant</span>
          </button>
        </div>

        {/* Consent & Privacy Control Pill-Free Action Bar */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-slate-400 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-cyan-400" />
            <span>
              Live GPS Sharing:{' '}
              <strong className="text-white">
                {locationSharingEnabled
                  ? sharingSessionMinutes
                    ? `Active (${sharingSessionMinutes}m session)`
                    : 'Active (Explicit Consent)'
                  : 'Paused (Private)'}
              </strong>
            </span>
          </span>

          {locationSharingEnabled ? (
            <button
              type="button"
              onClick={() => {
                onToggleLocationSharing(false);
                audioEngine.speak('Live location sharing stopped. Your GPS coordinates are now private.', language);
              }}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-rose-950/70 hover:bg-rose-900/70 border border-rose-700/70 text-rose-200 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Stop Sharing Location
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onToggleLocationSharing(true, 60);
                  audioEngine.speak('Sharing your live location with authorized family members for 60 minutes.', language);
                }}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 text-slate-950 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Share Location (1h Session)
              </button>
              <button
                type="button"
                onClick={() => {
                  onToggleLocationSharing(true);
                  audioEngine.speak('Live location sharing enabled with your trusted family group.', language);
                }}
                className="px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Share Until Stopped
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Split Grid: Left = Interactive Google Map, Right = Family Group or Navigation Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left Column: Google Maps Platform Interactive Viewport */}
        <div className="lg:col-span-7 bg-[#0C1322] border border-slate-800 rounded-2xl p-5 flex flex-col justify-between space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-white">
                {activeTab === 'family'
                  ? 'Trusted Family Live GPS Map'
                  : 'Smart Navigation & Nearby Places Map'}
              </h2>
              <p className="text-xs text-slate-400 font-mono tabular-nums">
                Your GPS: {userLocation.lat.toFixed(4)}° N, {userLocation.lng.toFixed(4)}° E
              </p>
            </div>

            {activeTab === 'navigation' && (
              <div className="inline-flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
                <button
                  type="button"
                  onClick={() => setTravelMode('WALKING')}
                  className={`px-3 py-1 rounded text-xs font-medium cursor-pointer ${
                    travelMode === 'WALKING'
                      ? 'bg-cyan-400 text-slate-950 font-semibold'
                      : 'text-slate-300'
                  }`}
                >
                  Walking
                </button>
                <button
                  type="button"
                  onClick={() => setTravelMode('DRIVING')}
                  className={`px-3 py-1 rounded text-xs font-medium cursor-pointer ${
                    travelMode === 'DRIVING'
                      ? 'bg-cyan-400 text-slate-950 font-semibold'
                      : 'text-slate-300'
                  }`}
                >
                  Transit / Drive
                </button>
              </div>
            )}
          </div>

          {/* Explicit Height Container for Google Map (CF2 Compliance) */}
          <div className="w-full h-[400px] rounded-xl overflow-hidden border border-slate-800 relative bg-slate-950">
            {MAPS_API_KEY ? (
              <APIProvider apiKey={MAPS_API_KEY}>
                <Map
                  defaultCenter={userLocation}
                  defaultZoom={14}
                  mapId="DEMO_MAP_ID"
                  gestureHandling="greedy"
                  internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                  style={{ width: '100%', height: '100%' }}
                >
                  {/* User's Current Position Marker */}
                  <AdvancedMarker position={userLocation} title="Your Location">
                    <Pin background="#22D3EE" glyphColor="#070B14" borderColor="#0891B2" />
                  </AdvancedMarker>

                  {/* Family Member Markers */}
                  {activeTab === 'family' &&
                    familyMembers
                      .filter((m) => m.status === 'connected')
                      .map((member) => (
                        <AdvancedMarker
                          key={member.id}
                          position={{ lat: member.lat, lng: member.lng }}
                          title={`${member.name} (${member.relation})`}
                          onClick={() => handleAnnounceFamilyMember(member)}
                        >
                          <Pin
                            background={member.id === selectedMemberId ? '#10B981' : '#3B82F6'}
                            glyphColor="#FFFFFF"
                            borderColor="#1E3A8A"
                          />
                        </AdvancedMarker>
                      ))}

                  {/* Nearby Place Markers & Route Calculation */}
                  {activeTab === 'navigation' && (
                    <>
                      <RouteOverlayAndPlaces
                        userLocation={userLocation}
                        selectedCategory={requestedPlaceCategory}
                        activeDestination={activeDestination}
                        travelMode={travelMode}
                        onPlacesLoaded={setLivePlaces}
                        onRouteComputed={setComputedRouteInfo}
                      />
                      {livePlaces.map((place) => (
                        <AdvancedMarker
                          key={place.id}
                          position={{ lat: place.lat, lng: place.lng }}
                          title={place.name}
                          onClick={() => handleStartRouteToPlace(place)}
                        >
                          <Pin
                            background={
                              activeDestination?.id === place.id ? '#F59E0B' : '#6366F1'
                            }
                            glyphColor="#FFFFFF"
                            borderColor="#312E81"
                          />
                        </AdvancedMarker>
                      ))}
                    </>
                  )}
                </Map>
              </APIProvider>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-2">
                <MapPin className="w-8 h-8 text-cyan-400" />
                <p className="text-sm font-medium text-white">
                  Google Maps Platform API Key Not Configured
                </p>
                <p className="text-xs text-slate-400 max-w-md">
                  Configure VITE_GOOGLE_MAPS_API_KEY in your environment secrets to render live
                  Google Maps tiles, Places API (New) searches, and Routes API polylines.
                </p>
              </div>
            )}
          </div>

          {/* Safety & Privacy Footer inside Map Card */}
          <div className="flex items-start gap-2.5 pt-2 border-t border-slate-800 text-xs text-slate-400">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              {activeTab === 'family'
                ? 'Privacy Rule: Only family members with status "Connected" can view shared coordinates, and you can revoke access or stop sharing at any time.'
                : 'Mobility Safety Notice: GPS routing assists with macro-navigation and is never a substitute for a white cane, guide dog, or real-time physical obstacle awareness.'}
            </span>
          </div>
        </div>

        {/* Right Column: Family Group Manager OR Smart Navigation Panel */}
        <div className="lg:col-span-5 bg-[#0C1322] border border-slate-800 rounded-2xl p-6 flex flex-col justify-between space-y-6">
          {activeTab === 'family' ? (
            <>
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div>
                    <span className="text-xs text-cyan-400 font-medium">
                      Explicit Consent Circle
                    </span>
                    <h3 className="text-lg font-bold text-white font-display">
                      Trusted Family Members ({familyMembers.length})
                    </h3>
                  </div>
                  <ShieldCheck className="w-5 h-5 text-cyan-400" />
                </div>

                {/* Family Member List */}
                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                  {familyMembers.map((member) => (
                    <div
                      key={member.id}
                      className={`p-3.5 rounded-xl border transition-colors ${
                        selectedMemberId === member.id
                          ? 'bg-slate-900 border-cyan-400/60'
                          : 'bg-slate-900/70 border-slate-800'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-white">
                              {member.name}
                            </span>
                            <span className="text-xs text-slate-400">·</span>
                            <span className="text-xs text-cyan-400">{member.relation}</span>
                          </div>
                          <p className="text-xs text-slate-400 font-mono tabular-nums mt-0.5">
                            {member.status === 'connected'
                              ? `${member.lat.toFixed(4)}° N, ${member.lng.toFixed(4)}° E · ${member.lastUpdated}`
                              : `Status: ${member.status.toUpperCase()} (${member.inviteEmail})`}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleAnnounceFamilyMember(member)}
                            aria-label={`Speak location status for ${member.name}`}
                            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 cursor-pointer"
                          >
                            <Volume2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-2.5 border-t border-slate-800/80 text-xs">
                        <div className="flex items-center gap-3 text-slate-300 font-mono tabular-nums">
                          <span className="flex items-center gap-1">
                            <BatteryCharging className="w-3.5 h-3.5 text-emerald-400" />
                            {member.batteryLevel}%
                          </span>
                          <span>·</span>
                          <span>{member.isOnline ? 'Online' : 'Last Known Fix'}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          {member.status === 'invited' && (
                            <button
                              type="button"
                              onClick={() => onUpdateFamilyMemberStatus(member.id, 'connected')}
                              className="text-emerald-400 hover:text-emerald-300 font-medium cursor-pointer"
                            >
                              Approve Consent
                            </button>
                          )}
                          {member.status === 'connected' ? (
                            <button
                              type="button"
                              onClick={() => onUpdateFamilyMemberStatus(member.id, 'revoked')}
                              className="text-rose-400 hover:text-rose-300 font-medium cursor-pointer"
                            >
                              Revoke Access
                            </button>
                          ) : (
                            member.status === 'revoked' && (
                              <button
                                type="button"
                                onClick={() => onUpdateFamilyMemberStatus(member.id, 'connected')}
                                className="text-cyan-400 hover:text-cyan-300 font-medium cursor-pointer"
                              >
                                Restore Access
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add Family Member Invitation Form */}
              <form
                onSubmit={handleInviteSubmit}
                className="space-y-3 pt-4 border-t border-slate-800"
              >
                <p className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4 text-cyan-400" />
                  <span>Invite Trusted Family Member</span>
                </p>

                {inviteError && (
                  <p role="alert" className="text-xs text-rose-400">
                    {inviteError}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label htmlFor="fam-name-input" className="sr-only">
                      Family Member Name
                    </label>
                    <input
                      id="fam-name-input"
                      type="text"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      placeholder="Full Name (e.g., Sunita)"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="fam-rel-input" className="sr-only">
                      Relationship
                    </label>
                    <input
                      id="fam-rel-input"
                      type="text"
                      value={inviteRelation}
                      onChange={(e) => setInviteRelation(e.target.value)}
                      placeholder="Relation (e.g., Mother)"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="fam-phone-input" className="sr-only">
                      Phone Number
                    </label>
                    <input
                      id="fam-phone-input"
                      type="tel"
                      value={invitePhone}
                      onChange={(e) => setInvitePhone(e.target.value)}
                      placeholder="Phone (+91 98765...)"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="fam-email-input" className="sr-only">
                      Invitation Email
                    </label>
                    <input
                      id="fam-email-input"
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="Email Address"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 px-4 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-semibold text-xs transition-colors cursor-pointer"
                >
                  Send Consent-Based Family Invitation
                </button>
              </form>
            </>
          ) : (
            /* SMART NAVIGATION PANEL */
            <>
              <div className="space-y-4">
                <div className="border-b border-slate-800 pb-3">
                  <span className="text-xs text-cyan-400 font-medium">
                    Google Maps Platform Places API (New) & Routes API
                  </span>
                  <h3 className="text-lg font-bold text-white font-display">
                    Nearby Essential Places
                  </h3>
                </div>

                {/* Category Filter Buttons */}
                <div
                  role="group"
                  aria-label="Filter nearby places by category"
                  className="grid grid-cols-3 gap-2"
                >
                  {placeCategories.map((cat) => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => onSelectPlaceCategory(cat.value)}
                      className={`px-3 py-2 rounded-xl text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        requestedPlaceCategory === cat.value
                          ? 'bg-cyan-400 text-slate-950 border-cyan-400 font-semibold'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
                      }`}
                    >
                      {language === 'hi' ? cat.hiLabel : cat.label}
                    </button>
                  ))}
                </div>

                {/* Live Places List from Google Maps Platform Places API (New) */}
                <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                  {livePlaces.length === 0 ? (
                    <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 text-xs text-slate-300 space-y-2">
                      <p className="font-medium text-white">
                        Querying Google Maps Places API (New) near your coordinates...
                      </p>
                      <p className="text-slate-400">
                        Select a category above or say &ldquo;Hey NEX, nearest hospital batao&rdquo;
                        to search live points of interest around your GPS location.
                      </p>
                    </div>
                  ) : (
                    livePlaces.map((place) => (
                      <div
                        key={place.id}
                        className={`p-3.5 rounded-xl border transition-colors flex items-center justify-between gap-3 ${
                          activeDestination?.id === place.id
                            ? 'bg-slate-900 border-cyan-400'
                            : 'bg-slate-900/80 border-slate-800'
                        }`}
                      >
                        <div className="space-y-0.5 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{place.name}</p>
                          <p className="text-xs text-slate-400 truncate">{place.address}</p>
                          <p className="text-xs font-mono text-cyan-400 tabular-nums">
                            {place.distanceKm} km · ~{place.durationMins} mins
                            {place.rating ? ` · ★ ${place.rating}` : ''}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleStartRouteToPlace(place)}
                          className="px-3 py-2 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-semibold text-xs whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5"
                        >
                          <RouteIcon className="w-3.5 h-3.5" />
                          <span>Route</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* Active Route Voice Guidance Summary */}
                {activeDestination && (
                  <div
                    aria-live="polite"
                    className="p-4 rounded-xl bg-slate-900 border border-cyan-400/50 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-cyan-400">
                        Active Voice Route: {activeDestination.name}
                      </span>
                      <span className="text-xs font-mono text-white tabular-nums flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-cyan-400" />
                        {computedRouteInfo
                          ? `${(computedRouteInfo.distanceMeters / 1000).toFixed(1)} km · ${Math.max(
                              1,
                              Math.round(computedRouteInfo.durationMillis / 60000)
                            )} min`
                          : `${activeDestination.distanceKm} km · ${activeDestination.durationMins} min`}
                      </span>
                    </div>
                    <ul className="text-xs text-slate-200 space-y-1">
                      {(
                        computedRouteInfo?.steps || [
                          `Proceed toward ${activeDestination.name} (${activeDestination.distanceKm} km).`,
                          `Destination address: ${activeDestination.address}.`,
                        ]
                      ).map((step, idx) => (
                        <li key={idx}>
                          {idx + 1}. {step}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-800 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    if (livePlaces.length > 0) {
                      handleStartRouteToPlace(livePlaces[0]);
                    } else {
                      audioEngine.speak(
                        'Searching nearby places via Google Maps Platform. Please ensure location permission is active.',
                        language
                      );
                    }
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-semibold text-xs transition-colors cursor-pointer"
                >
                  Announce Nearest Result & Start Voice Guidance
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
