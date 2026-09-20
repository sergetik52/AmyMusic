const fs = require('fs');
const path = 'src/audio/AudioPlayerContext.jsx';
let content = fs.readFileSync(path, 'utf8');

// The multi_replace_file_content failed on the useEffect for creating audio.
// Let's replace it carefully.

const target = `  useEffect(() => {
    audio.volume = volume;
    audio.playbackRate = 1.0; // explicit safety: never allow accidental speed-up
    audioRef.current = audio;
    logDebug("audio", "HTMLAudioElement created", { volume });`;

const replacement = `  useEffect(() => {
    if (!audioRefs[0].current) {
      audioRefs[0].current = new Audio();
      audioRefs[0].current.crossOrigin = "anonymous";
      audioRefs[0].current.volume = volume;
      audioRefs[0].current.playbackRate = 1.0;
    }
    if (!audioRefs[1].current) {
      audioRefs[1].current = new Audio();
      audioRefs[1].current.crossOrigin = "anonymous";
      audioRefs[1].current.volume = volume;
      audioRefs[1].current.playbackRate = 1.0;
    }
    logDebug("audio", "HTMLAudioElements created", { volume });

    const setupAudioListeners = (audio, engineIndex) => {
      const isEventActive = () => activeEngineRef.current === engineIndex || crossfadeStateRef.current?.isCrossfading;
      
      const onTimeUpdate = (e) => { if (isEventActive()) handleTimeUpdate(e); };
      const onSeeking = (e) => { if (isEventActive()) handleSeeking(e); };
      const onSeeked = (e) => { if (isEventActive()) handleSeeked(e); };
      const onDurationChange = (e) => { if (isEventActive()) handleDurationChange(e); };
      const onPlay = (e) => { if (isEventActive()) handlePlay(e); };
      const onPlaying = (e) => { if (isEventActive()) handlePlaying(e); };
      const onPause = (e) => { if (isEventActive()) handlePause(e); };
      const onWaiting = (e) => { if (isEventActive()) handleWaiting(e); };
      const onCanPlay = (e) => { if (isEventActive()) handleCanPlay(e); };
      const onEnded = (e) => { if (isEventActive()) handleEnded(e); };
      const onError = (e) => { if (isEventActive()) handleError(e); };

      audio.addEventListener("timeupdate", onTimeUpdate);
      audio.addEventListener("seeking", onSeeking);
      audio.addEventListener("seeked", onSeeked);
      audio.addEventListener("durationchange", onDurationChange);
      audio.addEventListener("loadedmetadata", onDurationChange);
      audio.addEventListener("play", onPlay);
      audio.addEventListener("playing", onPlaying);
      audio.addEventListener("pause", onPause);
      audio.addEventListener("waiting", onWaiting);
      audio.addEventListener("canplay", onCanPlay);
      audio.addEventListener("canplaythrough", onCanPlay);
      audio.addEventListener("ended", onEnded);
      audio.addEventListener("error", onError);

      return () => {
        audio.removeEventListener("timeupdate", onTimeUpdate);
        audio.removeEventListener("seeking", onSeeking);
        audio.removeEventListener("seeked", onSeeked);
        audio.removeEventListener("durationchange", onDurationChange);
        audio.removeEventListener("loadedmetadata", onDurationChange);
        audio.removeEventListener("play", onPlay);
        audio.removeEventListener("playing", onPlaying);
        audio.removeEventListener("pause", onPause);
        audio.removeEventListener("waiting", onWaiting);
        audio.removeEventListener("canplay", onCanPlay);
        audio.removeEventListener("canplaythrough", onCanPlay);
        audio.removeEventListener("ended", onEnded);
        audio.removeEventListener("error", onError);
      };
    };`;

content = content.replace(target, replacement);

fs.writeFileSync(path, content);
console.log('Replaced target block');
