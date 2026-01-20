/**
 * Deutsche Bahn Transport API Client
 * Wraps v6.db.transport.rest - the public REST API for German public transport
 * 
 * Rate Limit: 100 requests/minute
 * No API key required
 * CORS enabled
 */

const DB_API_BASE = 'https://v6.db.transport.rest';

// Simple in-memory cache
const cache = new Map<string, { data: unknown; expires: number }>();
const CACHE_TTL = 60 * 1000; // 1 minute

async function fetchWithCache<T>(url: string, ttl = CACHE_TTL): Promise<T> {
  const cached = cache.get(url);
  if (cached && cached.expires > Date.now()) {
    return cached.data as T;
  }
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'dzt-tourism-platform/0.1.0'
    }
  });
  
  if (!response.ok) {
    throw new Error(`DB API Error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  cache.set(url, { data, expires: Date.now() + ttl });
  return data as T;
}

// ============ Types (FPTF Format) ============

export interface Location {
  type: 'location';
  id?: string;
  latitude: number;
  longitude: number;
}

export interface Stop {
  type: 'stop';
  id: string;
  name: string;
  location?: Location;
  products?: Products;
}

export interface Products {
  nationalExpress?: boolean; // ICE
  national?: boolean;        // IC/EC
  regionalExp?: boolean;     // RE
  regional?: boolean;        // RB
  suburban?: boolean;        // S-Bahn
  bus?: boolean;
  ferry?: boolean;
  subway?: boolean;          // U-Bahn
  tram?: boolean;
  taxi?: boolean;
}

export interface Line {
  type: 'line';
  id: string;
  name: string;
  mode: 'train' | 'bus' | 'watercraft' | 'taxi' | 'gondola' | 'aircraft' | 'car' | 'bicycle' | 'walking';
  product: string;
  operator?: { id: string; name: string };
}

export interface Leg {
  tripId?: string;
  origin: Stop;
  destination: Stop;
  departure: string;
  plannedDeparture: string;
  departureDelay?: number | null;
  arrival: string;
  plannedArrival: string;
  arrivalDelay?: number | null;
  departurePlatform?: string | null;
  arrivalPlatform?: string | null;
  line?: Line;
  direction?: string;
  walking?: boolean;
  distance?: number;
}

export interface Journey {
  type: 'journey';
  legs: Leg[];
  refreshToken?: string;
  price?: { amount: number; currency: string };
}

export interface JourneysResponse {
  earlierRef?: string;
  laterRef?: string;
  journeys: Journey[];
  realtimeDataUpdatedAt?: number;
}

export interface Departure {
  tripId: string;
  direction: string;
  line: Line;
  stop: Stop;
  when: string | null;
  plannedWhen: string;
  delay: number | null;
  platform: string | null;
  plannedPlatform: string | null;
  remarks?: Array<{ type: string; text?: string; summary?: string }>;
}

export interface DeparturesResponse {
  departures: Departure[];
  realtimeDataUpdatedAt?: number;
}

// ============ API Functions ============

/**
 * Search for stops/stations by name
 */
export async function searchLocations(query: string, options?: {
  results?: number;
  stops?: boolean;
  addresses?: boolean;
  poi?: boolean;
}): Promise<Stop[]> {
  const params = new URLSearchParams({
    query,
    results: String(options?.results ?? 10),
    stops: String(options?.stops ?? true),
    addresses: String(options?.addresses ?? false),
    poi: String(options?.poi ?? false),
  });
  
  return fetchWithCache<Stop[]>(`${DB_API_BASE}/locations?${params}`);
}

/**
 * Get a specific stop by ID
 */
export async function getStop(stopId: string): Promise<Stop> {
  return fetchWithCache<Stop>(`${DB_API_BASE}/stops/${encodeURIComponent(stopId)}`);
}

/**
 * Get departures at a stop
 */
export async function getDepartures(stopId: string, options?: {
  when?: string | Date;
  duration?: number;  // in minutes, default 10
  results?: number;
  nationalExpress?: boolean;
  national?: boolean;
  regionalExp?: boolean;
  regional?: boolean;
  suburban?: boolean;
  bus?: boolean;
}): Promise<DeparturesResponse> {
  const params = new URLSearchParams();
  
  if (options?.when) {
    const when = options.when instanceof Date ? options.when.toISOString() : options.when;
    params.set('when', when);
  }
  if (options?.duration) params.set('duration', String(options.duration));
  if (options?.results) params.set('results', String(options.results));
  
  // Product filters
  if (options?.nationalExpress !== undefined) params.set('nationalExpress', String(options.nationalExpress));
  if (options?.national !== undefined) params.set('national', String(options.national));
  if (options?.regionalExp !== undefined) params.set('regionalExp', String(options.regionalExp));
  if (options?.regional !== undefined) params.set('regional', String(options.regional));
  if (options?.suburban !== undefined) params.set('suburban', String(options.suburban));
  if (options?.bus !== undefined) params.set('bus', String(options.bus));
  
  const queryString = params.toString() ? `?${params}` : '';
  return fetchWithCache<DeparturesResponse>(
    `${DB_API_BASE}/stops/${encodeURIComponent(stopId)}/departures${queryString}`,
    30 * 1000 // 30s cache for realtime data
  );
}

/**
 * Get arrivals at a stop
 */
export async function getArrivals(stopId: string, options?: {
  when?: string | Date;
  duration?: number;
  results?: number;
}): Promise<DeparturesResponse> {
  const params = new URLSearchParams();
  
  if (options?.when) {
    const when = options.when instanceof Date ? options.when.toISOString() : options.when;
    params.set('when', when);
  }
  if (options?.duration) params.set('duration', String(options.duration));
  if (options?.results) params.set('results', String(options.results));
  
  const queryString = params.toString() ? `?${params}` : '';
  return fetchWithCache<DeparturesResponse>(
    `${DB_API_BASE}/stops/${encodeURIComponent(stopId)}/arrivals${queryString}`,
    30 * 1000
  );
}

/**
 * Find journeys from A to B
 */
export async function findJourneys(from: string, to: string, options?: {
  via?: string;
  departure?: string | Date;
  arrival?: string | Date;
  results?: number;
  stopovers?: boolean;
  transfers?: number;        // max transfers, -1 for unlimited
  transferTime?: number;     // min transfer time in minutes
  nationalExpress?: boolean;
  national?: boolean;
  regionalExp?: boolean;
  regional?: boolean;
  suburban?: boolean;
  bus?: boolean;
  tickets?: boolean;
}): Promise<JourneysResponse> {
  const params = new URLSearchParams({
    from,
    to,
  });
  
  if (options?.via) params.set('via', options.via);
  if (options?.departure) {
    const dep = options.departure instanceof Date ? options.departure.toISOString() : options.departure;
    params.set('departure', dep);
  }
  if (options?.arrival) {
    const arr = options.arrival instanceof Date ? options.arrival.toISOString() : options.arrival;
    params.set('arrival', arr);
  }
  if (options?.results) params.set('results', String(options.results));
  if (options?.stopovers !== undefined) params.set('stopovers', String(options.stopovers));
  if (options?.transfers !== undefined) params.set('transfers', String(options.transfers));
  if (options?.transferTime) params.set('transferTime', String(options.transferTime));
  if (options?.tickets !== undefined) params.set('tickets', String(options.tickets));
  
  // Product filters
  if (options?.nationalExpress !== undefined) params.set('nationalExpress', String(options.nationalExpress));
  if (options?.national !== undefined) params.set('national', String(options.national));
  if (options?.regionalExp !== undefined) params.set('regionalExp', String(options.regionalExp));
  if (options?.regional !== undefined) params.set('regional', String(options.regional));
  if (options?.suburban !== undefined) params.set('suburban', String(options.suburban));
  if (options?.bus !== undefined) params.set('bus', String(options.bus));
  
  return fetchWithCache<JourneysResponse>(
    `${DB_API_BASE}/journeys?${params}`,
    60 * 1000 // 1 min cache
  );
}

/**
 * Refresh a journey to get updated realtime data
 */
export async function refreshJourney(refreshToken: string): Promise<Journey> {
  return fetchWithCache<Journey>(
    `${DB_API_BASE}/journeys/${encodeURIComponent(refreshToken)}`,
    30 * 1000
  );
}

// ============ Helper Functions ============

/**
 * Format delay in human-readable form
 */
export function formatDelay(delaySeconds: number | null | undefined): string {
  if (delaySeconds === null || delaySeconds === undefined || delaySeconds === 0) {
    return '';
  }
  const minutes = Math.round(delaySeconds / 60);
  if (minutes > 0) {
    return `+${minutes} min`;
  }
  return `${minutes} min`;
}

/**
 * Calculate total journey duration
 */
export function getJourneyDuration(journey: Journey): number {
  if (journey.legs.length === 0) return 0;
  const firstLeg = journey.legs[0];
  const lastLeg = journey.legs[journey.legs.length - 1];
  const start = new Date(firstLeg.departure).getTime();
  const end = new Date(lastLeg.arrival).getTime();
  return Math.round((end - start) / (1000 * 60)); // minutes
}

/**
 * Format duration in hours and minutes
 */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} Min`;
  if (mins === 0) return `${hours} Std`;
  return `${hours} Std ${mins} Min`;
}

/**
 * Get transfer count for a journey
 */
export function getTransferCount(journey: Journey): number {
  // Walking legs don't count as transfers
  const transportLegs = journey.legs.filter(leg => !leg.walking);
  return Math.max(0, transportLegs.length - 1);
}

/**
 * Get product icon/emoji for a line
 */
export function getProductIcon(product: string): string {
  const icons: Record<string, string> = {
    nationalExpress: 'ICE',
    national: 'IC',
    regionalExp: 'RE',
    regional: 'RB',
    suburban: 'S',
    subway: 'U',
    tram: 'Tram',
    bus: 'Bus',
    ferry: 'Fähre',
    taxi: 'Taxi',
  };
  return icons[product] || product;
}
