import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "studygenius:chapterHistory";

function readFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return []; // corrupted or unavailable storage shouldn't crash the app
  }
}

/**
 * Previously chapterHistory lived only in React state and was lost on every
 * refresh. This persists it to localStorage (guarded with try/catch since
 * storage can throw in private browsing / sandboxed contexts).
 */
export function useChapterHistory() {
  const [history, setHistory] = useState(readFromStorage);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch {
      /* storage full or unavailable - fail silently, history still works in-session */
    }
  }, [history]);

  const addEntry = useCallback((domain, data) => {
    const entry = {
      id: "hist_" + Date.now(),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      date: new Date().toLocaleDateString(),
      domain,
      data,
    };
    setHistory((prev) => [entry, ...prev]);
  }, []);

  const removeEntry = useCallback((id) => {
    setHistory((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const clearAll = useCallback(() => setHistory([]), []);

  return { history, addEntry, removeEntry, clearAll };
}
