import type { Metadata } from 'next';
import './globals.css';
import { LanguageProvider } from './contexts/language-context';

export const metadata: Metadata = {
  title: 'Hospitality AI',
  description: 'Decision intelligence for hospitality businesses',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
