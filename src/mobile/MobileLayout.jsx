import React, { useEffect, useState } from "react";
import { MobileMiniPlayer } from "./MobileMiniPlayer";

const mobileNavItems = [
  { id: "wave", label: "Моя волна", icon: "/wave.svg" },
  { id: "trends", label: "Чарты", icon: "/trends.svg" },
  { id: "collection", label: "Коллекция", icon: "/collection.svg" }
];

export function MobileLayout({
  activeTab,
  setActiveTab,
  currentUser,
  profileData,
  onLoginClick,
  onOpenProfile,
  renderContent,
  BottomPlayer,
  onOpenFull,
  openArtist,
  openAlbum,
  onToggleKaraoke,
  isKaraokeOpen,
  activeArtist,
  activeAlbum,
  isFullOpen
}) {
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const viewport = window.visualViewport;
    if (!viewport) return undefined;
    const updateViewport = () => {
      const heightDelta = window.innerHeight - viewport.height;
      setKeyboardOpen(heightDelta > 120);
      document.documentElement.style.setProperty("--visual-viewport-height", `${Math.round(viewport.height)}px`);
    };
    updateViewport();
    viewport.addEventListener("resize", updateViewport);
    viewport.addEventListener("scroll", updateViewport);
    return () => {
      viewport.removeEventListener("resize", updateViewport);
      viewport.removeEventListener("scroll", updateViewport);
    };
  }, []);

  return (
    <div className={`app-shell mobile-app-shell ${keyboardOpen ? "is-keyboard-open" : ""}`}>
      {/* Main View Content */}
      <main className="mobile-content-stage">
        <div
          key={`${activeTab}-${activeArtist?.id || "none"}-${activeAlbum?.id || "noalbum"}`}
          className="mobile-content-view"
        >
          {renderContent()}
        </div>
      </main>

      {/* Separate floating surfaces: player above navigation dock. */}
      {!isFullOpen && (
        <div className="mobile-floating-controls">
          <MobileMiniPlayer onOpenFull={onOpenFull} />
          <nav
            className="mobile-nav-dock"
            aria-label="Основная навигация"
            style={{
              "--nav-index": Math.max(0, mobileNavItems.findIndex((item) => item.id === activeTab)),
              "--nav-count": mobileNavItems.length
            }}
          >
            {mobileNavItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className="mobile-nav-item"
                  data-active={isActive ? "true" : "false"}
                  aria-label={item.label}
                  aria-current={isActive ? "page" : undefined}
                >
                  <div
                    className="mobile-nav-item__icon"
                    style={{
                      maskImage: `url(${item.icon})`,
                      WebkitMaskImage: `url(${item.icon})`,
                      maskRepeat: "no-repeat",
                      WebkitMaskRepeat: "no-repeat",
                      maskSize: "contain",
                      WebkitMaskSize: "contain",
                      maskPosition: "center",
                      WebkitMaskPosition: "center"
                    }}
                  />
                </button>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}
