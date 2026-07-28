import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'امروز من — Arad CRM',
  description: 'برنامهٔ روزانهٔ فروشنده: امروز کجا بروم و روی چه کسی کار کنم.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Required for `env(safe-area-inset-*)` to report anything but 0 when the app
  // is installed to the home screen — the headers and the bottom nav both read
  // it, and without this they pad for a notch that never gets measured.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
