/**
 * Local-only stubs. Cloud auth/sync is disabled after the server shutdown.
 * Collection, wave, and profile data live in localStorage via AudioPlayerContext
 * and localProfile / profileSettings services.
 */

import {
  ensureLocalProfile,
  getLocalProfile,
  saveLocalProfile
} from "./services/localProfile";

export const getAuthToken = () => null;
export const setAuthToken = () => {};
export const removeAuthToken = () => {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem("amymusic_token");
  }
};

export const getUsername = () => {
  const profile = getLocalProfile();
  return profile.username || "Local";
};

export const setUsername = (username) => {
  saveLocalProfile({ username, displayName: username });
};

export const register = async (username) => {
  const profile = saveLocalProfile({
    username: username || "Local",
    displayName: username || "Local"
  });
  return {
    token: null,
    username: profile.username,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl
  };
};

export const login = register;

export const getProfile = async () => {
  const profile = ensureLocalProfile();
  return {
    username: profile.username,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    totalListenedSeconds: 0
  };
};

export const updateProfile = async (data = {}) => {
  const profile = saveLocalProfile({
    displayName: data.displayName,
    avatarUrl: data.avatarUrl
  });
  return {
    success: true,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl
  };
};

export const changePassword = async () => {
  throw new Error("Смена пароля недоступна: приложение работает в локальном режиме");
};

export const syncTime = async () => ({ success: true });
export const syncCollections = async () => ({ success: true });
export const getCollections = async () => ({
  likedTracks: [],
  userPlaylists: [],
  savedReleases: []
});
export const syncWave = async () => ({ success: true });
export const getWave = async () => ({
  dislikedTrackIds: [],
  playHistory: []
});
export const trackListen = async () => ({ success: true });
export const getTopUsers = async () => [];
