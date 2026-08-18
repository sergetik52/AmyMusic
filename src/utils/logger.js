const DEBUG_ENABLED = Boolean(import.meta?.env?.DEV || import.meta?.env?.VITE_DEBUG_AUDIO === "true");

export function logDebug(scope, message, details) {
  if (!DEBUG_ENABLED) return;
  const prefix = `[AmyMusic:${scope}] ${message}`;
  if (details === undefined) {
    console.debug(prefix);
  } else {
    console.debug(prefix, details);
  }
}

export function logWarn(scope, message, details) {
  const prefix = `[AmyMusic:${scope}] ${message}`;
  if (details === undefined) {
    console.warn(prefix);
  } else {
    console.warn(prefix, details);
  }
}
