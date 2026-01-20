/**
 * GET /api/flights/airports
 * Search for airports by keyword
 * 
 * Query params:
 * - q: search query (required)
 */

import type { APIRoute } from 'astro';
import { searchAirports, GERMAN_AIRPORTS } from '../../../lib/amadeus-flights';

export const prerender = false;

// Check if Amadeus is configured
function isAmadeusConfigured(): boolean {
  return !!(import.meta.env.AMADEUS_CLIENT_ID && import.meta.env.AMADEUS_CLIENT_SECRET);
}

// Fallback: Search in local German airports
function searchLocalAirports(query: string): any[] {
  const normalized = query.toLowerCase();
  const results: any[] = [];
  
  for (const [city, code] of Object.entries(GERMAN_AIRPORTS)) {
    if (
      city.toLowerCase().includes(normalized) ||
      code.toLowerCase().includes(normalized)
    ) {
      results.push({
        name: `${city} Airport`,
        iataCode: code,
        city: city,
        country: 'Germany',
      });
    }
  }
  
  // Add some international airports for demo
  const internationalAirports = [
    { name: 'London Heathrow Airport', iataCode: 'LHR', city: 'London', country: 'United Kingdom' },
    { name: 'Paris Charles de Gaulle Airport', iataCode: 'CDG', city: 'Paris', country: 'France' },
    { name: 'Amsterdam Airport Schiphol', iataCode: 'AMS', city: 'Amsterdam', country: 'Netherlands' },
    { name: 'Madrid Barajas Airport', iataCode: 'MAD', city: 'Madrid', country: 'Spain' },
    { name: 'Barcelona El Prat Airport', iataCode: 'BCN', city: 'Barcelona', country: 'Spain' },
    { name: 'Rome Fiumicino Airport', iataCode: 'FCO', city: 'Rome', country: 'Italy' },
    { name: 'Vienna International Airport', iataCode: 'VIE', city: 'Vienna', country: 'Austria' },
    { name: 'Zurich Airport', iataCode: 'ZRH', city: 'Zurich', country: 'Switzerland' },
  ];
  
  for (const airport of internationalAirports) {
    if (
      airport.name.toLowerCase().includes(normalized) ||
      airport.iataCode.toLowerCase().includes(normalized) ||
      airport.city.toLowerCase().includes(normalized)
    ) {
      results.push(airport);
    }
  }
  
  return results.slice(0, 10);
}

export const GET: APIRoute = async ({ url }) => {
  const query = url.searchParams.get('q');
  
  if (!query || query.length < 2) {
    return new Response(
      JSON.stringify({ error: 'Query parameter "q" is required (min 2 characters)' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  // Use local search if Amadeus is not configured
  if (!isAmadeusConfigured()) {
    const results = searchLocalAirports(query);
    return new Response(JSON.stringify(results), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }
  
  try {
    const airports = await searchAirports(query);
    
    const results = airports.map(a => ({
      name: a.name,
      iataCode: a.iataCode,
      city: a.address?.cityName,
      country: a.address?.countryName,
    }));
    
    return new Response(JSON.stringify(results), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error: any) {
    console.error('Airport search error:', error);
    
    // Fallback to local search on error
    const results = searchLocalAirports(query);
    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
