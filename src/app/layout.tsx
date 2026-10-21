import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { ThemeProvider } from '@/components/providers/theme-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'SchoolDesk · School management',
  description: 'SchoolDesk school management workspace.',
  icons: { icon: '/favicon.svg' },
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ClerkProvider appearance={{ variables: {
          colorPrimary: 'var(--primary)',
          colorPrimaryForeground: 'var(--on-solid)',
          colorBackground: 'var(--surface)',
          colorForeground: 'var(--ink)',
          colorMuted: 'var(--subtle)',
          colorMutedForeground: 'var(--muted)',
          colorNeutral: 'var(--ink)',
          colorInput: 'var(--input)',
          colorInputForeground: 'var(--ink)',
          colorBorder: 'var(--control-border)',
          colorDanger: 'var(--danger-text)',
          colorSuccess: 'var(--success-text)',
          colorWarning: 'var(--late-text)',
        } }}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
