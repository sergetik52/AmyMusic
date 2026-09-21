import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useAudioPlayer } from "../audio/AudioPlayerContext";
import { resolveStreamUrl } from "../services/soundCloudApi";

export function TrackContextMenu({
  track,
  onClose,
  x,
  y
}) {
  const {
    likedTrackIds,
    toggleLike,
    dislikedTrackIds,
    toggleDislike,
    openTrackWave,
    playNext,
    addToQueueEnd
  } = useAudioPlayer();

  const menuRef = useRef(null);
  const isLiked = likedTrackIds.has(track.id);
  const isDisliked = dislikedTrackIds.has(track.id);
  const [view, setView] = useState("main"); // "main" | "download"
  const [actualSize, setActualSize] = useState({ width: 240, height: 350 });

  useLayoutEffect(() => {
    if (menuRef.current) {
      setActualSize({
        width: menuRef.current.offsetWidth,
        height: menuRef.current.offsetHeight
      });
    }
  }, [view]);

  // Close when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [onClose]);

  const handleDownloadMp3 = async () => {
    // Open tab synchronously to bypass popup blocker
    let newTab = null;
    if (typeof window !== "undefined") {
      newTab = window.open("about:blank", "_blank");
    }

    try {
      if (!track.streamUrl && !track.id) {
        if (newTab) newTab.close();
        return;
      }
      const url = await resolveStreamUrl(track);
      if (url) {
        let downloaded = false;
        try {
          // Attempt to fetch via CORS proxy for true file download
          const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
          const res = await fetch(proxyUrl);
          if (res.ok) {
            const blob = await res.blob();
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `${track.artist} - ${track.title}.mp3`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
            downloaded = true;
          }
        } catch (fetchErr) {
          console.warn("Proxy download failed, falling back to direct tab:", fetchErr);
        }

        if (downloaded) {
          if (newTab) newTab.close();
        } else {
          // Fallback: redirect the blank tab
          if (newTab) {
            newTab.location.href = url;
          } else {
            window.open(url, "_blank");
          }
        }
      } else {
        if (newTab) newTab.close();
      }
    } catch (e) {
      console.error("Download failed:", e);
      if (newTab) newTab.close();
    }
    onClose();
  };

  const handleDownloadCover = async () => {
    try {
      if (!track.cover) return;
      let coverUrl = track.cover;
      // Change to highest res (1000x1000) for downloading
      if (coverUrl.includes("200x200") || coverUrl.includes("400x400") || coverUrl.includes("50x50")) {
        coverUrl = coverUrl.replace(/50x50|200x200|400x400/, "1000x1000");
      }
      const res = await fetch(coverUrl);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${track.artist} - ${track.title} Cover.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch (e) {
      console.error("Download cover failed:", e);
    }
    onClose();
  };

  const padding = 10;
  const screenWidth = typeof window !== "undefined" ? window.innerWidth : 1000;
  const screenHeight = typeof window !== "undefined" ? window.innerHeight : 800;
  
  // Default to bottom-left of the click origin
  let menuX = x - actualSize.width + 15;
  let menuY = y + 10;
  
  // Clamp boundaries
  menuX = Math.max(padding, Math.min(menuX, screenWidth - actualSize.width - padding));
  menuY = Math.max(padding, Math.min(menuY, screenHeight - actualSize.height - padding));

  const menuStyle = {
    position: "fixed",
    zIndex: 99999,
    left: menuX,
    top: menuY,
    boxShadow: "0 10px 40px rgba(0,0,0,0.6)"
  };

  if (typeof document === "undefined") return null;

  const handleAction = (action) => {
    action();
    onClose();
  };

  return createPortal(
    <div
      ref={menuRef}
      style={menuStyle}
      className="w-[240px] rounded-2xl bg-black/40 text-white backdrop-blur-3xl animate-in fade-in zoom-in-95 pointer-events-auto overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header Block with Blurred Background */}
      <div className="relative p-3 mb-1">
        <div className="absolute inset-0 z-0 overflow-hidden opacity-40">
          <img src={track.cover} alt="" className="w-full h-full object-cover blur-lg scale-125" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-black/40" />
        </div>
        <div className="relative z-10 flex items-center gap-3">
          <img src={track.cover} alt="" className="h-[42px] w-[42px] shrink-0 rounded-lg object-cover shadow-md" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13px] font-black text-white leading-tight">{track.title}</span>
            <span className="truncate text-[11px] font-bold text-white/60 leading-tight">{track.artist}</span>
          </div>
        </div>
      </div>

      {view === "main" ? (
        <div className="flex flex-col pb-2 animate-in fade-in slide-in-from-left-2 duration-200">
          {/* Action Block 1 */}
          <button
            type="button"
            onClick={() => handleAction(() => playNext(track))}
            className="flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] font-bold text-white/90 transition hover:bg-white/10"
          >
            <img src="/menu/next-of-queue.svg" alt="" className="h-4 w-4 shrink-0 opacity-60" />
            <span>Следующим</span>
          </button>
          
          <button
            type="button"
            onClick={() => handleAction(() => addToQueueEnd(track))}
            className="flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] font-bold text-white/90 transition hover:bg-white/10"
          >
            <img src="/menu/end-of-queue.svg" alt="" className="h-4 w-4 shrink-0 opacity-60" />
            <span>Добавить в очередь</span>
          </button>

          <button
            type="button"
            onClick={() => handleAction(() => openTrackWave(track))}
            className="flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] font-bold text-white/90 transition hover:bg-white/10"
          >
            <img src="/menu/my-wave-of-track.svg" alt="" className="h-4 w-4 shrink-0 opacity-60" />
            <span>Волна по треку</span>
          </button>

          <div className="my-1.5 mx-3 border-t border-white/[0.04]" />

          {/* Action Block 2 */}
          <button
            type="button"
            onClick={() => handleAction(() => toggleLike(track.id, track))}
            className="flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] font-bold text-white/90 transition hover:bg-white/10"
          >
            <img src={isLiked ? "/menu/like.svg" : "/unlike.svg"} alt="" className={`h-4 w-4 shrink-0 ${isLiked ? "text-purple-500" : "opacity-60"}`} />
            <span>{isLiked ? "Удалить из избранного" : "Добавить в избранное"}</span>
          </button>


          <button
            type="button"
            onClick={() => handleAction(() => toggleDislike(track.id, track))}
            className="flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] font-bold text-white/90 transition hover:bg-white/10"
          >
            <img src="/menu/dislike.svg" alt="" className={`h-4 w-4 shrink-0 ${isDisliked ? "text-purple-500" : "opacity-60"}`} />
            <span>Не интересно</span>
          </button>

          <div className="my-1.5 mx-3 border-t border-white/[0.04]" />

          {/* Action Block 3: Download */}
          <button
            type="button"
            onClick={() => setView("download")}
            className="flex w-full items-center justify-between px-4 py-2 text-left text-[13px] font-bold text-white/90 transition hover:bg-white/10"
          >
            <div className="flex items-center gap-3">
              <svg className="h-4 w-4 shrink-0 opacity-60 fill-current" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
              <span>Скачать</span>
            </div>
            <span className="text-white/40 font-normal opacity-60 text-lg leading-none">›</span>
          </button>
        </div>
      ) : (
        <div className="flex flex-col pb-2 animate-in fade-in slide-in-from-right-2 duration-200">
          <button
            type="button"
            onClick={handleDownloadMp3}
            className="flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] font-bold text-white/90 transition hover:bg-white/10"
          >
            <svg className="h-4 w-4 shrink-0 opacity-60 fill-current" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
            <span>В файл</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadCover}
            className="flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] font-bold text-white/90 transition hover:bg-white/10"
          >
            <svg className="h-4 w-4 shrink-0 opacity-60 fill-current" viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
            <span>Обложка</span>
          </button>

          <div className="mt-2 flex justify-center w-full px-4">
            <button
              type="button"
              onClick={() => setView("main")}
              className="w-full py-2.5 text-[13px] font-bold text-white/80 hover:text-white transition rounded-xl bg-white/[0.04] hover:bg-white/[0.08]"
            >
              Назад
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}

export function TrackMenuButton({ track }) {
  const { openContextMenu } = useAudioPlayer();
  const containerRef = useRef(null);

  useEffect(() => {
    const parent = containerRef.current?.closest('.group');
    if (!parent) return;

    const handleContextMenu = (e) => {
      openContextMenu(e, track);
    };

    parent.addEventListener('contextmenu', handleContextMenu);
    return () => parent.removeEventListener('contextmenu', handleContextMenu);
  }, [openContextMenu, track]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openContextMenu(e, track);
        }}
        className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/10 text-white/50 hover:text-white transition active:scale-95"
        aria-label="Меню трека"
      >
        <img src="/menu/menu-item.svg" alt="Menu" className="h-5 w-5 brightness-200 opacity-60 hover:opacity-100 transition" />
      </button>
    </div>
  );
}
