"use client";

import { useTabVisibility } from "@edward/ui/hooks/useTabVisibility";
import { useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";

function playShowreel(video: HTMLVideoElement) {
  if (!video.hasAttribute("src")) {
    const compact = window.matchMedia("(max-width: 767px)").matches;
    video.src = compact ? "/showreel/edward-720p.mp4" : "/showreel/edward-1080p.mp4";
  }

  void video.play().catch(() => {
    // The poster stays visible if autoplay is blocked.
  });
}

export function ProductShowreel() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const inView = useInView(videoRef, { amount: 0.15 });
  const tabVisible = useTabVisibility();
  const playbackChoice = useRef<boolean | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePlayback = () => {
      if (inView && tabVisible && (playbackChoice.current ?? !motion.matches)) {
        playShowreel(video);
      } else {
        video.pause();
      }
    };

    updatePlayback();
    motion.addEventListener("change", updatePlayback);
    return () => motion.removeEventListener("change", updatePlayback);
  }, [inView, tabVisible]);

  function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;

    playbackChoice.current = video.paused;
    if (video.paused) {
      playShowreel(video);
    } else {
      video.pause();
    }
  }

  function toggleSound() {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !video.muted;
    setMuted(video.muted);

    if (!video.muted && video.paused) {
      playbackChoice.current = true;
      playShowreel(video);
    }
  }

  return (
    <section
      id="showreel"
      aria-labelledby="showreel-title"
      className="mx-auto w-full max-w-6xl px-4 pt-[clamp(6.5rem,calc(14.5rem-15svh),8.5rem)] sm:px-6 md:pt-46"
    >
      <header className="mb-7 text-center sm:mb-10">
        <p className="mb-2 font-mono text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Product showreel
        </p>
        <h2
          id="showreel-title"
          className="text-3xl font-bold tracking-tight text-foreground md:text-4xl lg:text-5xl"
        >
          Edward in motion
        </h2>
      </header>

      <figure>
        <div
          className="relative overflow-hidden rounded-xl border border-white/15 bg-black md:rounded-2xl"
          onContextMenu={(event) => event.preventDefault()}
        >
          <video
            id="showreel-video"
            ref={videoRef}
            aria-label="Edward product showreel"
            className="block aspect-video w-full select-none object-contain [-webkit-touch-callout:none]"
            width={1920}
            height={1080}
            poster="/showreel/edward-poster.webp"
            preload="none"
            muted={muted}
            loop
            playsInline
            controlsList="nodownload nofullscreen noremoteplayback"
            disablePictureInPicture
            disableRemotePlayback
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onError={() => setPlaying(false)}
          />
          <button
            type="button"
            aria-label="Showreel sound"
            aria-pressed={!muted}
            aria-controls="showreel-video"
            className="absolute inset-0 cursor-pointer rounded-[inherit] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [-webkit-touch-callout:none]"
            onClick={toggleSound}
          />
        </div>
        <figcaption className="relative mt-4 text-center text-sm text-muted-foreground">
          From first prompt to live preview.
          <button
            type="button"
            aria-label={playing ? "Pause showreel" : "Play showreel"}
            aria-controls="showreel-video"
            className="sr-only focus:not-sr-only focus:absolute focus:top-full focus:left-1/2 focus:mt-2 focus:-translate-x-1/2 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-foreground focus:outline-2 focus:outline-ring"
            onClick={togglePlayback}
          >
            {playing ? "Pause" : "Play"}
          </button>
        </figcaption>
      </figure>
    </section>
  );
}
