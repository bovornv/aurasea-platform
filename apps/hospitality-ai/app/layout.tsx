import type { Metadata } from 'next';
import './globals.css';

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
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
