import type { MetadataRoute } from 'next';

const BASE_URL = 'https://auraseaos.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ['/', '/login', '/dashboard', '/pricing', '/contact'];
  return routes.map((path) => ({
    url: `${BASE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency: path === '/' ? 'weekly' : ('monthly' as const),
    priority: path === '/' ? 1 : 0.8,
  }));
}
