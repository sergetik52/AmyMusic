import React from "react";
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

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 sm:p-6 animate-fade-in">
      {/* Subtle dark backdrop with blur */}
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* AmyMusic Styled Window */}
      <div className="relative w-full max-w-2xl overflow-hidden rounded-[24px] border border-white/10 bg-[#121216] p-6 sm:p-7 text-white shadow-2xl backdrop-blur-xl">
        
        {/* Subtle Brand Accent Glow */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#8341EF]/15 blur-3xl" />

        {/* Header */}
        <div className="relative z-10 flex items-center justify-between pb-5 border-b border-white/[0.08]">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#8341EF]/20 border border-[#8341EF]/30 text-[#8341EF]">
              <img src="/equalizer.svg" alt="" className="h-5 w-5 opacity-90" style={{ filter: "brightness(0) invert(1)" }} />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                Эквалайзер
              </h2>
              <p className="text-xs font-semibold text-white/40">
                10-полосная аудиокоррекция
              </p>
            </div>
          </div>

          {/* Master Toggle & Close Button */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsEqualizerEnabled(!isEqualizerEnabled)}
              className="flex items-center gap-2.5 rounded-full bg-white/[0.04] border border-white/10 px-3.5 py-1.5 text-xs font-bold transition hover:bg-white/[0.08]"
            >
              <div className={`relative h-4 w-7 rounded-full transition-colors duration-200 ${isEqualizerEnabled ? "bg-[#8341EF]" : "bg-white/20"}`}>
                <div className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white transition-transform duration-200 ${isEqualizerEnabled ? "translate-x-3" : "translate-x-0"}`} />
              </div>
              <span className={isEqualizerEnabled ? "text-white" : "text-white/40"}>
                {isEqualizerEnabled ? "Вкл" : "Выкл"}
              </span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.04] text-white/50 hover:bg-white/10 hover:text-white transition border border-white/[0.08]"
              aria-label="Закрыть"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Presets Row */}
        <div className="relative z-10 my-4">
          <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-white/40">Пресеты</p>
          <div className="flex flex-wrap items-center gap-1.5 max-h-24 overflow-y-auto no-scrollbar">
            {Object.entries(EQUALIZER_PRESETS).map(([key, preset]) => {
              const isActive = equalizerPreset === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setEqualizerPreset(key)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                    isActive
                      ? "bg-[#8341EF] text-white font-bold shadow-md"
                      : "bg-white/[0.04] text-white/60 hover:bg-white/[0.08] hover:text-white border border-white/[0.06]"
                  }`}
                >
                  {preset.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sliders Grid */}
        <div className={`relative z-10 my-5 rounded-2xl border border-white/[0.06] bg-black/30 p-4 transition-opacity duration-200 ${!isEqualizerEnabled ? "opacity-30 pointer-events-none" : "opacity-100"}`}>
          
          {/* Zero dB Reference Line */}
          <div className="pointer-events-none absolute left-4 right-4 top-[48%] -translate-y-1/2 border-b border-dashed border-white/10 z-0" />

          <div className="relative z-10 grid grid-cols-10 gap-1.5 sm:gap-2 text-center">
            {EQUALIZER_FREQUENCIES.map((band, idx) => {
              const val = equalizerGains[idx] ?? 0;
              const isNonZero = Math.abs(val) > 0.1;

              return (
                <div key={band.freq} className="flex flex-col items-center gap-2 group">
                  {/* dB Value */}
                  <span className={`text-[10px] font-mono font-semibold transition ${
                    isNonZero ? "text-[#8341EF] font-bold" : "text-white/30"
                  }`}>
                    {val > 0 ? `+${val.toFixed(1)}` : `${val.toFixed(1)}`}
                  </span>

                  {/* Vertical Range Slider */}
                  <div className="relative flex h-40 w-6 items-center justify-center rounded-xl bg-white/[0.02] py-2 border border-white/[0.04] group-hover:border-white/15 transition">
                    <input
                      type="range"
                      min="-12"
                      max="12"
                      step="0.5"
                      value={val}
                      onChange={(e) => setEqualizerGain(idx, parseFloat(e.target.value))}
                      className="h-32 w-32 -rotate-90 appearance-none bg-transparent cursor-pointer touch-none focus:outline-none [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:transition [&::-webkit-slider-thumb]:hover:scale-125"
                    />
                  </div>

                  {/* Frequency Label */}
                  <span className="text-[10px] font-medium tracking-tight text-white/45 group-hover:text-white/80 transition">
                    {band.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="relative z-10 flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={resetEqualizer}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-semibold text-white/60 transition hover:bg-white/10 hover:text-white active:scale-95"
          >
            <svg className="h-3.5 w-3.5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            Сбросить (0 dB)
          </button>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-[#8341EF] hover:bg-[#7231d5] px-5 py-2 text-xs font-bold text-white transition active:scale-95"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}
