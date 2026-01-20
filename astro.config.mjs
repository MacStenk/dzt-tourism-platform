import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'hybrid',
  adapter: cloudflare({ mode: 'directory' }),
  site: 'https://reise.codeback.de'
});