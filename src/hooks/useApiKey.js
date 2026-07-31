import { useCallback, useState } from "react";

const STORAGE_KEY = "studygenius:geminiApiKey";

function readStoredKey() {
  try {
    return localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return ""; // storage unavailable (private browsing, etc.) - fall back to session-only
  }
}

/**
 * Persists the user's own Gemini API key to localStorage so they only ever
 * enter it once per browser. `hasStoredKey` tells the UI whether to show
 * the entry form (first visit / no key saved) or the "connected" state.
 */
export function useApiKey() {
  const [apiKey, setApiKey] = useState(readStoredKey);

  const saveKey = useCallback((key) => {
    const trimmed = key.trim();
    setApiKey(trimmed);
    try {
      if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed);
    } catch {
      /* storage unavailable - key still works for this session via state */
    }
  }, []);

  const clearKey = useCallback(() => {
    setApiKey("");
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return { apiKey, hasStoredKey: !!apiKey, saveKey, clearKey };
}
