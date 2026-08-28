import React from 'react';
import './globals.css';

export const metadata = {
  title: 'Arcable - Web App',
  description: 'Arcable web dashboard and knowledge management platform',
  icons: {
    icon: [
      { url: '/favicon.ico?v=2', sizes: 'any' },
      { url: '/icon32.png?v=2', type: 'image/png', sizes: '32x32' },
      { url: '/icon16.png?v=2', type: 'image/png', sizes: '16x16' },
      { url: '/icon.png?v=2', type: 'image/png', sizes: '512x512' },
    ],
    shortcut: '/favicon.ico?v=2',
    apple: '/apple-icon.png?v=2',
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
        <link rel="icon" href="/favicon.ico?v=2" sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icon32.png?v=2" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icon16.png?v=2" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icon.png?v=2" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-icon.png?v=2" />
        <link rel="shortcut icon" href="/favicon.ico?v=2" />
      </head>
      <body>{children}</body>
    </html>
  );
}
