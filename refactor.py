import re

with open('src/audio/AudioPlayerContext.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. State changes
content = re.sub(
    r'const audioRef = useRef\(null\);\n  const audioContextRef = useRef\(null\);',
    r'const audioRefs = [useRef(null), useRef(null)];\n  const hlsRefs = [useRef(null), useRef(null)];\n  const activeEngineRef = useRef(0);\n  const crossfadeStateRef = useRef({ isCrossfading: false });\n  const audioContextRef = useRef(null);\n  const gainNodesRef = [useRef(null), useRef(null)];\n  \n  const getActiveAudio = () => audioRefs[activeEngineRef.current].current;\n  const getInactiveAudio = () => audioRefs[activeEngineRef.current === 0 ? 1 : 0].current;\n  const getActiveHls = () => hlsRefs[activeEngineRef.current].current;\n  const getInactiveHls = () => hlsRefs[activeEngineRef.current === 0 ? 1 : 0].current;\n',
    content
)

content = re.sub(r'const hlsRef = useRef\(null\);\n', '', content)

# 2. Initialization of audio tags
init_replacement = """    if (!audioRefs[0].current) {
      audioRefs[0].current = new Audio();
      audioRefs[0].current.crossOrigin = "anonymous";
    }
    if (!audioRefs[1].current) {
      audioRefs[1].current = new Audio();
      audioRefs[1].current.crossOrigin = "anonymous";
    }
"""
content = re.sub(
    r'    const audio = new Audio\(\);\n    audio.crossOrigin = "anonymous";\n    audioRef.current = audio;\n',
    init_replacement,
    content
)

# 3. Replace straightforward audioRef.current and hlsRef.current accesses where they are READ
# (We must skip assignments)
# We will just replace all `audioRef.current` with `getActiveAudio()` EXCEPT assignments.
# To handle this carefully, we can use a more precise regex.

def replace_audio_ref(match):
    text = match.group(0)
    if 'audioRef.current =' in text or 'audioRef.current=' in text:
        return text # Skip assignments
    return text.replace('audioRef.current', 'getActiveAudio()')

def replace_hls_ref(match):
    text = match.group(0)
    if 'hlsRef.current =' in text or 'hlsRef.current=' in text:
        return text.replace('hlsRef.current', 'hlsRefs[activeEngineRef.current].current')
    return text.replace('hlsRef.current', 'getActiveHls()')

# Apply
content = re.sub(r'audioRef\.current[^\n]*', replace_audio_ref, content)
content = re.sub(r'hlsRef\.current[^\n]*', replace_hls_ref, content)

with open('src/audio/AudioPlayerContext.temp.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Done")
