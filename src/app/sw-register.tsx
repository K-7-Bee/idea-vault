"use client";

import { useEffect } from "react";

// Turns on offline support (production only, so it doesn't get in the way while developing).
export default function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
