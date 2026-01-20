/**
 * GET /api/transport/journeys
 * Find train connections between two stations
 * 
 * Query params:
 * - from: origin station ID or name (required)
 * - to: destination station ID or name (required)
 * - when: departure time ISO string (optional, default now)
 * - results: max results (default 5)
 * - transfers: max transfers (optional)
 */

import type { APIRoute } from 'astro';
import { 
  findJourneys, 
  searchLocations,
  getJourneyDuration,
  formatDuration,
  getTransferCount,
  formatDelay 
} from '../../../lib/db-transport';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const when = url.searchParams.get('when');
  const results = parseInt(url.searchParams.get('results') || '5');
  const transfers = url.searchParams.get('transfers');
  
  if (!from || !to) {
    return new Response(
      JSON.stringify({ error: 'Parameters "from" and "to" are required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  try {
    // If from/to are not IDs (8 digits), search for them first
    let fromId = from;
    let toId = to;
    
    if (!/^\d{7,8}$/.test(from)) {
      const fromStops = await searchLocations(from, { results: 1 });
      if (fromStops.length === 0) {
        return new Response(
          JSON.stringify({ error: `Station not found: ${from}` }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }
      fromId = fromStops[0].id;
    }
    
    if (!/^\d{7,8}$/.test(to)) {
      const toStops = await searchLocations(to, { results: 1 });
      if (toStops.length === 0) {
        return new Response(
          JSON.stringify({ error: `Station not found: ${to}` }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }
      toId = toStops[0].id;
    }
    
    const journeysResponse = await findJourneys(fromId, toId, {
      departure: when || undefined,
      results: Math.min(results, 10),
      transfers: transfers ? parseInt(transfers) : undefined,
      stopovers: true,
    });
    
    // Transform for frontend
    const journeys = journeysResponse.journeys.map(journey => {
      const firstLeg = journey.legs[0];
      const lastLeg = journey.legs[journey.legs.length - 1];
      const transportLegs = journey.legs.filter(leg => !leg.walking && leg.line);
      
      return {
        departure: firstLeg.departure,
        plannedDeparture: firstLeg.plannedDeparture,
        departureDelay: formatDelay(firstLeg.departureDelay),
        arrival: lastLeg.arrival,
        plannedArrival: lastLeg.plannedArrival,
        arrivalDelay: formatDelay(lastLeg.arrivalDelay),
        duration: formatDuration(getJourneyDuration(journey)),
        durationMinutes: getJourneyDuration(journey),
        transfers: getTransferCount(journey),
        price: journey.price,
        origin: {
          id: firstLeg.origin.id,
          name: firstLeg.origin.name,
          platform: firstLeg.departurePlatform,
        },
        destination: {
          id: lastLeg.destination.id,
          name: lastLeg.destination.name,
          platform: lastLeg.arrivalPlatform,
        },
        products: transportLegs.map(leg => ({
          line: leg.line?.name,
          product: leg.line?.product,
          direction: leg.direction,
        })),
        legs: journey.legs.map(leg => ({
          origin: leg.origin.name,
          destination: leg.destination.name,
          departure: leg.departure,
          arrival: leg.arrival,
          line: leg.line?.name,
          product: leg.line?.product,
          direction: leg.direction,
          walking: leg.walking,
          distance: leg.distance,
          departurePlatform: leg.departurePlatform,
          arrivalPlatform: leg.arrivalPlatform,
          departureDelay: formatDelay(leg.departureDelay),
          arrivalDelay: formatDelay(leg.arrivalDelay),
        })),
        refreshToken: journey.refreshToken,
      };
    });
    
    return new Response(JSON.stringify({
      journeys,
      earlierRef: journeysResponse.earlierRef,
      laterRef: journeysResponse.laterRef,
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60', // 1 min cache
      },
    });
  } catch (error) {
    console.error('Journey search error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to find journeys' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
