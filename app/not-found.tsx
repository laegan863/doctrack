import Link from "next/link";

/** Any URL that matches no route. */
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="text-center">
        <div className="font-mono text-5xl font-bold text-slate-300">404</div>
        <h1 className="mt-4 text-xl font-semibold">Page not found</h1>
        <Link href="/" className="mt-6 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          Go to the dashboard
        </Link>
      </div>
    </main>
  );
}
