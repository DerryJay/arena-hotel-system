import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Arena Hotel System',
  description: 'Staff operations console for Arena Hotel'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
