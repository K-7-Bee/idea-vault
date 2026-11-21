// After publishing, asks for the homepage until its HTML contains `marker` (an attribute on its
// root element). The first request gets the previous page and starts the rebuild, so a visitor
// doesn't. Gives up after a few seconds; the page still updates on later visits.
export async function homepageShows(marker: string, attempts = 8): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const response = await fetch("/", { cache: "no-store", credentials: "omit" });
      if (response.ok && (await response.text()).includes(marker)) return true;
    } catch {
      // Try again until the attempts run out.
    }
  }
  return false;
}
