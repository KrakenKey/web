import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import starlight from '@astrojs/starlight';

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
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'Overview', slug: 'docs' },
            { label: 'Getting started', link: '/getting-started/' },
          ],
        },
        {
          label: 'Integrations',
          items: [{ slug: 'docs/integrations/azure-key-vault' }],
        },
        {
          label: 'Reference',
          items: [
            { label: 'API reference', link: '/docs/api' },
            { label: 'KrakenKey CLI', link: 'https://github.com/KrakenKey/cli' },
          ],
        },
      ],
    }),
    sitemap(),
  ],
  markdown: {
    shikiConfig: {
      theme: 'one-dark-pro',
    },
  },
});
