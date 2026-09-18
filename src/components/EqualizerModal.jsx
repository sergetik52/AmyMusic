import React, { useState, useEffect, useCallback } from "react";
import { useAudioPlayer, EQUALIZER_FREQUENCIES, EQUALIZER_PRESETS } from "../audio/AudioPlayerContext";

export function EqualizerModal({ onClose }) {
  const {
    isEqualizerEnabled,
    setIsEqualizerEnabled,
    equalizerGains,
    setEqualizerGain,
    equalizerPreset,
    setEqualizerPreset,
    resetEqualizer
  } = useAudioPlayer();

  const [phase, setPhase] = useState("enter"); // "enter" | "open" | "exit"

  useEffect(() => {
    // Trigger open animation on next frame
    const raf = requestAnimationFrame(() => setPhase("open"));
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleClose = useCallback(() => {
    setPhase("exit");
    setTimeout(() => onClose(), 250);
  }, [onClose]);

  // Backdrop & panel animation classes
  const backdropClass = phase === "open"
    ? "opacity-100"
    : "opacity-0";

  const panelClass = phase === "open"
    ? "opacity-100 scale-100 translate-y-0"
    : phase === "exit"
      ? "opacity-0 scale-95 translate-y-4"
      : "opacity-0 scale-95 translate-y-6";

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/80 backdrop-blur-xl transition-opacity duration-300 ease-out ${backdropClass}`}
        onClick={handleClose}
      />

      {/* Panel */}
      <div className={`relative w-full max-w-[620px] rounded-3xl bg-[#0c0c0e] text-white shadow-2xl overflow-hidden transition-all duration-300 ease-[cubic-bezier(.2,.9,.3,1)] ${panelClass}`}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div>
            <h2 className="text-2xl font-black tracking-tight">Эквалайзер</h2>
            <p className="mt-0.5 text-xs font-medium text-white/35">10-полосная аудиокоррекция</p>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Toggle */}
            <button
              type="button"
              onClick={() => setIsEqualizerEnabled(!isEqualizerEnabled)}
              className={`flex h-8 items-center gap-2 rounded-full px-3.5 text-xs font-bold transition active:scale-95 ${
                isEqualizerEnabled
                  ? "bg-white/10 text-white"
                  : "bg-white/[0.04] text-white/40 hover:bg-white/[0.08]"
              }`}
            >
              <div className={`relative h-3.5 w-6 rounded-full transition-colors duration-200 ${isEqualizerEnabled ? "bg-white/50" : "bg-white/15"}`}>
                <div className={`absolute top-[2px] left-[2px] h-[10px] w-[10px] rounded-full bg-white transition-transform duration-200 shadow-sm ${isEqualizerEnabled ? "translate-x-[10px]" : "translate-x-0"}`} />
              </div>
              {isEqualizerEnabled ? "Вкл" : "Выкл"}
            </button>

            {/* Close */}
            <button
              type="button"
              onClick={handleClose}
              className="grid h-8 w-8 place-items-center rounded-full text-white/40 hover:bg-white/10 hover:text-white transition active:scale-95"
              aria-label="Закрыть"
            >
              <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Presets */}
        <div className="px-6 pb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {Object.entries(EQUALIZER_PRESETS).map(([key, preset]) => {
              const isActive = equalizerPreset === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setEqualizerPreset(key)}
                  className={`rounded-full px-3.5 py-1.5 text-[11px] font-bold tracking-wide transition active:scale-95 ${
                    isActive
                      ? "bg-white text-black"
                      : "bg-white/[0.05] text-white/50 hover:bg-white/[0.1] hover:text-white"
                  }`}
                >
                  {preset.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sliders */}
        <div className={`px-6 py-5 transition-opacity duration-200 ${!isEqualizerEnabled ? "opacity-25 pointer-events-none" : "opacity-100"}`}>
          <div className="relative rounded-2xl bg-white/[0.02] p-4">
            {/* Zero line */}
            <div className="pointer-events-none absolute left-4 right-4 top-[50%] border-b border-dashed border-white/[0.06]" />

            <div className="relative grid grid-cols-10 gap-1 sm:gap-2 text-center">
              {EQUALIZER_FREQUENCIES.map((band, idx) => {
                const val = equalizerGains[idx] ?? 0;
                const isNonZero = Math.abs(val) > 0.1;

                return (
                  <div key={band.freq} className="flex flex-col items-center gap-1.5 group">
                    {/* dB value */}
                    <span className={`text-[10px] font-mono font-semibold tabular-nums transition ${
                      isNonZero ? "text-white/80" : "text-white/20"
                    }`}>
                      {val > 0 ? `+${val.toFixed(1)}` : val.toFixed(1)}
                    </span>

                    {/* Slider track */}
                    <div className="relative flex h-36 w-5 items-center justify-center rounded-lg bg-white/[0.03] group-hover:bg-white/[0.05] transition">
                      <input
                        type="range"
                        min="-12"
                        max="12"
                        step="0.5"
                        value={val}
                        onChange={(e) => setEqualizerGain(idx, parseFloat(e.target.value))}
                        className="h-28 w-28 -rotate-90 appearance-none bg-transparent cursor-pointer touch-none focus:outline-none [&::-webkit-slider-runnable-track]:h-[3px] [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-white/10 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:transition [&::-webkit-slider-thumb]:hover:scale-125 [&::-webkit-slider-thumb]:mt-[-4.5px]"
                      />
                    </div>

                    {/* Freq label */}
                    <span className="text-[9px] font-semibold text-white/30 group-hover:text-white/60 transition">
                      {band.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 pb-5">
          <button
            type="button"
            onClick={resetEqualizer}
            className="flex items-center gap-1.5 rounded-full bg-white/[0.04] px-4 py-2 text-[11px] font-bold text-white/50 transition hover:bg-white/[0.08] hover:text-white active:scale-95"
          >
            <svg className="h-3.5 w-3.5 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            Сбросить
          </button>

          <button
            type="button"
            onClick={handleClose}
            className="rounded-full bg-white px-6 py-2 text-[11px] font-bold text-black transition hover:scale-105 active:scale-95"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}
