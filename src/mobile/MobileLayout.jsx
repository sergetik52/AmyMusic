import React from "react";

const mobileNavItems = [
  { id: "search", label: "Поиск", icon: "/search.svg" },
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
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#090909] text-white select-none relative pt-[env(safe-area-inset-top,0px)]">
      {/* Main View Content */}
      <main className="flex-1 w-full p-0 flex flex-col relative bg-[#090909] min-h-0 overflow-hidden">
        <div
          key={`${activeTab}-${activeArtist?.id || "none"}-${activeAlbum?.id || "noalbum"}`}
          className="flex-1 min-h-full flex flex-col w-full min-h-0 transition-opacity duration-200 ease-out"
        >
          {renderContent()}
        </div>
      </main>

      {/* Unified Bottom Bar: Mini-player + Navigation merged */}
      {!isFullOpen && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#0d0d0d] pb-[env(safe-area-inset-bottom,0px)] transition-transform duration-300 ease-out">
          {/* Mini-player row — compact, edge-to-edge */}
          {activeTab !== "wave" && (
            <div className="w-full px-1">
              <BottomPlayer
                onOpenFull={onOpenFull}
                onOpenArtist={openArtist}
                onOpenAlbum={openAlbum}
                onToggleKaraoke={onToggleKaraoke}
                isKaraokeOpen={isKaraokeOpen}
              />
            </div>
          )}

          {/* Navigation row — clean 4-tab bar */}
          <nav className="flex w-full items-center justify-around px-4 py-1.5">
            {mobileNavItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex flex-col items-center justify-center gap-0.5 rounded-lg px-3 py-1 transition duration-200 active:scale-95 ${
                    isActive ? "opacity-100 text-white" : "opacity-40 text-white"
                  }`}
                  aria-label={item.label}
                >
                  <div
                    className="h-5 w-5 shrink-0 bg-current transition-transform duration-200"
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
                  <span className={`text-[9px] font-semibold leading-tight ${isActive ? "text-white" : "text-white/40"}`}>
                    {item.label}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}
