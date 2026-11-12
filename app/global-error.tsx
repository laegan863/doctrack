"use client"; // Replaces the root layout when it fails, so it brings its own <html> and styles.

export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, background: "#f1f5f9" }}>
        <title>DocTrack · Error</title>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 20 }}>DocTrack couldn&apos;t load</h1>
          <p style={{ color: "#475569", fontSize: 14 }}>Please try again in a moment.</p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ marginTop: 16, padding: "8px 16px", borderRadius: 8, border: 0, background: "#4f46e5", color: "white", cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
