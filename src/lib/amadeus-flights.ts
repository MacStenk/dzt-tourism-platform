/**
 * Amadeus Flight API Client
 * Self-Service API for flight search
 * 
 * Free Tier: 2000 calls/month
 * Test Environment: Returns fake but realistic data
 * 
 * To use: Set AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET env vars
 * Get credentials at: https://developers.amadeus.com/
 */

const AMADEUS_API_BASE = 'https://test.api.amadeus.com'; // Use production.api.amadeus.com for live

// Token cache
let accessToken: string | null = null;
let tokenExpiry: number = 0;

// ============ Types ============

export interface FlightOffer {
  id: string;
  source: string;
  price: {
    total: string;
    currency: string;
    grandTotal: string;
  };
  itineraries: Itinerary[];
  validatingAirlineCodes: string[];
  travelerPricings: TravelerPricing[];
}

export interface Itinerary {
  duration: string; // e.g. "PT10H30M"
  segments: Segment[];
}

export interface Segment {
  departure: {
    iataCode: string;
    terminal?: string;
    at: string; // ISO datetime
  };
  arrival: {
    iataCode: string;
    terminal?: string;
    at: string;
  };
  carrierCode: string;
  number: string; // flight number
  aircraft: { code: string };
  operating?: { carrierCode: string };
  duration: string;
  numberOfStops: number;
}

export interface TravelerPricing {
  travelerId: string;
  fareOption: string;
  travelerType: string;
  price: {
    currency: string;
    total: string;
  };
}

export interface FlightSearchResponse {
  data: FlightOffer[];
  dictionaries?: {
    carriers: Record<string, string>;
    aircraft: Record<string, string>;
  };
}

export interface AirportLocation {
  type: string;
  subType: string;
  name: string;
  detailedName?: string;
  id: string;
  iataCode: string;
  address: {
    cityName: string;
    countryName: string;
  };
}

// ============ Auth ============

async function getAccessToken(): Promise<string> {
  const clientId = import.meta.env.AMADEUS_CLIENT_ID;
  const clientSecret = import.meta.env.AMADEUS_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    throw new Error('Amadeus API credentials not configured. Set AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET.');
  }
  
  // Return cached token if valid
  if (accessToken && Date.now() < tokenExpiry - 60000) {
    return accessToken;
  }
  
  const response = await fetch(`${AMADEUS_API_BASE}/v1/security/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Amadeus auth failed: ${response.status}`);
  }
  
  const data = await response.json();
  accessToken = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000;
  
  return accessToken!;
}

async function amadeusRequest<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  
  const response = await fetch(`${AMADEUS_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error_description || `Amadeus API error: ${response.status}`);
  }
  
  return response.json();
}

// ============ API Functions ============

/**
 * Search for airport/city by keyword
 */
export async function searchAirports(keyword: string): Promise<AirportLocation[]> {
  const params = new URLSearchParams({
    keyword,
    subType: 'AIRPORT,CITY',
    'page[limit]': '10',
  });
  
  const response = await amadeusRequest<{ data: AirportLocation[] }>(
    `/v1/reference-data/locations?${params}`
  );
  
  return response.data || [];
}

/**
 * Search for flight offers
 */
export async function searchFlights(options: {
  origin: string;        // IATA code (e.g., 'FRA')
  destination: string;   // IATA code
  departureDate: string; // YYYY-MM-DD
  returnDate?: string;   // YYYY-MM-DD for round trip
  adults?: number;
  children?: number;
  travelClass?: 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST';
  nonStop?: boolean;
  maxResults?: number;
}): Promise<FlightSearchResponse> {
  const params = new URLSearchParams({
    originLocationCode: options.origin,
    destinationLocationCode: options.destination,
    departureDate: options.departureDate,
    adults: String(options.adults || 1),
    max: String(options.maxResults || 10),
  });
  
  if (options.returnDate) {
    params.set('returnDate', options.returnDate);
  }
  if (options.children) {
    params.set('children', String(options.children));
  }
  if (options.travelClass) {
    params.set('travelClass', options.travelClass);
  }
  if (options.nonStop) {
    params.set('nonStop', 'true');
  }
  
  return amadeusRequest<FlightSearchResponse>(
    `/v2/shopping/flight-offers?${params}`
  );
}

/**
 * Get cheapest dates for a route
 */
export async function getFlightDates(options: {
  origin: string;
  destination: string;
}): Promise<any> {
  const params = new URLSearchParams({
    origin: options.origin,
    destination: options.destination,
  });
  
  return amadeusRequest(`/v1/shopping/flight-dates?${params}`);
}

// ============ Helper Functions ============

/**
 * Parse ISO 8601 duration to human-readable format
 * e.g., "PT10H30M" -> "10h 30m"
 */
export function parseDuration(duration: string): string {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return duration;
  
  const hours = match[1] ? `${match[1]}h` : '';
  const minutes = match[2] ? `${match[2]}m` : '';
  
  return [hours, minutes].filter(Boolean).join(' ');
}

/**
 * Get total duration in minutes
 */
export function getDurationMinutes(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return 0;
  
  const hours = parseInt(match[1] || '0');
  const minutes = parseInt(match[2] || '0');
  
  return hours * 60 + minutes;
}

/**
 * Get number of stops in an itinerary
 */
export function getStops(itinerary: Itinerary): number {
  return itinerary.segments.length - 1;
}

/**
 * Format price
 */
export function formatPrice(price: string, currency: string): string {
  const num = parseFloat(price);
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
  }).format(num);
}

/**
 * Get airline name from code using dictionaries
 */
export function getAirlineName(
  code: string,
  carriers?: Record<string, string>
): string {
  return carriers?.[code] || code;
}

// German airport IATA codes for common cities
export const GERMAN_AIRPORTS: Record<string, string> = {
  'Berlin': 'BER',
  'Frankfurt': 'FRA',
  'München': 'MUC',
  'Hamburg': 'HAM',
  'Düsseldorf': 'DUS',
  'Köln': 'CGN',
  'Stuttgart': 'STR',
  'Hannover': 'HAJ',
  'Nürnberg': 'NUE',
  'Leipzig': 'LEJ',
  'Dresden': 'DRS',
  'Bremen': 'BRE',
};

/**
 * Try to get IATA code for a German city
 */
export function getAirportCode(city: string): string | undefined {
  // Exact match
  if (GERMAN_AIRPORTS[city]) return GERMAN_AIRPORTS[city];
  
  // Partial match
  const normalized = city.toLowerCase();
  for (const [name, code] of Object.entries(GERMAN_AIRPORTS)) {
    if (name.toLowerCase().includes(normalized) || normalized.includes(name.toLowerCase())) {
      return code;
    }
  }
  
  // Maybe it's already an IATA code
  if (/^[A-Z]{3}$/.test(city.toUpperCase())) {
    return city.toUpperCase();
  }
  
  return undefined;
}
