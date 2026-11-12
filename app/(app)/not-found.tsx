import Link from "next/link";

/** Shown when a document number (or other record) doesn't exist. */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <div className="font-mono text-5xl font-bold text-slate-300">404</div>
      <h1 className="mt-4 text-xl font-semibold">Not found</h1>
      <p className="mt-2 text-sm text-slate-600">
        That document or page doesn&apos;t exist. Check the tracking number. It looks like <code>IMISS-1126-001</code>.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/search" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          Search documents
        </Link>
        <Link href="/" className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50">
          Dashboard
        </Link>
      </div>
    </div>
  );
}
