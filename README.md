# Amy Music UI

Amy Music is a desktop music-player interface prototype built with React, Vite, and Tailwind CSS. The app is currently a frontend-only UI: navigation, player states, overlays, volume controls, and animations are implemented locally in React/CSS without a real audio backend.

## Tech Stack

- React 18
- Vite 6
- Tailwind CSS 3
- Plain CSS animations in `src/main.css`
- SVG and image assets served from `public/`

## Run

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

## App Layout

The root app is in `src/App.jsx`.

The app uses a black desktop layout with:

- left sidebar navigation;
- main content area;
- conditional bottom player for non-wave pages;
- optional full-screen player overlay;
- persistent dark visual style.

The main app state currently includes:

- `activeTab`: controls which page is visible;
- `isFullOpen`: controls the full-screen player overlay;
- local `volume` state inside player tools.

## Sidebar

The sidebar has:

- Amy Music logo from `public/logo.png`;
- navigation items:
  - `Поиск`;
  - `Моя волна`;
  - `Для вас и Тренды`;
  - `Коллекция`;
- active item highlighting in purple `#8341EF`;
- Windows promo card with `Скачать`;
- purple `Войти` button.

Icons are loaded from `public/*.svg` and masked with `background: currentColor`, so inactive and active states inherit text color.

## Search Page

`SearchPanel` is defined in `src/App.jsx`.

It contains:

- dark rounded content card;
- search input with `Что вы чувствуете или ищете?`;
- tabs:
  - `Популярное`;
  - `История`.

The page is currently static and does not perform real search.

## My Wave Page

`src/components/WaveView.jsx`

This is the most animated screen. It contains:

- animated 3D/DNA-style music wave;
- two intertwined main wave strands;
- two weaker echo wave strands;
- generated DNA rungs between the wave lines;
- dynamic state for play/pause;
- central `Моя волна` title when paused;
- animated track cover when playing;
- mini track title pill;
- local controls: dislike, previous, play, next, like.

Current track data is stored locally in `currentTrack`:

- mood: `freddy krueger`;
- title: `RUD!N - romantic`;
- cover: `/logo.png`;
- palette:
  - `base`;
  - `line`;
  - `bright`;
  - `shadow`.

The wave color is controlled by CSS variables from `currentTrack.palette`, so later it can be wired to colors extracted from album art.

### Wave Behavior

Paused:

- wave flows steadily;
- `Моя волна` is shown in the center;
- cover is small and positioned near the lower track-title area.

Playing:

- cover moves, grows, and pulses;
- DNA wave and rungs become brighter/thicker;
- wave motion speeds up;
- bass-like pulse animation is simulated with CSS keyframes.

The wave is not connected to real audio analysis yet. Bass behavior is simulated.

## Collection Page

`src/components/CollectionView.jsx`

The collection page includes:

- page title `Коллекция`;
- subtitle `У вашей музыки есть цвет`;
- `Мне нравится` section;
- static liked-track list;
- hover play overlay on track covers;
- explicit markers;
- like buttons;
- track durations;
- `Любимые исполнители` horizontal artist list.

The track/artist data is local mock data. Some image paths reference:

- `public/covers/...`
- `public/artists/...`

If those files are missing, the component hides broken images and keeps fallback shapes visible.

## Bottom Player

Defined in `src/App.jsx` as:

- `BottomPlayer`;
- `TrackInfo`;
- `PlayerControls`;
- `PlayerTools`.

The bottom player is shown only when `activeTab !== "wave"`.

It contains:

- current track block:
  - cover image;
  - title `ДИНАСТИЯ`;
  - `18+` marker;
  - artist `VILLIAN, madk1d`;
- playback controls:
  - dislike;
  - shuffle;
  - previous;
  - play;
  - next;
  - repeat;
  - like;
- right-side tools:
  - lyrics;
  - queue;
  - equalizer;
  - volume.

Clicking the track info or lyrics button opens the full-screen player overlay.

## Volume Control

The volume tool is implemented inside `PlayerTools`.

Behavior:

- hover/focus on the volume icon opens a vertical volume popup;
- the vertical slider is a real `<input type="range">`;
- current value is stored in React state;
- visible track uses `public/volume-input.svg`;
- visible ball uses `public/volume-ball.svg`;
- yellow fill height updates with `volume`;
- icon changes by volume:
  - `volume === 0`: `public/volume-mute.svg`;
  - `volume > 0`: `public/volume-plus.svg`.

The native range input is invisible and only handles interaction, preventing duplicate/fantom thumb rendering.

## Full Player Overlay

`src/components/FullPlayerOverlay.jsx`

The overlay opens over the entire app and includes:

- fade-in/fade-out transition;
- close button in the top-right;
- large cover image;
- hover overlay on the cover with controls;
- play/pause state;
- previous/next buttons;
- repeat button;
- menu button;
- lyrics toggle;
- like toggle;
- title `romantic`;
- artist `RUDIN`;
- simple progress bar;
- optional lyrics panel on the right.

Lyrics are currently local static lines. The active lyric index is hardcoded.

## Assets

Assets live in `public/`.

Current important assets:

- `logo.png`
- `search.svg`
- `wave.svg`
- `trends.svg`
- `collection.svg`
- `user.svg`
- `play.svg`
- `play-hover.svg`
- `prev.svg`
- `next.svg`
- `shuffle.svg`
- `repeat.svg`
- `like.svg`
- `dislike.svg`
- `lyrics.svg`
- `queue.svg`
- `equalizer.svg`
- `volume-mute.svg`
- `volume-plus.svg`
- `volume-input.svg`
- `volume-ball.svg`
- `heart-header.svg`
- `korona.svg`

Some collection data expects optional folders:

- `public/covers/`
- `public/artists/`

Those assets are optional at the moment because the UI has fallback behavior.

## CSS Systems

Most custom behavior is in `src/main.css`.

Implemented CSS systems:

- hidden scrollbars utility;
- vertical volume popup;
- custom volume slider rendering;
- DNA wave animation;
- wave/rung bass pulse simulation;
- cover movement and bass pulse;
- reduced-motion fallback for major animations.

Important CSS class groups:

- `.volume-*`
- `.wave-screen`
- `.song-wave-*`
- `.song-dna-*`
- `.song-cover`

## Current Limitations

- HTML5 Audio integration has started through `AudioProvider` / `useAudioPlayer`.
- Volume slider is bound to the global HTML5 Audio element.
- No real search.
- No persistent user data.
- No routing library.
- No backend/API integration.
- Wave/bass animation is still simulated, not driven by audio frequencies.
- Cover palette is manually set in `currentTrack.palette`; automatic color extraction is not implemented yet.

## Audio/API Integration

The first integration stage is implemented in:

- `src/audio/AudioPlayerContext.jsx`
- `src/services/soundCloudApi.js`

`AudioProvider` owns one global HTML5 `Audio` instance and exposes:

- `currentTrack`
- `queue`
- `isPlaying`
- `duration`
- `currentTime`
- `progress`
- `volume`
- `effectiveVolume`
- `play`
- `pause`
- `togglePlay`
- `playTrack`
- `next`
- `previous`
- `seek`
- `setVolume`
- `toggleLike`
- `controls`

`controls` is the shared player button config used by the bottom player.

Environment variables are documented in `.env.example`:

```bash
VITE_SOUNDCLOUD_CLIENT_ID=
SOUNDCLOUD_CLIENT_SECRET=
VITE_SOUNDCLOUD_API_BASE=/api/soundcloud
VITE_SOUNDCLOUD_PROXY_TARGET=https://api-v2.soundcloud.com
VITE_SOUNDCLOUD_HTTP_PROXIES=45.141.185.15:5882,163.5.189.210:3888
VITE_SOUNDLAB_API_BASE=
```

In development, SoundCloud API requests go through the Vite proxy at `/api/soundcloud` to avoid browser CORS failures. Without `VITE_SOUNDCLOUD_CLIENT_ID`, the app does not use a demo stream; requests fail loudly and log diagnostics to the browser console.

`SOUNDCLOUD_CLIENT_SECRET` is intentionally not prefixed with `VITE_`. It is only read by `vite.config.js` on the local dev server and must not be exposed to browser code. When it is set, the proxy tries the SoundCloud client-credentials flow and forwards API requests with `Authorization: Bearer ...`.

Debug logs use these prefixes:

- `[AmyMusic:api]`
- `[AmyMusic:audio]`

## Suggested Next Steps

- Add a real audio element/player state.
- Bind play/pause controls across bottom player, My Wave, and full overlay.
- Connect volume slider to audio volume.
- Extract palette from cover art and feed it into `WaveView`.
- Drive DNA wave intensity from Web Audio API analyser data.
- Add real track list data and cover assets.
