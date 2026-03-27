<p align="center">
  <h1 align="center">KrakenKey Website</h1>
  <p align="center">
    Marketing site and documentation for <a href="https://krakenkey.io">krakenkey.io</a> — built with Astro.
    <br />
    <a href="https://krakenkey.io">Live Site</a> &middot;
    <a href="https://krakenkey.io/docs/api">API Docs</a> &middot;
    <a href="https://krakenkey.io/blog">Blog</a> &middot;
    <a href="https://github.com/krakenkey/krakenkey">Main Repo</a>
  </p>
</p>

<p align="center">
  <a href="https://krakenkey.io"><img src="https://img.shields.io/badge/website-krakenkey.io-06b6d4.svg" alt="Website"></a>
  <a href="https://astro.build"><img src="https://img.shields.io/badge/built%20with-Astro%205-ff5d01.svg" alt="Built with Astro"></a>
  <a href="https://pages.cloudflare.com"><img src="https://img.shields.io/badge/deployed%20on-Cloudflare%20Pages-f38020.svg" alt="Cloudflare Pages"></a>
</p>

## Overview

This repo contains the public-facing website for [KrakenKey](https://krakenkey.io), an automated TLS certificate management platform. It includes the marketing pages, blog, pricing, getting started guide, and interactive API documentation.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Astro 5](https://astro.build) (static output) |
| Styling | Custom CSS with design tokens (CSS variables) |
| Fonts | Inter (sans), JetBrains Mono (mono) — loaded via Google Fonts |
| API Docs | [Scalar](https://scalar.com) API reference viewer + OpenAPI spec |
| Sitemap | `@astrojs/sitemap` (auto-generated at `/sitemap.xml`) |
| Hosting | [Cloudflare Pages](https://pages.cloudflare.com) |

## Project Structure

```
web/
├── public/
│   ├── openapi.json          # OpenAPI 3.0 spec served to Scalar viewer
│   ├── _headers              # Cloudflare Pages security + cache headers
│   ├── robots.txt
│   ├── scalar-init.js        # Scalar API reference initialization
│   ├── favicon.svg
│   └── og-image.png
├── src/
│   ├── components/           # Reusable Astro components
│   │   ├── Header.astro
│   │   ├── Footer.astro
│   │   ├── Hero.astro
│   │   ├── Features.astro
│   │   ├── HowItWorks.astro
│   │   ├── PricingSummary.astro
│   │   ├── RegulationTimeline.astro
│   │   ├── FAQ.astro
│   │   ├── CTA.astro
│   │   └── BlogCard.astro
│   ├── layouts/
│   │   ├── BaseLayout.astro       # Root HTML shell (head, meta, fonts)
│   │   ├── PageLayout.astro       # Standard page with header + footer
│   │   └── BlogPostLayout.astro   # Blog post with metadata + prose styling
│   ├── pages/                     # File-based routing
│   │   ├── index.astro            # Home page
│   │   ├── pricing.astro          # Plans, FAQ
│   │   ├── getting-started.astro  # Step-by-step setup guide
│   │   ├── terms.astro            # Terms of service
│   │   ├── privacy.astro          # Privacy policy
│   │   ├── 404.astro              # Custom 404
│   │   ├── blog/
│   │   │   ├── index.astro        # Blog listing
│   │   │   └── [...slug].astro    # Dynamic blog post pages
│   │   └── docs/
│   │       └── api.astro          # Interactive API reference (Scalar)
│   ├── posts/                     # Blog content (Markdown)
│   │   ├── introducing-krakenkey.md
│   │   └── 200-day-tls-certs-are-here.md
│   ├── styles/
│   │   └── global.css             # Design tokens, reset, typography
│   └── content.config.ts          # Astro content collection config
├── astro.config.mjs
├── tsconfig.json
└── package.json
```

## Getting Started

### Prerequisites

- **Node.js** 18+ (22+ recommended)
- **npm**

### Install and Run

```bash
# Install dependencies
npm install

# Start the dev server (http://localhost:4321)
npm run dev

# Build for production
npm run build

# Preview the production build locally
npm run preview
```

### Using the Devcontainer

If you're working from the [main KrakenKey repo](https://github.com/krakenkey/krakenkey), the devcontainer handles dependency installation automatically. The web dev server is available inside the container — just run `npm run dev` from the `web/` directory.

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Astro dev server with hot reload |
| `npm run build` | Generate static site to `dist/` |
| `npm run preview` | Serve the `dist/` build locally |
| `npm run astro` | Access the Astro CLI directly |

## Pages

| Route | Description |
|-------|-------------|
| `/` | Home — hero, features, how it works, regulation timeline, CTA |
| `/pricing` | Plans (Free, Starter, Team) with feature comparison and FAQ |
| `/getting-started` | Step-by-step guide with DNS setup and API examples |
| `/blog` | Blog listing page |
| `/blog/:slug` | Individual blog posts (rendered from Markdown) |
| `/docs/api` | Interactive API reference powered by Scalar + OpenAPI spec |
| `/terms` | Terms of service |
| `/privacy` | Privacy policy |

## Blog Posts

Blog posts live in `src/posts/` as Markdown files with frontmatter:

```markdown
---
title: "Post Title"
description: "Brief description for SEO and cards."
date: "2025-06-15"
---

Post content here...
```

Astro's content collections handle parsing and validation. Posts are rendered via the `BlogPostLayout` and listed on `/blog` using the `BlogCard` component.

## Deployment

The site is deployed to **Cloudflare Pages** as a fully static site.

- Hashed assets under `/_astro/*` are cached immutably (1 year)
- HTML pages use `max-age=0, must-revalidate` so deploys are picked up instantly
- Security headers (CSP, X-Frame-Options, etc.) are configured in [`public/_headers`](public/_headers)
- The `/docs/api` page has a relaxed CSP to allow the Scalar API reference viewer

## Design System

The site uses CSS custom properties defined in [`src/styles/global.css`](src/styles/global.css):

- **Primary accent:** Cyan (`#06b6d4`)
- **CTA color:** Amber (`#f59e0b`)
- **Background:** Dark navy (`#0c1222`)
- **Surface:** Slate (`#1e293b`)
- **Layout:** Max-width 1200px, responsive with mobile navigation
- **Typography:** Inter for body text, JetBrains Mono for code

## Related Repositories

| Repo | Description |
|------|-------------|
| [krakenkey/krakenkey](https://github.com/krakenkey/krakenkey) | Monorepo (devcontainer, docs, orchestration) |
| [krakenkey/app](https://github.com/krakenkey/app) | NestJS API + React dashboard |
| [krakenkey/cli](https://github.com/krakenkey/cli) | CLI tool (Go) |
| [krakenkey/probe](https://github.com/krakenkey/probe) | TLS health probe (Go) |

## License

This project is part of [KrakenKey](https://github.com/krakenkey/krakenkey), licensed under the [GNU Affero General Public License v3.0](https://github.com/krakenkey/krakenkey/blob/main/LICENSE).
