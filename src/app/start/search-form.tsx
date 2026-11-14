"use client";

import { useState } from "react";
import { SEARCH_URL, isBlankQuery } from "@/lib/start-page";

// An ordinary GET form to Google, so it still works before (or without) JavaScript.
// The script only adds one thing: a search made of nothing but spaces stays on this page.
export default function SearchForm() {
  const [blank, setBlank] = useState(false);

  return (
    <div className="mt-10 w-full sm:mt-12">
      <form
        action={SEARCH_URL}
        method="get"
        role="search"
        onSubmit={(event) => {
          const input = event.currentTarget.elements.namedItem("q") as HTMLInputElement;
          if (isBlankQuery(input.value)) {
            event.preventDefault();
            input.value = "";
            input.focus();
            setBlank(true);
          }
        }}
        className="sp-search flex w-full items-center gap-2 rounded-full py-2.5 pl-4 pr-2.5 sm:gap-3 sm:py-3 sm:pl-5 sm:pr-3"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="sp-muted h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <label htmlFor="q" className="sr-only">Search Google</label>
        <input
          id="q"
          name="q"
          type="search"
          // A start page exists to be typed into, so focus the box straight away.
          autoFocus
          required
          autoComplete="off"
          enterKeyHint="search"
          placeholder="Search Google"
          aria-invalid={blank || undefined}
          aria-describedby={blank ? "q-error" : undefined}
          onInput={() => setBlank(false)}
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[var(--sp-muted)] sm:text-lg"
        />
        <button type="submit" className="sp-button rounded-full px-4 py-1.5 text-sm font-semibold">Search</button>
      </form>
      {/* Always in the page so screen readers announce the message when it appears. */}
      <p id="q-error" role="alert" className="sp-error mt-2 min-h-5 text-center text-sm">
        {blank ? "Type something to search for." : ""}
      </p>
    </div>
  );
}
