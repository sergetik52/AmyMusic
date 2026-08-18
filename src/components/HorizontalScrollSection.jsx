import React, { useRef } from "react";

export function HorizontalScrollSection({ title, children }) {
  const scrollRef = useRef(null);

  const scrollLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -400, behavior: "smooth" });
    }
  };

  const scrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: 400, behavior: "smooth" });
    }
  };

  return (
    <div className="mt-8">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-black text-white">{title}</h2>
        <div className="flex gap-2">
          <button
            onClick={scrollLeft}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/20 hover:text-white active:scale-95"
            aria-label="Назад"
          >
            <svg className="h-6 w-6 fill-current rotate-90" viewBox="0 0 24 24"><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"></path></svg>
          </button>
          <button
            onClick={scrollRight}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/20 hover:text-white active:scale-95"
            aria-label="Вперед"
          >
            <svg className="h-6 w-6 fill-current -rotate-90" viewBox="0 0 24 24"><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"></path></svg>
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {children}
      </div>
    </div>
  );
}
