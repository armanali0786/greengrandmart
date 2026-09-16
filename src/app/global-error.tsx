'use client';

import { useEffect } from 'react';

// Only fires when the root layout itself throws (Providers, font loading,
// etc.) — src/app/error.tsx can't catch that since it renders inside the
// layout it would need to replace. Must render its own <html>/<body> since
// the real root layout is what failed. Kept dependency-free (no Button/Link/
// Tailwind-token components) so it still renders if those modules are what's
// broken.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          display: 'flex',
          minHeight: '100vh',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          padding: '2rem',
          textAlign: 'center',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Something went wrong</h1>
        <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
          We hit a problem loading GreenGrandMart. Please try again.
        </p>
        <button
          onClick={reset}
          style={{
            height: '2.75rem',
            padding: '0 1rem',
            borderRadius: '10px',
            border: 'none',
            backgroundColor: '#16a34a',
            color: '#fff',
            fontSize: '0.875rem',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
