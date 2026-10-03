import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import starlight from '@astrojs/starlight';
import starlightOpenAPI, { openAPISidebarGroups } from 'starlight-openapi';
import docsCsp from './src/integrations/docs-csp.mjs';

export default defineConfig({
  site: 'https://krakenkey.io',
  output: 'static',
  integrations: [
    starlight({
      title: 'KrakenKey Docs',
      logo: { src: './public/favicon.svg' },
      favicon: '/favicon.svg',
      // The site's own 404 page stays in charge.
      disable404Route: true,
      customCss: ['./src/styles/starlight.css'],
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/KrakenKey' }],
      head: [
        { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' } },
        { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: true } },
        {
          tag: 'link',
          attrs: {
            rel: 'stylesheet',
            href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
          },
        },
        { tag: 'meta', attrs: { property: 'og:image', content: 'https://krakenkey.io/og-image.png' } },
      ],
      plugins: [
        starlightOpenAPI([
          {
            base: 'docs/api',
            schema: './public/openapi.json',
            sidebar: { label: 'API reference', collapsed: true, operations: { badges: true } },
          },
        ]),
      ],
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'Overview', slug: 'docs' },
            { slug: 'docs/getting-started' },
            { slug: 'docs/ai-agents' },
          ],
        },
        {
          label: 'Integrations',
          // New guides in src/content/docs/docs/integrations/ appear here on their own.
          items: [{ autogenerate: { directory: 'docs/integrations' } }],
        },
        {
          label: 'CLI',
          items: [{ autogenerate: { directory: 'docs/cli' } }],
        },
        ...openAPISidebarGroups,
      ],
    }),
    sitemap(),
    docsCsp(),
  ],
  markdown: {
    shikiConfig: {
      theme: 'one-dark-pro',
    },
  },
});
