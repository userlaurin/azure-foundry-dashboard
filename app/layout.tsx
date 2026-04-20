import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Azure Foundry Dashboard',
  description: 'Live usage and cost for Azure Foundry models',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
