"use client";

import Link from "next/link";

export default function AdminError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <section className="adminErrorState" role="alert" aria-labelledby="admin-error-title">
      <span>Admin page unavailable</span>
      <h1 id="admin-error-title">This page couldn’t load.</h1>
      <p>The Admin service or connection was interrupted. Retry the page, or return to the dashboard.</p>
      <div>
        <button type="button" className="adminButton primary" onClick={retry}>Try again</button>
        <Link className="adminButton" href="/admin">Dashboard</Link>
      </div>
    </section>
  );
}

