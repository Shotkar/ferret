/**
 * Say it instead of typing it (AI-7; server: POST /transcribe → the Speech port, a Whisper server): tap to record,
 * tap again (or wait 10 s) to stop; the words come back into the field. Shown only when the server has speech to text.
 * The recording goes to this Ferret server and its speech model, and isn't kept.
 */
import { useEffect, useRef, useState } from "react";
import { api } from "./lib/api";
import { useFeatures } from "./lib/features";

const MAX_MS = 10_000;
const TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

export function SpeakButton({ onText, label = "Say it" }: { onText: (text: string) => void; label?: string }) {
  const features = useFeatures();
  const [state, setState] = useState<"idle" | "recording" | "reading">("idle");
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    recorder.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);
  if (!features?.speech || typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return null;

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timer.current) clearTimeout(timer.current);
        setState("reading");
        try {
          const { text } = await api.transcribe(new Blob(chunks, { type: rec.mimeType || mimeType || "audio/webm" }));
          if (text) onText(text.replace(/[.。!?]+$/, ""));
          else setError("Didn't catch that — try again");
        } catch (err) {
          setError((err as Error).message);
        }
        setState("idle");
      };
      recorder.current = rec;
      rec.start();
      setState("recording");
      timer.current = setTimeout(() => rec.state === "recording" && rec.stop(), MAX_MS);
    } catch {
      setError("Ferret can't use the microphone — check the browser's permission");
      setState("idle");
    }
  }

  return (
    <span className="flex shrink-0 flex-col items-end">
      <button
        type="button"
        className={`btn btn-square ${state === "recording" ? "btn-error" : "btn-soft btn-primary"}`}
        aria-label={state === "recording" ? "Stop recording" : label}
        aria-pressed={state === "recording"}
        disabled={state === "reading"}
        onClick={() => (state === "recording" ? recorder.current?.stop() : void start())}
      >
        {state === "reading" ? (
          <span className="loading loading-spinner loading-sm" />
        ) : (
          <span className={`${state === "recording" ? "icon-[tabler--player-stop-filled]" : "icon-[tabler--microphone]"} size-5`} />
        )}
      </button>
      {error && (
        <span role="alert" className="mt-1 max-w-48 text-end text-xs text-error">
          {error}
        </span>
      )}
    </span>
  );
}
