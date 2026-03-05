import type { MetadataRoute } from 'next';

const BASE_URL = 'https://auraseaos.com';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AuraSea OS',
    short_name: 'AuraSea',
    description: 'ระบบ Operating Layer สำหรับธุรกิจจริงในประเทศไทย. The Operating Layer for the Real Economy.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    lang: 'th',
    icons: [
      { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
