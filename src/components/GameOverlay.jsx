import React, { useEffect, useState, useRef } from "react";
import { getProfileSettings, saveProfileSettings } from "../services/profileSettings";

function toSafeString(val, fallback = "") {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (typeof val === "object") {
    return val.name || val.title || val.username || val.label || fallback;
  }
  return fallback;
}

export function GameOverlay() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [playerState, setPlayerState] = useState({
    title: "Нет трека",
    artist: "AmyMusic",
    cover: "",
    isPlaying: false,
    currentTime: 0,
    duration: 100,
    volume: 0.8,
    audioEnergy: { bass: 0, mids: 0, treble: 0, level: 0 }
  });

  const [isVolumeOpen, setIsVolumeOpen] = useState(false);
  const [isDraggingVolume, setIsDraggingVolume] = useState(false);
  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const [localSeekTime, setLocalSeekTime] = useState(null);
  const [localVolume, setLocalVolume] = useState(null);
  const [trackAnimClass, setTrackAnimClass] = useState("");
  const [overlayScale, setOverlayScale] = useState(1.0);
  const [overlayPosition, setOverlayPosition] = useState("top");
  const [overlayDragEnabled, setOverlayDragEnabled] = useState(false);

  useEffect(() => {
    const loadSettings = () => {
      try {
        const raw = localStorage.getItem("amymusic.profileSettings.v1");
        if (raw) {
          const profile = JSON.parse(raw);
          setOverlayScale(Number(profile.overlayScale) || 1.0);
          setOverlayPosition(profile.overlayPosition || "top");
          setOverlayDragEnabled(Boolean(profile.overlayDragEnabled));
        }
      } catch (e) {}
    };
    loadSettings();
    window.addEventListener("storage", loadSettings);
    return () => window.removeEventListener("storage", loadSettings);
  }, []);

  useEffect(() => {
    if (!overlayDragEnabled || typeof window === "undefined" || !window.__TAURI_INTERNALS__) return;

    let unlisten;
    let mounted = true;
    import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      if (!mounted) return;
      unlisten = await getCurrentWindow().onMoved(({ payload }) => {
        const x = Number(payload?.x);
        const y = Number(payload?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        const profile = getProfileSettings();
        if (!profile.overlayDragEnabled) return;
        saveProfileSettings({
          ...profile,
          overlayCustomPosition: { x: Math.round(x), y: Math.round(y) }
        }, true);
      });
    }).catch(() => {});

    return () => {
      mounted = false;
      if (unlisten) unlisten();
    };
  }, [overlayDragEnabled]);

  const handleOverlayDragStart = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!overlayDragEnabled) return;
    const dragging = window.amyMusicDesktop?.startOverlayDragging?.();
    dragging?.catch(() => {});
  };

  const getTransformOrigin = () => {
    return "center";
  };
  const volumeTrackRef = useRef(null);
  const progressTrackRef = useRef(null);
  const prevTrackIdRef = useRef(null);
  const lastCmdTimeRef = useRef(0);
  const lastReceivedTsRef = useRef(0);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isExpanded) {
        setIsExpanded(false);
        if (typeof window !== "undefined" && window.amyMusicDesktop?.resizeOverlayWindow) {
          window.amyMusicDesktop.resizeOverlayWindow(false).catch(() => {});
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isExpanded]);

  useEffect(() => {
    try {
      document.documentElement.style.background = "transparent";
      document.body.style.background = "transparent";
      document.body.style.backgroundColor = "transparent";
      const rootEl = document.getElementById("root");
      if (rootEl) {
        rootEl.style.background = "transparent";
        rootEl.style.backgroundColor = "transparent";
      }
      if (typeof window !== "undefined" && window.amyMusicDesktop?.resizeOverlayWindow) {
        window.amyMusicDesktop.resizeOverlayWindow(false).catch(() => {});
      }
    } catch (e) {
      console.warn("Overlay transparent style error:", e);
    }
  }, []);

  const applyStatePayload = (data) => {
    if (!data) return;

    // Ignore out-of-order state updates (prevents progress bar jerking)
    const ts = data.timestamp || 0;
    if (ts > 0 && ts < lastReceivedTsRef.current) return;
    lastReceivedTsRef.current = ts;

    const safeTitle = toSafeString(data.title, "AmyMusic");
    const safeArtist = toSafeString(data.artist, "AmyMusic");
    const safeCover = typeof data.cover === "string" ? data.cover : "";

    const trackKey = safeTitle + safeArtist;
    if (prevTrackIdRef.current && prevTrackIdRef.current !== trackKey) {
      triggerTrackAnim();
    }
    prevTrackIdRef.current = trackKey;

    // If we recently sent a play/pause command, don't let the broadcast override isPlaying
    // for 600ms — prevents the "pause then immediately un-pause" race condition
    const timeSinceCmd = Date.now() - lastCmdTimeRef.current;
    const ignoreIsPlaying = timeSinceCmd < 600;

    setPlayerState(prev => ({
      ...prev,
      title: safeTitle,
      artist: safeArtist,
      cover: safeCover,
      isPlaying: ignoreIsPlaying ? prev.isPlaying : !!data.isPlaying,
      currentTime: typeof data.currentTime === "number" && !isNaN(data.currentTime) ? data.currentTime : 0,
      duration: typeof data.duration === "number" && !isNaN(data.duration) && data.duration > 0 ? data.duration : 100,
      volume: typeof data.volume === "number" && !isNaN(data.volume) ? data.volume : 0.8,
      audioEnergy: data.audioEnergy || { bass: 0, mids: 0, treble: 0, level: 0 }
    }));
  };

  const sendCmd = async (cmd, value) => {
    // Record command time for grace period & optimistic update
    if (cmd === "togglePlayPause") {
      lastCmdTimeRef.current = Date.now();
      // Optimistically toggle local state so UI reacts instantly
      setPlayerState(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
    }

    try {
      localStorage.setItem("amymusic_overlay_cmd", JSON.stringify({ cmd, value, _ts: Date.now() }));
    } catch (e) {}

    try {
      if (typeof window !== "undefined" && window.amyMusicDesktop?.broadcastOverlayCmd) {
        await window.amyMusicDesktop.broadcastOverlayCmd({ cmd, value });
      } else if (typeof window !== "undefined" && window.__TAURI_INTERNALS__) {
        const { emit } = await import("@tauri-apps/api/event");
        await emit("overlay-player-cmd", { cmd, value });
      }
    } catch (e) {
      console.warn("Tauri emit cmd error:", e);
    }
  };

  // Listen to state updates from main window
  useEffect(() => {
    let unlisten = null;
    let isMounted = true;

    const checkLocalStorageState = () => {
      try {
        const raw = localStorage.getItem("amymusic_overlay_state");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && isMounted) {
            applyStatePayload(parsed);
          }
        }
      } catch (e) {}
    };

    checkLocalStorageState();

    const handleStorageChange = (e) => {
      if (e.key === "amymusic_overlay_state" && e.newValue) {
        try {
          applyStatePayload(JSON.parse(e.newValue));
        } catch (err) {}
      }
    };
    window.addEventListener("storage", handleStorageChange);
    const lsInterval = setInterval(checkLocalStorageState, 400);

    const setupListener = async () => {
      try {
        if (typeof window === "undefined") return;
        const { listen } = await import("@tauri-apps/api/event");
        
        if (!isMounted) return;

        unlisten = await listen("overlay-player-state", (event) => {
          if (!isMounted || !event || !event.payload) return;
          applyStatePayload(event.payload);
        });

        if (window.amyMusicDesktop?.requestOverlayState) {
          await window.amyMusicDesktop.requestOverlayState().catch(() => {});
        } else {
          const { emit } = await import("@tauri-apps/api/event");
          await emit("overlay-request-state").catch(() => {});
        }
      } catch (e) {
        console.warn("Tauri overlay event listener error:", e);
      }
    };

    setupListener();

    return () => {
      isMounted = false;
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(lsInterval);
      if (unlisten) unlisten();
    };
  }, []);

  const triggerTrackAnim = () => {
    setTrackAnimClass("slide-out-next");
    setTimeout(() => {
      setTrackAnimClass("slide-in-prepare-next");
      setTimeout(() => {
        setTrackAnimClass("");
      }, 150);
    }, 150);
  };

  const handleTogglePlayPause = (e) => {
    if (e) e.stopPropagation();
    sendCmd("togglePlayPause");
  };

  const handleNextTrack = (e) => {
    if (e) e.stopPropagation();
    sendCmd("next");
  };

  const handlePrevTrack = (e) => {
    if (e) e.stopPropagation();
    sendCmd("prev");
  };

  const toggleVolumeSlider = (e) => {
    if (e) e.stopPropagation();
    setIsVolumeOpen(prev => !prev);
  };

  // Live mouse volume drag
  const updateVolumeFromMouse = (e) => {
    if (!volumeTrackRef.current) return;
    const rect = volumeTrackRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    setLocalVolume(pct);
    sendCmd("volume", pct);
  };

  const startVolumeDrag = (e) => {
    e.stopPropagation();
    setIsDraggingVolume(true);
    updateVolumeFromMouse(e);
  };

  // Live mouse progress drag
  const updateProgressFromMouse = (e) => {
    if (!progressTrackRef.current) return;
    const rect = progressTrackRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = pct * playerState.duration;
    setLocalSeekTime(newTime);
  };

  const startProgressDrag = (e) => {
    e.stopPropagation();
    setIsDraggingProgress(true);
    updateProgressFromMouse(e);
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isDraggingVolume) updateVolumeFromMouse(e);
      if (isDraggingProgress) updateProgressFromMouse(e);
    };

    const handleMouseUp = () => {
      if (isDraggingVolume) {
        setIsDraggingVolume(false);
        if (localVolume !== null) {
          setPlayerState(prev => ({ ...prev, volume: localVolume }));
          sendCmd("volume", localVolume);
          setLocalVolume(null);
        }
      }
      if (isDraggingProgress) {
        setIsDraggingProgress(false);
        if (localSeekTime !== null) {
          sendCmd("seek", localSeekTime);
          setLocalSeekTime(null);
        }
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingVolume, isDraggingProgress, localSeekTime, localVolume]);

  const displayTime = isDraggingProgress && localSeekTime !== null ? localSeekTime : playerState.currentTime;
  const progressPct = playerState.duration > 0 ? (displayTime / playerState.duration) * 100 : 0;

  const formatTime = (secs) => {
    if (!secs || isNaN(secs)) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const formatRemaining = (cur, dur) => {
    if (!dur || isNaN(dur)) return "-0:00";
    const rem = Math.max(0, dur - cur);
    const m = Math.floor(rem / 60);
    const s = Math.floor(rem % 60).toString().padStart(2, "0");
    return `-${m}:${s}`;
  };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      width: "100vw",
      height: "100vh",
      display: "flex",
      justifyContent: "center",
      alignItems: "flex-start",
      paddingTop: "6px",
      background: "transparent",
      overflow: "hidden",
      userSelect: "none",
      WebkitUserSelect: "none"
    }}>
      <style>{`
        .island-card {
          background: rgba(12, 13, 19, 0.96);
          backdrop-filter: blur(28px);
          -webkit-backdrop-filter: blur(28px);
          box-shadow: none !important;
          color: #ffffff;
          overflow: hidden;
          transition: width 0.38s cubic-bezier(0.16, 1, 0.3, 1), height 0.38s cubic-bezier(0.16, 1, 0.3, 1), border-radius 0.35s ease;
        }

        .eq-bar-anim {
          width: 2.5px;
          background: #ffffff;
          border-radius: 2px;
          height: 14px;
          transform-origin: center center;
          animation: eqPulse 1.2s ease-in-out infinite alternate;
        }
        .eq-bar-anim:nth-child(1) { animation-delay: 0.1s; }
        .eq-bar-anim:nth-child(2) { animation-delay: 0.35s; }
        .eq-bar-anim:nth-child(3) { animation-delay: 0.2s; }
        .eq-bar-anim:nth-child(4) { animation-delay: 0.45s; }

        .beat-bar-anim {
          width: 3px;
          background: #ffffff;
          border-radius: 3px;
          height: 18px;
          transform-origin: center center;
          animation: beatPulse 1.1s ease-in-out infinite alternate;
        }
        .beat-bar-anim:nth-child(1) { animation-delay: 0.1s; }
        .beat-bar-anim:nth-child(2) { animation-delay: 0.35s; }
        .beat-bar-anim:nth-child(3) { animation-delay: 0.2s; }
        .beat-bar-anim:nth-child(4) { animation-delay: 0.45s; }
        .beat-bar-anim:nth-child(5) { animation-delay: 0.15s; }

        .paused-eq {
          animation: none !important;
          transform: scaleY(0.2) !important;
          opacity: 0.35 !important;
        }

        @keyframes eqPulse {
          0% { transform: scaleY(0.2); }
          100% { transform: scaleY(1); }
        }
        @keyframes beatPulse {
          0% { transform: scaleY(0.2); opacity: 0.6; }
          100% { transform: scaleY(1); opacity: 1; }
        }

        @keyframes spinCover {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .slide-out-next {
          transform: translateX(-18px) scale(0.95);
          opacity: 0;
          transition: all 0.15s ease;
        }
        .slide-in-prepare-next {
          transform: translateX(18px) scale(0.95);
          opacity: 0;
          transition: all 0.15s ease;
        }
        .track-text-anim {
          transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease;
        }
      `}</style>

      <div
        className="island-card"
        style={{
          width: isExpanded ? "460px" : "270px",
          height: isExpanded ? "164px" : "38px",
          borderRadius: isExpanded ? "26px" : "19px",
          cursor: isExpanded ? "default" : "pointer",
          padding: isExpanded ? "16px 20px" : "0 10px 0 6px",
          display: "flex",
          flexDirection: isExpanded ? "column" : "row",
          justifyContent: "space-between",
          alignItems: isExpanded ? "stretch" : "center",
          position: "relative",
          transform: isExpanded ? "scale(1)" : `scale(${overlayScale})`,
          transformOrigin: getTransformOrigin()
        }}
        onClick={() => {
          if (!isExpanded) {
            setIsExpanded(true);
            if (typeof window !== "undefined" && window.amyMusicDesktop?.resizeOverlayWindow) {
              window.amyMusicDesktop.resizeOverlayWindow(true).catch(() => {});
            }
          }
        }}
      >
        {overlayDragEnabled && (
          <button
            type="button"
            data-tauri-drag-region
            title="Переместить оверлей"
            aria-label="Переместить оверлей"
            onMouseDown={handleOverlayDragStart}
            onClick={(event) => event.stopPropagation()}
            style={{
              position: "absolute",
              top: 0,
              left: isExpanded ? "50%" : "auto",
              right: isExpanded ? "auto" : 0,
              bottom: isExpanded ? "auto" : 0,
              width: isExpanded ? "64px" : "18px",
              height: isExpanded ? "14px" : "auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              border: 0,
              background: "rgba(255, 255, 255, 0.08)",
              borderRadius: isExpanded ? "0 0 8px 8px" : 0,
              color: "rgba(255, 255, 255, 0.65)",
              cursor: "grab",
              transform: isExpanded ? "translateX(-50%)" : "none",
              zIndex: 4
            }}
          >
            <span
              style={isExpanded
                ? { width: "30px", height: "3px", borderRadius: "3px", background: "rgba(255, 255, 255, 0.7)" }
                : { fontSize: "13px", lineHeight: 1, letterSpacing: "-3px", transform: "translateX(-1px)" }}
            >
              {isExpanded ? null : "⋮⋮"}
            </span>
          </button>
        )}

        {/* Ambient Blurred Cover Overlay Background */}
        {playerState.cover && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "inherit",
              overflow: "hidden",
              pointerEvents: "none",
              zIndex: 0
            }}
          >
            <img
              src={playerState.cover}
              alt=""
              style={{
                position: "absolute",
                inset: "-40%",
                width: "180%",
                height: "180%",
                objectFit: "cover",
                filter: "blur(40px) saturate(2.5) brightness(0.8)",
                opacity: 1,
                pointerEvents: "none"
              }}
            />
          </div>
        )}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "inherit",
            background: "linear-gradient(135deg, rgba(12, 13, 19, 0.52) 0%, rgba(8, 9, 14, 0.68) 100%)",
            pointerEvents: "none",
            zIndex: 0
          }}
        />

        {/* COMPACT VIEW */}
        <div style={{
          position: "absolute",
          inset: "0 10px 0 0",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          zIndex: 2,
          opacity: isExpanded ? 0 : 1,
          pointerEvents: isExpanded ? "none" : "auto",
          transition: "opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
        }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden", flex: 1 }}>
              {playerState.cover ? (
                <img
                  src={playerState.cover}
                  alt=""
                  style={{
                    width: "38px",
                    height: "38px",
                    borderRadius: "50%",
                    objectFit: "cover",
                    border: "none",
                    flexShrink: 0
                  }}
                />
              ) : (
                <div style={{
                  width: "38px",
                  height: "38px",
                  borderRadius: "50%",
                  background: "rgba(255, 255, 255, 0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "10px",
                  flexShrink: 0,
                  border: "none"
                }}>
                  🎵
                </div>
              )}

              <div className={`track-text-anim ${trackAnimClass}`} style={{ display: "flex", flexDirection: "column", overflow: "hidden", whiteSpace: "nowrap" }}>
                <span style={{ fontSize: "11.5px", fontWeight: 600, color: "#f8fafc", textOverflow: "ellipsis", overflow: "hidden" }}>
                  {toSafeString(playerState.title, "AmyMusic")}
                </span>
                <span style={{ fontSize: "10px", fontWeight: 400, color: "#94a3b8", textOverflow: "ellipsis", overflow: "hidden" }}>
                  {toSafeString(playerState.artist, "AmyMusic")}
                </span>
              </div>
            </div>

            {/* Compact Beat Bars (Audio Reactive) */}
            <div style={{ display: "flex", alignItems: "center", gap: "2.5px", height: "14px", paddingRight: "2px" }}>
              {[
                playerState.audioEnergy?.bass || 0,
                playerState.audioEnergy?.mids || 0,
                playerState.audioEnergy?.level || 0,
                playerState.audioEnergy?.treble || 0
              ].map((val, idx) => {
                const h = playerState.isPlaying ? Math.max(3, 3 + val * 11) : 3;
                return (
                  <div
                    key={idx}
                    style={{
                      width: "2.5px",
                      borderRadius: "2px",
                      background: "#ffffff",
                      height: `${h}px`,
                      opacity: playerState.isPlaying ? 0.45 + val * 0.55 : 0.35,
                      transition: "height 0.08s ease, opacity 0.08s ease"
                    }}
                  />
                );
              })}
            </div>
          </div>

        {/* EXPANDED VIEW */}
        <div style={{
          position: "absolute",
          inset: "16px 20px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          zIndex: 2,
          opacity: isExpanded ? 1 : 0,
          pointerEvents: isExpanded ? "auto" : "none",
          transition: "opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
          transitionDelay: isExpanded ? "0.05s" : "0s"
        }}>
            
            {/* TOP ROW */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: "48px" }}>
              <div style={{ display: "flex", alignItems: "center", height: "48px", overflow: "hidden", flex: 1 }}>
                <div style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "12px",
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  boxShadow: "none",
                  overflow: "hidden"
                }}>
                  {playerState.cover ? (
                    <img src={playerState.cover} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "#ffffff" }}>
                      <path d="M9 18V5l12-2v13"></path>
                      <circle cx="6" cy="18" r="3"></circle>
                      <circle cx="18" cy="16" r="3"></circle>
                    </svg>
                  )}
                </div>

                <div className={`track-text-anim ${trackAnimClass}`} style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "48px", marginLeft: "14px", overflow: "hidden", maxWidth: "260px" }}>
                  <span style={{ fontSize: "15px", fontWeight: 700, color: "#ffffff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {toSafeString(playerState.title, "AmyMusic")}
                  </span>
                  <span style={{ fontSize: "12px", fontWeight: 500, color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: "3px" }}>
                    {toSafeString(playerState.artist, "AmyMusic")}
                  </span>
                </div>
              </div>

              {/* BEAT EQUALIZER BARS (Audio Reactive) & COLLAPSE BUTTON */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "3.5px", height: "22px" }}>
                  {[
                    playerState.audioEnergy?.bass || 0,
                    playerState.audioEnergy?.mids || 0,
                    playerState.audioEnergy?.level || 0,
                    playerState.audioEnergy?.treble || 0,
                    playerState.audioEnergy?.bass || 0
                  ].map((val, idx) => {
                    const scaleY = playerState.isPlaying ? Math.max(0.2, 0.2 + val * 0.8) : 0.2;
                    return (
                      <div
                        key={idx}
                        style={{
                          width: "3px",
                          height: "18px",
                          borderRadius: "3px",
                          background: "#ffffff",
                          transformOrigin: "center center",
                          transform: `scaleY(${scaleY})`,
                          opacity: playerState.isPlaying ? 0.45 + val * 0.55 : 0.35,
                          transition: "transform 0.08s ease, opacity 0.08s ease"
                        }}
                      />
                    );
                  })}
                </div>

                <button
                  style={{
                    background: "none",
                    border: "none",
                    color: "rgba(255, 255, 255, 0.4)",
                    cursor: "pointer",
                    fontSize: "14px",
                    lineHeight: 1,
                    padding: "4px"
                  }}
                  title="Свернуть"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(false);
                    setIsVolumeOpen(false);
                    if (typeof window !== "undefined" && window.amyMusicDesktop?.resizeOverlayWindow) {
                      window.amyMusicDesktop.resizeOverlayWindow(false).catch(() => {});
                    }
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* MIDDLE ROW: PROGRESS BAR */}
            <div style={{ display: "flex", flexDirection: "column", gap: "5px", width: "100%", marginTop: "8px" }}>
              <div
                ref={progressTrackRef}
                style={{ position: "relative", width: "100%", height: "4px", background: "rgba(255, 255, 255, 0.16)", borderRadius: "4px", cursor: "pointer" }}
                onMouseDown={startProgressDrag}
              >
                <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${progressPct}%`, background: "#ffffff", borderRadius: "4px" }} />
                <div style={{ position: "absolute", top: "50%", left: `${progressPct}%`, transform: "translate(-50%, -50%)", width: "10px", height: "10px", background: "#ffffff", borderRadius: "50%", boxShadow: "0 1px 4px rgba(0,0,0,0.6)" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: 500, color: "#94a3b8" }}>
                <span>{formatTime(displayTime)}</span>
                <span>{formatRemaining(displayTime, playerState.duration)}</span>
              </div>
            </div>

            {/* BOTTOM ROW: MEDIA CONTROLS & VOLUME FLYOUT */}
            <div style={{ position: "relative", width: "100%", height: "36px", marginTop: "2px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              
              {/* Media Controls */}
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "26px",
                opacity: isVolumeOpen ? 0 : 1,
                pointerEvents: isVolumeOpen ? "none" : "auto",
                transform: isVolumeOpen ? "translateX(-20px) scale(0.92)" : "none",
                transition: "all 0.28s cubic-bezier(0.16, 1, 0.3, 1)"
              }}>
                <button
                  style={{ background: "none", border: "none", color: "#cbd5e1", cursor: "pointer", display: "flex", alignItems: "center" }}
                  title="Предыдущий трек"
                  onClick={handlePrevTrack}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
                </button>

                {/* Primary Play/Pause Button - BORDERLESS */}
                <button
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    background: "rgba(255, 255, 255, 0.12)",
                    border: "none",
                    color: "#ffffff",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                  title="Пауза / Воспроизведение"
                  onClick={handleTogglePlayPause}
                >
                  {playerState.isPlaying ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  )}
                </button>

                <button
                  style={{ background: "none", border: "none", color: "#cbd5e1", cursor: "pointer", display: "flex", alignItems: "center" }}
                  title="Следующий трек"
                  onClick={handleNextTrack}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
                </button>
              </div>

              {/* Volume Flyout Slider */}
              <div style={{
                position: "absolute",
                right: "36px",
                top: "50%",
                transform: "translateY(-50%)",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                width: isVolumeOpen ? "350px" : "0px",
                opacity: isVolumeOpen ? 1 : 0,
                pointerEvents: isVolumeOpen ? "auto" : "none",
                overflow: "hidden",
                transition: "width 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease"
              }}>
                <div style={{ color: "#94a3b8", display: "flex", alignItems: "center", flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>
                </div>

                <div
                  ref={volumeTrackRef}
                  style={{ position: "relative", flex: 1, height: "4px", background: "rgba(255, 255, 255, 0.2)", borderRadius: "4px", cursor: "pointer" }}
                  onMouseDown={startVolumeDrag}
                >
                  <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${(localVolume !== null ? localVolume : playerState.volume) * 100}%`, background: "#ffffff", borderRadius: "4px" }} />
                  <div style={{ position: "absolute", top: "50%", left: `${(localVolume !== null ? localVolume : playerState.volume) * 100}%`, transform: "translate(-50%, -50%)", width: "10px", height: "10px", background: "#ffffff", borderRadius: "50%", boxShadow: "0 1px 4px rgba(0,0,0,0.6)" }} />
                </div>

                <span style={{ fontSize: "11px", fontWeight: 700, color: "#e2e8f0", minWidth: "32px", textAlign: "right", flexShrink: 0 }}>
                  {Math.round((localVolume !== null ? localVolume : playerState.volume) * 100)}%
                </span>
              </div>

              {/* Volume Trigger Icon */}
              <div style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", zIndex: 10 }}>
                <button
                  style={{ background: "none", border: "none", color: isVolumeOpen ? "#ffffff" : "#94a3b8", cursor: "pointer", display: "flex", alignItems: "center" }}
                  title="Громкость"
                  onClick={toggleVolumeSlider}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.02v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>
                </button>
              </div>

            </div>

          </div>
        </div>
      </div>
  );
}
