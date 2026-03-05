import type { MetadataRoute } from 'next';

const BASE_URL = 'https://auraseaos.com';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AuraSea OS',
    short_name: 'AuraSea OS',
    description: 'ระบบ Operating Layer สำหรับธุรกิจจริงในประเทศไทย. The Operating Layer for the Real Economy.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0F172A',
    theme_color: '#0F172A',
    icons: [
      { src: '/favicon.ico', sizes: 'any', type: 'image/x-icon' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
    ],
  };
}
