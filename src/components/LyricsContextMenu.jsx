import React, { useRef, useEffect, useState } from "react";
import { useEscapeKey } from "../utils/useEscapeKey";

export function LyricsContextMenu({
  x,
  y,
  onClose,
  settings,
  onUpdateSettings,
  offset,
  onUpdateOffset,
  onHideText,
  activeDisplayMode,
  onShowText,
  onReloadLyrics
}) {
  const menuRef = useRef(null);
  const [actualSize, setActualSize] = useState({ width: 280, height: 350 });

  useEscapeKey(onClose);

  useEffect(() => {
    if (menuRef.current) {
      setActualSize({
        width: menuRef.current.offsetWidth,
        height: menuRef.current.offsetHeight
      });
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [onClose]);

  // Handle constraints to keep menu strictly within screen bounds
  const padding = 10;
  const screenWidth = typeof window !== "undefined" ? window.innerWidth : 1000;
  const screenHeight = typeof window !== "undefined" ? window.innerHeight : 800;
  
  const menuStyle = {
    position: "fixed",
    zIndex: 99999,
    left: Math.max(padding, Math.min(x, screenWidth - actualSize.width - padding)),
    top: Math.max(padding, Math.min(y, screenHeight - actualSize.height - padding))
  };

  const textSizes = [
    { id: "sm", label: "A", size: "text-xs" },
    { id: "base", label: "A", size: "text-sm" },
    { id: "lg", label: "A", size: "text-lg font-bold" },
    { id: "xl", label: "A", size: "text-xl font-black" }
  ];

  const currentDisplayMode = activeDisplayMode || settings.displayMode;

  return (
    <div 
      ref={menuRef}
      style={menuStyle}
      className="w-[240px] rounded-[24px] bg-black/40 backdrop-blur-[32px] shadow-[0_0_40px_rgba(0,0,0,0.5)] p-4 text-white animate-in fade-in zoom-in-95 duration-150 select-none"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      {/* 1. Text Sizes */}
      <div className="flex items-center justify-between px-2 mb-4">
        {textSizes.map((ts) => (
          <button
            key={ts.id}
            onClick={() => onUpdateSettings({ textSize: ts.id })}
            className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all ${
              settings.textSize === ts.id ? "text-white" : "text-white/30 hover:text-white/60"
            }`}
          >
            <span className={ts.size}>{ts.label}</span>
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="h-px w-full bg-white/5 mb-4" />

      {/* 2. Display Modes */}
      <div className="flex items-center justify-around mb-4">
        <button
          onClick={() => {
            onUpdateSettings({ displayMode: "cover-text" });
            if (typeof onShowText === "function") onShowText();
          }}
          className={`p-2 transition-all duration-300 ease-out ${currentDisplayMode === "cover-text" ? "text-white drop-shadow-md" : "text-white/30 hover:text-white/60"}`}
          title="Обложка и текст"
        >
          <svg className="h-6 w-6 fill-current" viewBox="0 0 24 24">
            <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
          </svg>
        </button>
        <button
          onClick={() => {
            if (typeof onHideText === "function") {
              onHideText();
            } else {
              onUpdateSettings({ displayMode: "hidden" });
              onClose();
            }
          }}
          className={`p-2 transition-all duration-300 ease-out ${currentDisplayMode === "hidden" ? "text-white drop-shadow-md" : "text-white/30 hover:text-white/60"}`}
          title="Скрыть текст"
        >
          <svg className="h-6 w-6 fill-current" viewBox="0 0 24 24">
            <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.28 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78 3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>
          </svg>
        </button>
        <button
          onClick={() => {
            onUpdateSettings({ displayMode: "text-only" });
            if (typeof onShowText === "function") onShowText();
          }}
          className={`p-2 transition-all duration-300 ease-out ${currentDisplayMode === "text-only" ? "text-white drop-shadow-md" : "text-white/30 hover:text-white/60"}`}
          title="Только текст"
        >
          <svg className="h-6 w-6 fill-current" viewBox="0 0 24 24">
            <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/>
          </svg>
        </button>
      </div>

      <div className="h-px w-full bg-white/5 mb-4" />

      {/* 3. Settings List */}
      <div className="flex flex-col gap-3 px-1 text-[13px] font-semibold mb-4">
        {/* Sync Mode */}
        <div className="flex items-center justify-between">
          <span className="text-white/40">Синхронизация</span>
          <button 
            onClick={() => onUpdateSettings({ syncMode: settings.syncMode === "words" ? "lines" : "words" })}
            className="text-white hover:text-white/80 transition"
          >
            {settings.syncMode === "words" ? "По словам" : "По строкам"}
          </button>
        </div>

        {/* Text Style */}
        <div className="flex items-center justify-between">
          <span className="text-white/40">Стиль текста</span>
          <button 
            onClick={() => {
              const styles = ["normal", "blur", "scale"];
              const nextStyle = styles[(styles.indexOf(settings.textStyle) + 1) % styles.length];
              onUpdateSettings({ textStyle: nextStyle });
            }}
            className="text-white hover:text-white/80 transition"
          >
            {settings.textStyle === "normal" && "Обычный"}
            {settings.textStyle === "blur" && "Размытие"}
            {settings.textStyle === "scale" && "Масштаб"}
          </button>
        </div>

        {/* Reload Lyrics */}
        {onReloadLyrics && (
          <div className="flex items-center justify-between">
            <span className="text-white/40">Текст песни</span>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onReloadLyrics();
              }}
              className="text-white hover:text-white/80 transition"
            >
              Обновить
            </button>
          </div>
        )}

        {/* Offset Text */}
        <div className="flex items-center justify-between mt-2">
          <span className="text-white/40">Смещение</span>
          <span className="text-white">{offset > 0 ? `+${offset}` : offset}ms</span>
        </div>
      </div>

      {/* 4. Offset Slider */}
      <div className="px-1 pb-2">
        <input 
          type="range" 
          min="-2000" 
          max="2000" 
          step="25"
          value={offset}
          onChange={(e) => onUpdateOffset(Number(e.target.value))}
          className="w-full accent-white h-1 bg-white/10 rounded-full appearance-none outline-none cursor-pointer"
        />
      </div>
    </div>
  );
}
