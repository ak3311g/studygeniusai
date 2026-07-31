import { useState } from "react";

export function ApiKeySetup({ hasStoredKey, onSave, onClear }) {
  const [draft, setDraft] = useState("");
  const [isEditing, setIsEditing] = useState(!hasStoredKey);

  const handleSave = () => {
    if (!draft.trim()) return;
    onSave(draft);
    setDraft("");
    setIsEditing(false);
  };

  // Key already saved and not currently being changed - compact confirmation row
  if (hasStoredKey && !isEditing) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-xs font-semibold text-slate-700">Gemini API Key connected</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsEditing(true)} className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700">
            Change
          </button>
          <button
            onClick={() => {
              onClear();
              setIsEditing(true);
            }}
            className="text-[11px] font-semibold text-red-500 hover:text-red-600"
          >
            Remove
          </button>
        </div>
      </div>
    );
  }

  // No key stored yet, or user chose to change it - show the entry form
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-2">
      <label className="block text-xs font-semibold text-slate-700">Gemini API Key</label>
      <input
        type="password"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSave()}
        placeholder="Paste your Gemini API Key here..."
        className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
        autoFocus={hasStoredKey}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] text-slate-400">Saved to this browser only - never sent anywhere but Google's API.</p>
        <div className="flex gap-2 shrink-0">
          {hasStoredKey && (
            <button onClick={() => setIsEditing(false)} className="text-[11px] font-semibold text-slate-500 hover:text-slate-700">
              Cancel
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!draft.trim()}
            className="px-3 py-1 text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg"
          >
            Save Key
          </button>
        </div>
      </div>
    </div>
  );
}
