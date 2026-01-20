/**
 * GET /api/transport/departures
 * Get live departures from a station
 * 
 * Query params:
 * - station: station ID or name (required)
 * - duration: time window in minutes (default 60)
 * - results: max results (default 20)
 */

import type { APIRoute } from 'astro';
import { 
  getDepartures, 
  searchLocations,
  formatDelay,
  getProductIcon 
} from '../../../lib/db-transport';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const station = url.searchParams.get('station');
  const duration = parseInt(url.searchParams.get('duration') || '60');
  const results = parseInt(url.searchParams.get('results') || '20');
  
  if (!station) {
    return new Response(
      JSON.stringify({ error: 'Parameter "station" is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  try {
    // If station is not an ID, search for it first
    let stationId = station;
    let stationName = station;
    
    if (!/^\d{7,8}$/.test(station)) {
      const stops = await searchLocations(station, { results: 1 });
      if (stops.length === 0) {
        return new Response(
          JSON.stringify({ error: `Station not found: ${station}` }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }
      stationId = stops[0].id;
      stationName = stops[0].name;
    }
    
    const response = await getDepartures(stationId, {
      duration: Math.min(duration, 720), // max 12 hours
      results: Math.min(results, 50),
    });
    
    // Transform for frontend
    const departures = response.departures.map(dep => ({
      time: dep.when,
      plannedTime: dep.plannedWhen,
      delay: formatDelay(dep.delay),
      delayMinutes: dep.delay ? Math.round(dep.delay / 60) : 0,
      line: dep.line?.name,
      product: dep.line?.product,
      productIcon: getProductIcon(dep.line?.product || ''),
      direction: dep.direction,
      platform: dep.platform,
      plannedPlatform: dep.plannedPlatform,
      platformChanged: dep.platform !== dep.plannedPlatform && dep.plannedPlatform !== null,
      cancelled: dep.when === null,
      remarks: dep.remarks?.filter(r => r.type === 'warning' || r.type === 'status').map(r => r.summary || r.text),
    }));
    
    return new Response(JSON.stringify({
      station: {
        id: stationId,
        name: stationName,
      },
      departures,
      updatedAt: response.realtimeDataUpdatedAt,
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=30', // 30s cache for realtime
      },
    });
  } catch (error) {
    console.error('Departures error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch departures' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
