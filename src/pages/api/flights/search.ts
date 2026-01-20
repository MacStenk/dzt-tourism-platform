/**
 * GET /api/flights/search
 * Search for flight offers
 * 
 * Query params:
 * - from: origin city/airport (required)
 * - to: destination city/airport (required)
 * - date: departure date YYYY-MM-DD (required)
 * - return: return date YYYY-MM-DD (optional)
 * - adults: number of adults (default 1)
 * - class: ECONOMY, PREMIUM_ECONOMY, BUSINESS, FIRST (default ECONOMY)
 */

import type { APIRoute } from 'astro';
import {
  searchFlights,
  getAirportCode,
  parseDuration,
  getStops,
  formatPrice,
  getAirlineName,
  type FlightOffer,
  type Itinerary,
} from '../../../lib/amadeus-flights';

export const prerender = false;

// Check if Amadeus is configured
function isAmadeusConfigured(): boolean {
  return !!(import.meta.env.AMADEUS_CLIENT_ID && import.meta.env.AMADEUS_CLIENT_SECRET);
}

// Mock data for when Amadeus is not configured
function getMockFlights(from: string, to: string, date: string): any {
  const basePrice = Math.floor(Math.random() * 150) + 50;
  
  return {
    flights: [
      {
        id: 'mock-1',
        price: basePrice,
        currency: 'EUR',
        departure: {
          time: `${date}T08:30:00`,
          airport: from,
        },
        arrival: {
          time: `${date}T10:15:00`,
          airport: to,
        },
        duration: '1h 45m',
        durationMinutes: 105,
        stops: 0,
        airline: 'Lufthansa',
        airlineCode: 'LH',
        flightNumber: 'LH 123',
      },
      {
        id: 'mock-2',
        price: basePrice - 20,
        currency: 'EUR',
        departure: {
          time: `${date}T12:00:00`,
          airport: from,
        },
        arrival: {
          time: `${date}T14:30:00`,
          airport: to,
        },
        duration: '2h 30m',
        durationMinutes: 150,
        stops: 1,
        airline: 'Eurowings',
        airlineCode: 'EW',
        flightNumber: 'EW 456',
        stopover: 'DUS',
      },
      {
        id: 'mock-3',
        price: basePrice + 30,
        currency: 'EUR',
        departure: {
          time: `${date}T18:45:00`,
          airport: from,
        },
        arrival: {
          time: `${date}T20:20:00`,
          airport: to,
        },
        duration: '1h 35m',
        durationMinutes: 95,
        stops: 0,
        airline: 'Lufthansa',
        airlineCode: 'LH',
        flightNumber: 'LH 789',
      },
    ],
    mock: true,
    message: 'Amadeus API not configured. Showing example data.',
  };
}

function transformFlightOffer(
  offer: FlightOffer,
  carriers?: Record<string, string>
): any {
  const outbound = offer.itineraries[0];
  const firstSegment = outbound.segments[0];
  const lastSegment = outbound.segments[outbound.segments.length - 1];
  
  return {
    id: offer.id,
    price: parseFloat(offer.price.grandTotal),
    currency: offer.price.currency,
    departure: {
      time: firstSegment.departure.at,
      airport: firstSegment.departure.iataCode,
      terminal: firstSegment.departure.terminal,
    },
    arrival: {
      time: lastSegment.arrival.at,
      airport: lastSegment.arrival.iataCode,
      terminal: lastSegment.arrival.terminal,
    },
    duration: parseDuration(outbound.duration),
    durationMinutes: outbound.segments.reduce(
      (sum, seg) => sum + parseInt(seg.duration.replace(/PT(\d+)H?(\d+)?M?/, (_, h, m) => String((parseInt(h || '0') * 60) + parseInt(m || '0')))),
      0
    ),
    stops: getStops(outbound),
    airline: getAirlineName(firstSegment.carrierCode, carriers),
    airlineCode: firstSegment.carrierCode,
    flightNumber: `${firstSegment.carrierCode} ${firstSegment.number}`,
    segments: outbound.segments.map(seg => ({
      departure: seg.departure,
      arrival: seg.arrival,
      airline: getAirlineName(seg.carrierCode, carriers),
      flightNumber: `${seg.carrierCode} ${seg.number}`,
      duration: parseDuration(seg.duration),
    })),
  };
}

export const GET: APIRoute = async ({ url }) => {
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const date = url.searchParams.get('date');
  const returnDate = url.searchParams.get('return');
  const adults = parseInt(url.searchParams.get('adults') || '1');
  const travelClass = url.searchParams.get('class') as any || 'ECONOMY';
  
  if (!from || !to || !date) {
    return new Response(
      JSON.stringify({ error: 'Parameters "from", "to", and "date" are required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  // Convert city names to IATA codes
  const originCode = getAirportCode(from);
  const destCode = getAirportCode(to);
  
  if (!originCode) {
    return new Response(
      JSON.stringify({ error: `Unknown origin airport: ${from}. Use IATA code (e.g., FRA, MUC).` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  if (!destCode) {
    return new Response(
      JSON.stringify({ error: `Unknown destination airport: ${to}. Use IATA code (e.g., FRA, MUC).` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  // Return mock data if Amadeus is not configured
  if (!isAmadeusConfigured()) {
    const mockData = getMockFlights(originCode, destCode, date);
    return new Response(JSON.stringify(mockData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  try {
    const response = await searchFlights({
      origin: originCode,
      destination: destCode,
      departureDate: date,
      returnDate: returnDate || undefined,
      adults,
      travelClass,
      maxResults: 10,
    });
    
    const flights = response.data.map(offer =>
      transformFlightOffer(offer, response.dictionaries?.carriers)
    );
    
    return new Response(JSON.stringify({
      flights,
      origin: originCode,
      destination: destCode,
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300', // 5 min cache
      },
    });
  } catch (error: any) {
    console.error('Flight search error:', error);
    
    // Return mock data on error as fallback
    if (error.message?.includes('credentials')) {
      const mockData = getMockFlights(originCode, destCode, date);
      return new Response(JSON.stringify(mockData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    return new Response(
      JSON.stringify({ error: 'Failed to search flights' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
