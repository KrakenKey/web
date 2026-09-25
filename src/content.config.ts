import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/posts' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    author: z.string().default('KrakenKey Team'),
    tags: z.array(z.enum(['pki', 'tls', 'acme', 'cabforum', 'root-programs', 'ca-incidents', 'certificate-lifetimes', 'post-quantum', 'dns', 'certificate-transparency', 'cve', 'lets-encrypt', 'product', 'engineering', 'release-notes', 'monitoring'])).default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { posts };
