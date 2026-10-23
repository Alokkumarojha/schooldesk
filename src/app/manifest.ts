import type { MetadataRoute } from 'next';

// Public branding only. No user, school or authenticated data belongs here.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'SchoolDesk',
    short_name: 'SchoolDesk',
    description: 'SchoolDesk school management workspace.',
    display: 'standalone',
    start_url: '/',
    scope: '/',
    theme_color: '#285cdd',
    background_color: '#f5f7fb',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
