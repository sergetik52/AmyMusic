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
      <main className={`flex-1 w-full p-0 flex flex-col relative bg-[#090909] ${
        activeTab === "wave" || activeTab === "search" ? "overflow-hidden h-[calc(100vh-56px-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))]" : "overflow-y-auto pb-32 custom-scrollbar min-h-0"
      }`}>
        <div key={`${activeTab}-${activeArtist?.id || "none"}-${activeAlbum?.id || "noalbum"}`} className="flex-1 min-h-full flex flex-col w-full min-h-0">
          {renderContent()}
        </div>
      </main>

      {/* Mobile Floating Bottom Player */}
      {activeTab !== "wave" && !isFullOpen && (
        <div className="fixed bottom-[calc(72px+env(safe-area-inset-bottom,0px))] left-2 right-2 z-40">
          <BottomPlayer
            onOpenFull={onOpenFull}
            onOpenArtist={openArtist}
            onOpenAlbum={openAlbum}
            onToggleKaraoke={onToggleKaraoke}
            isKaraokeOpen={isKaraokeOpen}
          />
        </div>
      )}

      {/* Mobile Fixed Bottom Tab Bar */}
      {!isFullOpen && (
        <nav className="fixed bottom-0 left-0 right-0 z-50 flex w-full items-center justify-around px-6 py-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] bg-[#090909]/80 backdrop-blur-xl border-t border-white/10 shrink-0">
          {mobileNavItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex h-10 w-10 items-center justify-center rounded-full transition active:scale-95 ${
                  isActive ? "opacity-100 text-white" : "opacity-50 hover:opacity-100 text-white"
                }`}
                aria-label={item.label}
                title={item.label}
              >
                <div
                  className="h-5 w-5 shrink-0 bg-current transition-transform"
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
      )}
    </div>
  );
}
