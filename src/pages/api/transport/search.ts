/**
 * GET /api/transport/search
 * Search for train stations and stops
 * 
 * Query params:
 * - q: search query (required)
 * - limit: max results (default 10)
 */

import type { APIRoute } from 'astro';
import { searchLocations } from '../../../lib/db-transport';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const query = url.searchParams.get('q');
  const limit = parseInt(url.searchParams.get('limit') || '10');
  
  if (!query || query.length < 2) {
    return new Response(
      JSON.stringify({ error: 'Query parameter "q" is required (min 2 characters)' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  try {
    const stops = await searchLocations(query, {
      results: Math.min(limit, 20),
      stops: true,
      addresses: false,
      poi: false,
    });
    
    // Simplify response for frontend
    const results = stops.map(stop => ({
      id: stop.id,
      name: stop.name,
      lat: stop.location?.latitude,
      lng: stop.location?.longitude,
      products: stop.products,
    }));
    
    return new Response(JSON.stringify(results), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600', // 1 hour cache
      },
    });
  } catch (error) {
    console.error('Station search error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to search stations' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
