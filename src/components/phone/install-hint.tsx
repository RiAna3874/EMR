"use client";

import { useEffect, useState } from "react";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

// Putting the phone view on the home screen: a button where the browser offers one (Android
// Chrome), otherwise the steps for the phone's browser. Hidden once it runs installed.
export function InstallHint() {
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);

  useEffect(() => {
    setInstalled(window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);
    setIos(/iPhone|iPad|iPod/.test(navigator.userAgent));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (installed) return null;
  return (
    <div className="border-b border-line px-4 py-3">
      <div className="font-medium">Add to home screen</div>
      {prompt ? (
        <button
          type="button"
          onClick={async () => {
            await prompt.prompt();
            setPrompt(null);
          }}
          className="mt-2 rounded-lg bg-accent px-4 py-2 font-semibold text-white"
        >
          Install the app
        </button>
      ) : (
        <p className="text-[13px] text-ink-3">
          {ios ? "In Safari, tap the Share button, then Add to Home Screen." : "In Chrome, open the ⋮ menu, then Add to Home screen or Install app."} It opens straight to this view, like an app.
        </p>
      )}
    </div>
  );
}
