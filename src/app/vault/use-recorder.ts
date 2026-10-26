"use client";

import { useEffect, useRef, useState } from "react";

// Browsers record different formats: Chrome/Android use webm, iPhone Safari uses mp4.
const TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];

export function useRecorder(onDone: (file: File) => void, onError: (message: string) => void) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const discard = useRef(false);
  const callbacks = useRef({ onDone, onError });

  useEffect(() => {
    callbacks.current = { onDone, onError };
  });

  // Stop the microphone if you leave the page mid-recording.
  useEffect(() => {
    return () => {
      discard.current = true;
      if (recorder.current?.state === "recording") recorder.current.stop();
    };
  }, []);

  // Count the seconds while recording.
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      callbacks.current.onError("This browser can't record audio.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      callbacks.current.onError("Microphone blocked. Allow it in your browser or phone settings.");
      return;
    }

    const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    discard.current = false;

    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      setRecording(false);
      if (discard.current || chunks.length === 0) return;
      const type = (rec.mimeType || mimeType || "audio/webm").split(";")[0];
      const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
      const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
      callbacks.current.onDone(new File(chunks, `Voice note ${stamp}.${ext}`, { type }));
    };

    recorder.current = rec;
    rec.start();
    setSeconds(0);
    setRecording(true);
  }

  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  function cancel() {
    discard.current = true;
    stop();
  }

  return { recording, seconds, start, stop, cancel };
}
