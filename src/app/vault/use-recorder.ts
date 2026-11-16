"use client";

import { useEffect, useRef, useState } from "react";

// Browsers record different formats: Chrome/Android use webm, iPhone Safari uses mp4.
const TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];

export function useRecorder(onDone: (file: File) => void, onError: (message: string) => void) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const starting = useRef(false);
  const discard = useRef(false);
  const unmounted = useRef(false);
  const suspended = useRef(false);
  const permissionGeneration = useRef(0);
  const callbacks = useRef({ onDone, onError });

  useEffect(() => {
    callbacks.current = { onDone, onError };
  });

  // Stop the microphone if you leave the page mid-recording.
  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
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
    if (suspended.current || starting.current || recorder.current) return;
    const generation = permissionGeneration.current;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      callbacks.current.onError("This browser can't record audio.");
      return;
    }
    let stream: MediaStream;
    starting.current = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      starting.current = false;
      callbacks.current.onError("Microphone blocked. Allow it in your browser or phone settings.");
      return;
    }
    // You left the page while the permission prompt was open: release the microphone.
    if (unmounted.current || suspended.current || generation !== permissionGeneration.current) {
      starting.current = false;
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    try {
      const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      discard.current = false;

      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        recorder.current = null;
        if (unmounted.current) return;
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
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      recorder.current = null;
      callbacks.current.onError("Could not start audio recording. Please try again.");
    } finally {
      starting.current = false;
    }
  }

  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  function cancel() {
    discard.current = true;
    stop();
  }

  // Stop normally so completed chunks reach the owner's retained pending files.
  function suspend() {
    suspended.current = true;
    permissionGeneration.current++;
    stop();
  }

  function resume() { suspended.current = false; }

  return { recording, seconds, start, stop, cancel, suspend, resume };
}
