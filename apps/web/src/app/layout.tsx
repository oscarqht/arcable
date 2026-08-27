import React from 'react';
import './globals.css';

export const metadata = {
  title: 'Arcable - Web App',
  description: 'Arcable web dashboard and knowledge management platform',
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
