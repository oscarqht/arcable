import Link from 'next/link';

export default function NotFound() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '24px',
        textAlign: 'center',
        backgroundColor: '#0b0f19',
        color: '#f8fafc',
      }}
    >
      <h1 style={{ fontSize: '32px', fontWeight: 700, marginBottom: '8px' }}>404 - Page Not Found</h1>
      <p style={{ color: '#94a3b8', marginBottom: '24px' }}>The page you are looking for does not exist.</p>
      <Link
        href="/"
        style={{
          padding: '8px 16px',
          borderRadius: '8px',
          backgroundColor: '#0284c7',
          color: '#ffffff',
          textDecoration: 'none',
          fontSize: '14px',
          fontWeight: 600,
        }}
      >
        Return to Home
      </Link>
    </div>
  );
}
