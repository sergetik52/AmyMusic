import React, { useState } from "react";
import { useAudioPlayer, EQUALIZER_FREQUENCIES, EQUALIZER_PRESETS } from "../../audio/AudioPlayerContext";

export function MobileSettings({ isOpen, onClose, onOpenAvatarCropper, onLogout }) {
  const {
    isEqualizerEnabled,
    setIsEqualizerEnabled,
    equalizerGains,
    setEqualizerBandGain,
    applyEqualizerPreset,
    audioEnergy
  } = useAudioPlayer();

  const [activeTab, setActiveTab] = useState("equalizer"); // "equalizer" | "account"
  const [selectedPreset, setSelectedPreset] = useState("Flat");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[130] flex flex-col bg-[#09090b] text-white animate-fade-in">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 ios-safe-top bg-[#09090b]/80 backdrop-blur-xl">
        <h1 className="text-lg font-black text-white">Настройки</h1>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-white/10 px-4 py-1.5 text-xs font-bold text-white active:scale-95"
        >
          Готово
        </button>
      </div>

      {/* Segmented Switcher */}
      <div className="flex px-5 pt-4">
        <div className="flex w-full rounded-2xl bg-white/10 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("equalizer")}
            className={`flex-1 rounded-xl py-2 text-xs font-bold transition ${
              activeTab === "equalizer" ? "bg-white text-black shadow-md" : "text-white/60 hover:text-white"
            }`}
          >
            Эквалайзер
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("account")}
            className={`flex-1 rounded-xl py-2 text-xs font-bold transition ${
              activeTab === "account" ? "bg-white text-black shadow-md" : "text-white/60 hover:text-white"
            }`}
          >
            Аккаунт & Звук
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto mobile-scroll-container p-5 pb-safe">
        {activeTab === "equalizer" && (
          <div className="flex flex-col gap-6">
            {/* Master Toggle */}
            <div className="flex items-center justify-between rounded-2xl bg-white/5 p-4 border border-white/10">
              <div>
                <h3 className="text-sm font-bold text-white">Включить эквалайзер</h3>
                <p className="text-xs text-white/40">10-полосная профессиональная фильтрация</p>
              </div>
              <button
                type="button"
                onClick={() => setIsEqualizerEnabled(!isEqualizerEnabled)}
                className={`relative h-7 w-12 rounded-full transition duration-300 ${
                  isEqualizerEnabled ? "bg-[var(--player-accent,#a855f7)]" : "bg-white/20"
                }`}
              >
                <div
                  className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition duration-300 ${
                    isEqualizerEnabled ? "left-5.5" : "left-0.5"
                  }`}
                />
              </button>
            </div>

            {/* Preset Selector */}
            <div>
              <h3 className="mb-2 text-xs font-bold text-white/60 uppercase tracking-wider">Пресеты звучания</h3>
              <div className="flex gap-2 overflow-x-auto pb-2 mobile-scroll-container">
                {Object.keys(EQUALIZER_PRESETS || {}).map((presetName) => (
                  <button
                    key={presetName}
                    type="button"
                    onClick={() => {
                      setSelectedPreset(presetName);
                      applyEqualizerPreset(presetName);
                    }}
                    className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition active:scale-95 ${
                      selectedPreset === presetName
                        ? "bg-white text-black"
                        : "bg-white/10 text-white/70 hover:text-white"
                    }`}
                  >
                    {presetName}
                  </button>
                ))}
              </div>
            </div>

            {/* 10-Band Sliders */}
            <div className={`flex flex-col gap-3 rounded-2xl bg-white/5 p-4 border border-white/10 transition ${
              !isEqualizerEnabled ? "opacity-40 pointer-events-none" : ""
            }`}>
              {EQUALIZER_FREQUENCIES.map((band, idx) => {
                const gain = equalizerGains?.[idx] ?? 0;
                return (
                  <div key={band.freq} className="flex items-center gap-3">
                    <span className="w-12 text-xs font-bold text-white/50">{band.label}</span>
                    <input
                      type="range"
                      min="-12"
                      max="12"
                      step="0.5"
                      value={gain}
                      onChange={(e) => setEqualizerBandGain(idx, parseFloat(e.target.value))}
                      className="flex-1 h-1.5 rounded-full appearance-none bg-white/20 accent-white"
                    />
                    <span className="w-10 text-right text-xs font-mono font-bold text-white/70">
                      {gain > 0 ? `+${gain}` : gain} dB
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "account" && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col items-center gap-3 rounded-2xl bg-white/5 p-6 border border-white/10 text-center">
              <div className="relative h-20 w-20 overflow-hidden rounded-full border-2 border-white/20">
                <img src="/user.svg" alt="" className="h-full w-full object-cover" />
              </div>
              <button
                type="button"
                onClick={onOpenAvatarCropper}
                className="rounded-full bg-white/10 px-4 py-1.5 text-xs font-bold text-white active:scale-95"
              >
                Изменить фото профиля
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-bold text-white/60 uppercase tracking-wider">Сессия</h3>
              <button
                type="button"
                onClick={onLogout}
                className="w-full rounded-2xl bg-red-500/15 py-3.5 text-center text-sm font-bold text-red-400 border border-red-500/20 active:bg-red-500/25"
              >
                Выйти из аккаунта
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
