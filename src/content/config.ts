import { defineCollection, z } from 'astro:content';

// Routen-Artikel für SEO/LLMO
const routes = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    from: z.string(),
    to: z.string(),
    transportModes: z.array(z.enum(['train', 'flight', 'bus'])),
    duration: z.string(),
    priceRange: z.string(),
    highlights: z.array(z.string()),
    publishedAt: z.date(),
  }),
});

// POI-Seiten
const pois = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    city: z.string(),
    region: z.string(),
    category: z.array(z.string()),
    coordinates: z.object({
      lat: z.number(),
      lon: z.number(),
    }),
  }),
});

// Events
const events = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    city: z.string(),
    venue: z.string(),
    date: z.date(),
    category: z.enum(['concert', 'festival', 'theater', 'sport', 'exhibition', 'other']),
    priceFrom: z.number().optional(),
    ticketUrl: z.string().optional(),
  }),
});

export const collections = { routes, pois, events };