"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

// Keeps the address out of the server HTML so simple scrapers can't harvest it.
// The page and its data only contain the two halves; the browser joins them after loading.
// Without JavaScript, visitors see a readable "name [at] domain" form instead.
export default function EmailLink({
  user,
  domain,
  className,
  icon,
}: {
  user: string;
  domain: string;
  className: string;
  icon: React.ReactNode;
}) {
  const ready = useSyncExternalStore(noop, () => true, () => false);
  if (!ready) {
    return (
      <span className={className}>
        {icon} {user} [at] {domain}
      </span>
    );
  }
  const address = [user, domain].join("@");
  return (
    <a href={`mailto:${address}`} className={className}>
      {icon} {address}
    </a>
  );
}
