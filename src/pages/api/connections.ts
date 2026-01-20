import type { APIRoute } from 'astro';

const MOTIS_BASE_URL = 'https://europe.motis-project.de/api/v1';

interface ConnectionRequest {
  from: string;  // Koordinaten "lat,lon" oder Stationsname
  to: string;
  date?: string; // ISO format
  time?: string; // HH:mm
}

interface MotisLeg {
  mode: string;
  from: { name: string; departure: string };
  to: { name: string; arrival: string };
  duration: number;
}

interface MotisItinerary {
  duration: number;
  startTime: string;
  endTime: string;
  transfers: number;
  legs: MotisLeg[];
}

// Deutsche Städte -> Koordinaten (Erweiterbar via DZT Knowledge Graph)
const CITY_COORDS: Record<string, string> = {
  'berlin': '52.5200,13.4050',
  'hamburg': '53.5511,9.9937',
  'münchen': '48.1351,11.5820',
  'muenchen': '48.1351,11.5820',
  'köln': '50.9375,6.9603',
  'koeln': '50.9375,6.9603',
  'frankfurt': '50.1109,8.6821',
  'düsseldorf': '51.2277,6.7735',
  'duesseldorf': '51.2277,6.7735',
  'stuttgart': '48.7758,9.1829',
  'dortmund': '51.5136,7.4653',
  'essen': '51.4556,7.0116',
  'leipzig': '51.3397,12.3731',
  'dresden': '51.0504,13.7373',
  'hannover': '52.3759,9.7320',
  'nürnberg': '49.4521,11.0767',
  'nuernberg': '49.4521,11.0767',
  'bremen': '53.0793,8.8017',
};

function resolveLocation(input: string): string {
  const normalized = input.toLowerCase().trim();
  
  // Bereits Koordinaten?
  if (/^\d+\.\d+,\d+\.\d+$/.test(input)) {
    return input;
  }
  
  // Stadt-Lookup
  if (CITY_COORDS[normalized]) {
    return CITY_COORDS[normalized];
  }
  
  // Fallback: Als Koordinaten interpretieren oder Fehler
  throw new Error(`Unbekannte Stadt: ${input}. Bitte Koordinaten angeben.`);
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`;
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

export const GET: APIRoute = async ({ url }) => {
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];
  const time = url.searchParams.get('time') || '10:00';

  if (!from || !to) {
    return new Response(JSON.stringify({ 
      error: 'Parameter "from" und "to" sind erforderlich' 
    }), { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const fromCoords = resolveLocation(from);
    const toCoords = resolveLocation(to);
    
    const dateTime = `${date}T${time}:00Z`;
    
    const motisUrl = `${MOTIS_BASE_URL}/plan?fromPlace=${fromCoords}&toPlace=${toCoords}&time=${dateTime}&arriveBy=false`;
    
    const response = await fetch(motisUrl);
    
    if (!response.ok) {
      throw new Error(`MOTIS API Fehler: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Aufbereiten der Ergebnisse
    const connections = data.itineraries?.slice(0, 5).map((it: MotisItinerary) => ({
      abfahrt: formatTime(it.startTime),
      ankunft: formatTime(it.endTime),
      dauer: formatDuration(it.duration),
      umstiege: it.transfers,
      verkehrsmittel: [...new Set(it.legs
        .filter((l: MotisLeg) => l.mode !== 'WALK')
        .map((l: MotisLeg) => l.mode)
      )],
      stationen: it.legs.map((l: MotisLeg) => ({
        von: l.from.name,
        nach: l.to.name,
        modus: l.mode,
        abfahrt: formatTime(l.from.departure),
        ankunft: formatTime(l.to.arrival)
      }))
    })) || [];

    return new Response(JSON.stringify({
      von: from,
      nach: to,
      datum: date,
      anzahl: connections.length,
      verbindungen: connections
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unbekannter Fehler'
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
