import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'کنترل‌پنل آراد',
  description: 'ثبت کسب‌وکار، کاربران، اتصال‌ها و تنظیمات پلتفرم.',
  // 🔒 This origin holds cross-tenant credentials — never indexed (ADR-014 §2;
  // the Caddy block sets the same header at the edge).
  robots: { index: false, follow: false },
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
