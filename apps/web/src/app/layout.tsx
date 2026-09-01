import React from 'react';
import type { Metadata, Viewport } from 'next';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'Arcable - Web App',
  description: 'Arcable web dashboard and knowledge management platform',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon64.png', type: 'image/png', sizes: '64x64' },
      { url: '/icon256.png', type: 'image/png', sizes: '256x256' },
      { url: '/icon1024.png', type: 'image/png', sizes: '1024x1024' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-icon.png',
  },
};


export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="64x64" href="/icon64.png" />
        <link rel="icon" type="image/png" sizes="256x256" href="/icon256.png" />
        <link rel="icon" type="image/png" sizes="1024x1024" href="/icon1024.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-icon.png" />
        <link rel="shortcut icon" href="/favicon.ico" />
      </head>
      <body>{children}</body>
    </html>
  );
}
