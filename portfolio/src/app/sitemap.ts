import type { MetadataRoute } from 'next'
import { projects, site } from '@/content/site'

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${site.url}/`, changeFrequency: 'monthly', priority: 1 },
    ...projects.map((p) => ({ url: `${site.url}/work/${p.slug}/`, changeFrequency: 'monthly' as const, priority: 0.8 })),
  ]
}
