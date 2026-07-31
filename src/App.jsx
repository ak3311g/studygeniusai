import React, { useEffect, useRef, useState, useCallback } from "react";

import { useToast } from "./hooks/useToast";
import { useChapterHistory } from "./hooks/useChapterHistory";
import { useApiKey } from "./hooks/useApiKey";
import { callGeminiAPI, extractJsonText, validateStudyData, buildStudyPackPayload } from "./api/geminiClient";
import { getWorksheetPlainText, shuffleDeck, copyToClipboard } from "./utils/studyPackHelpers";
import { getPdfJs } from "./lib/lazyLibs";
import { NotesRenderer } from "./components/NotesRenderer";
import { ApiKeySetup } from "./components/ApiKeySetup";
import { SAMPLE_SCIENCE, SAMPLE_SST } from "./data/sampleData";

export default function App() {
  // Config
  const { apiKey, hasStoredKey, saveKey, clearKey } = useApiKey();

  // Form inputs
  const [rawText, setRawText] = useState("");
  const [subjectDomain, setSubjectDomain] = useState("Science (Physics, Chemistry, Biology)");
  const [gradeLevel, setGradeLevel] = useState("Middle School (Grades 6-8)");
  const [fileName, setFileName] = useState("");

  // App state
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [activeTab, setActiveTab] = useState("tabNotes");
  const [currentStudyData, setCurrentStudyData] = useState(null);

  // Interactive UI state
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);
  const [userQuizAnswers, setUserQuizAnswers] = useState({});
  const [quizScore, setQuizScore] = useState(0);
  const [currentCardIdx, setCurrentCardIdx] = useState(0);
  const [isCardFlipped, setIsCardFlipped] = useState(false);

  const { toast, showToast } = useToast();
  const { history: chapterHistory, addEntry, removeEntry, clearAll } = useChapterHistory();

  const fileInputRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Cancel any in-flight request on unmount
  useEffect(() => {
    return () => abortControllerRef.current?.abort();
  }, []);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);

    if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
      setIsLoading(true);
      setLoadingMsg("Loading PDF parser...");
      try {
        const pdfjsLib = await getPdfJs(); // fetched on first use, cached after
        setLoadingMsg("Extracting text from PDF file...");
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        let fullText = "";

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageItems = textContent.items.map((item) => item.str).join(" ");
          fullText += `\n--- PAGE ${i} ---\n` + pageItems;
        }

        setRawText(fullText);
        showToast("PDF text extracted successfully!", "success");
      } catch (err) {
        showToast("Failed to parse PDF: " + err.message, "error");
      } finally {
        setIsLoading(false);
      }
    } else {
      const text = await file.text();
      setRawText(text);
      showToast("File loaded successfully!", "success");
    }

    // Reset so selecting the SAME file again still fires onChange
    e.target.value = "";
  };

  const generateStudyPack = async () => {
    const textContent = rawText.trim();
    if (!textContent) {
      showToast("Please upload a PDF or paste chapter text first.", "error");
      return;
    }
    if (!apiKey.trim()) {
      showToast("Please enter your Gemini API Key first.", "error");
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setLoadingMsg(`Generating 20 MCQs, 30-Q Worksheet & 10 Flashcards for ${subjectDomain}...`);

    const payload = buildStudyPackPayload({ textContent, subjectDomain, gradeLevel });

    try {
      const responseData = await callGeminiAPI(payload, apiKey, { signal: controller.signal });
      const rawJsonStr = extractJsonText(responseData);
      const parsedData = JSON.parse(rawJsonStr);

      const problems = validateStudyData(parsedData);
      if (problems.length) {
        throw new Error(`AI response was incomplete: ${problems.join("; ")}`);
      }

      setCurrentStudyData(parsedData);
      setUserQuizAnswers({});
      setQuizScore(0);
      setCurrentCardIdx(0);
      setIsCardFlipped(false);
      setShowAnswers(false);

      addEntry(subjectDomain, parsedData);
      showToast("Study Pack generated and saved to history!", "success");
    } catch (err) {
      if (err.name !== "AbortError") {
        showToast("Generation error: " + err.message, "error");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loadSample = (sampleText, domain) => {
    setRawText(sampleText);
    setSubjectDomain(domain);
    setFileName("Sample Document");
  };

  const handleQuizAnswer = (qIdx, optIdx, correctIndex) => {
    if (userQuizAnswers[qIdx] !== undefined) return;
    setUserQuizAnswers((prev) => ({ ...prev, [qIdx]: optIdx }));
    if (optIdx === correctIndex) setQuizScore((prev) => prev + 1);
  };

  const handleShuffleDeck = useCallback(() => {
    setCurrentStudyData((prev) => {
      if (!prev?.flashcards10) return prev;
      return { ...prev, flashcards10: shuffleDeck(prev.flashcards10) };
    });
    setCurrentCardIdx(0);
    setIsCardFlipped(false);
    showToast("Deck shuffled!", "info");
  }, [showToast]);

  const handleCopy = async (text, successMsg) => {
    try {
      await copyToClipboard(text);
      showToast(successMsg, "success");
    } catch {
      showToast("Copy failed, please select text manually.", "error");
    }
  };

  const wordCount = rawText.trim() ? rawText.trim().split(/\s+/).length : 0;

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl shadow-lg text-xs font-semibold text-white flex items-center gap-2 transition-all ${
            toast.type === "error" ? "bg-red-600" : toast.type === "success" ? "bg-emerald-600" : "bg-indigo-600"
          }`}
        >
          <span>{toast.message}</span>
        </div>
      )}

      {isHistoryOpen && (
        <div onClick={() => setIsHistoryOpen(false)} className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-40 transition-opacity" />
      )}

      <aside
        className={`fixed top-0 right-0 h-full w-full sm:w-96 bg-white shadow-2xl z-50 transform transition-transform duration-300 flex flex-col no-print ${
          isHistoryOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-800 text-base leading-none">Recent Chapters</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">Switch between saved chapter study packs</p>
          </div>
          <button onClick={() => setIsHistoryOpen(false)} className="w-8 h-8 rounded-lg bg-slate-200/60 hover:bg-slate-200 text-slate-600 flex items-center justify-center">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {chapterHistory.length === 0 ? (
            <div className="text-center py-12 px-4">
              <p className="text-xs font-semibold text-slate-700">No History Available</p>
              <p className="text-[11px] text-slate-400 mt-1">Generated chapter study packs will appear here for easy switching.</p>
            </div>
          ) : (
            chapterHistory.map((item) => (
              <div key={item.id} className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 transition space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[9px] font-bold text-indigo-600 uppercase tracking-wider bg-indigo-50 px-2 py-0.5 rounded">
                      {item.domain.split(" ")[0]}
                    </span>
                    <h4 className="text-xs font-bold text-slate-800 mt-1 line-clamp-1">{item.data.chapterTitle || "Chapter"}</h4>
                  </div>
                  <button onClick={() => removeEntry(item.id)} className="text-slate-300 hover:text-red-500 p-1 text-xs">
                    🗑
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">{item.data.summary}</p>
                <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[10px] text-slate-400">
                  <span>{item.date} • {item.timestamp}</span>
                  <button
                    onClick={() => {
                      setCurrentStudyData(item.data);
                      setIsHistoryOpen(false);
                      showToast(`Loaded "${item.data.chapterTitle}"`, "success");
                    }}
                    className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-md transition"
                  >
                    Load Pack
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-medium">{chapterHistory.length} Saved Chapters</span>
          {chapterHistory.length > 0 && (
            <button onClick={clearAll} className="text-xs text-red-600 hover:text-red-700 font-semibold px-2 py-1 rounded">
              Clear All
            </button>
          )}
        </div>
      </aside>

      {isExportModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[85vh] overflow-hidden border border-slate-200">
            <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800 text-base leading-none">Worksheet Plain Text Document</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Copy or save your 30-Question Assessment Sheet</p>
              </div>
              <button onClick={() => setIsExportModalOpen(false)} className="w-8 h-8 rounded-lg bg-slate-200/60 hover:bg-slate-200 text-slate-600 flex items-center justify-center">
                ✕
              </button>
            </div>
            <div className="p-4 flex-1 flex flex-col gap-2 overflow-hidden bg-slate-900">
              <textarea
                readOnly
                value={getWorksheetPlainText(currentStudyData)}
                className="w-full flex-1 p-3 bg-slate-950 text-emerald-400 font-mono text-xs rounded-xl border border-slate-800 focus:outline-none resize-none leading-relaxed select-all"
              />
            </div>
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
              <p className="text-[11px] text-slate-500">Copy text or save plain text document.</p>
              <button
                onClick={() => handleCopy(getWorksheetPlainText(currentStudyData), "Worksheet copied!")}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl transition shadow-sm"
              >
                Copy All Text
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="bg-indigo-700 text-white shadow-md sticky top-0 z-30 no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-white text-indigo-700 p-2 rounded-lg font-bold text-xl shadow">🎓</div>
            <div>
              <h1 className="font-bold text-lg sm:text-xl tracking-tight leading-none">StudyGenius AI</h1>
              <p className="text-xs text-indigo-200">React Study Pack Generator & History Manager</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsHistoryOpen(true)}
              className="px-3 py-1.5 text-xs bg-indigo-800 hover:bg-indigo-600 text-white rounded-lg transition font-medium flex items-center gap-1.5 border border-indigo-500 relative"
            >
              <span>History</span>
              <span className="ml-1 px-1.5 py-0.5 bg-amber-400 text-indigo-950 font-bold text-[10px] rounded-full">{chapterHistory.length}</span>
            </button>

            <button
              onClick={() => loadSample(SAMPLE_SCIENCE, "Science (Physics, Chemistry, Biology)")}
              className="hidden sm:flex px-2.5 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 rounded-lg transition font-medium items-center gap-1.5 border border-indigo-400"
            >
              Science Sample
            </button>

            <button
              onClick={() => loadSample(SAMPLE_SST, "Social Studies (History, Civics, Geography, Economics)")}
              className="hidden sm:flex px-2.5 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 rounded-lg transition font-medium items-center gap-1.5 border border-indigo-400"
            >
              SST Sample
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col lg:flex-row gap-6">
        <aside className="w-full lg:w-96 flex flex-col gap-5 no-print shrink-0">
          <ApiKeySetup hasStoredKey={hasStoredKey} onSave={saveKey} onClear={clearKey} />

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <h2 className="font-bold text-slate-800 text-base mb-3 flex items-center gap-2">1. Upload Chapter Document</h2>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-indigo-200 hover:border-indigo-500 bg-indigo-50/50 hover:bg-indigo-50 rounded-xl p-5 text-center cursor-pointer transition flex flex-col items-center justify-center gap-2"
            >
              <p className="text-xs font-semibold text-slate-700">Click to upload PDF / TXT</p>
              <p className="text-[10px] text-slate-500">PDF, TXT, or Markdown files</p>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".pdf,.txt,.md" className="hidden" />
            </div>

            {fileName && (
              <div className="mt-3 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center justify-between">
                <span className="font-medium truncate">{fileName}</span>
                <button
                  onClick={() => {
                    setFileName("");
                    setRawText("");
                  }}
                  className="text-slate-400 hover:text-red-500"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-semibold text-slate-600">Or Paste Chapter Text:</label>
                <span className="text-[10px] text-slate-400">{wordCount} words</span>
              </div>
              <textarea
                rows="5"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Paste textbook chapter text here..."
                className="w-full text-xs p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none font-mono"
              />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-4">
            <h2 className="font-bold text-slate-800 text-base">2. Generator Settings</h2>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Subject Domain</label>
              <select
                value={subjectDomain}
                onChange={(e) => setSubjectDomain(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-slate-50 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-medium"
              >
                <option value="Science (Physics, Chemistry, Biology)">Science (Physics, Chemistry, Biology)</option>
                <option value="Social Studies (History, Civics, Geography, Economics)">Social Studies (History, Civics, SST)</option>
                <option value="Mathematics & Logic">Mathematics & Logic</option>
                <option value="General Academic / Literature">General Academic / Literature</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Grade Level</label>
              <select
                value={gradeLevel}
                onChange={(e) => setGradeLevel(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-slate-50 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="Middle School (Grades 6-8)">Middle School (Grades 6-8)</option>
                <option value="High School (Grades 9-12)">High School (Grades 9-12)</option>
                <option value="College / Higher Ed">College / Higher Ed</option>
              </select>
            </div>

            <button
              onClick={generateStudyPack}
              disabled={isLoading}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold text-sm rounded-xl shadow-md transition flex items-center justify-center gap-2"
            >
              <span>{isLoading ? "Generating Pack..." : "Generate Complete Study Pack"}</span>
            </button>
          </div>
        </aside>

        <section className="flex-1 min-w-0 flex flex-col gap-4">
          {!currentStudyData && !isLoading && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 sm:p-12 text-center flex flex-col items-center justify-center min-h-[480px]">
              <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center text-3xl mb-4">📖</div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Turn Any PDF into Notes, Quizzes & Worksheets</h3>
              <p className="text-xs text-slate-500 max-w-md mb-6 leading-relaxed">
                Upload any textbook chapter to generate 20 MCQs, a 30-Question downloadable worksheet, and 10 revision flashcards.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <button
                  onClick={() => loadSample(SAMPLE_SCIENCE, "Science (Physics, Chemistry, Biology)")}
                  className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl font-medium text-xs transition"
                >
                  Load Science Sample
                </button>
                <button
                  onClick={() => loadSample(SAMPLE_SST, "Social Studies (History, Civics, Geography, Economics)")}
                  className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl font-medium text-xs transition"
                >
                  Load SST Sample
                </button>
              </div>
            </div>
          )}

          {isLoading && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center flex flex-col items-center justify-center min-h-[480px]">
              <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4" />
              <h3 className="text-lg font-bold text-slate-800 mb-2">{loadingMsg}</h3>
              <p className="text-xs text-slate-500 animate-pulse">Creating chapter notes, 20 MCQs, 30 worksheet questions, and 10 flashcards...</p>
            </div>
          )}

          {currentStudyData && !isLoading && (
            <div className="flex flex-col gap-4">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-indigo-600 uppercase bg-indigo-50 px-2 py-0.5 rounded">{subjectDomain.split(" ")[0]}</span>
                    <span className="text-[10px] font-bold text-emerald-700 uppercase bg-emerald-50 px-2 py-0.5 rounded">20 MCQs + 30-Q Worksheet + 10 Flashcards</span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-800 mt-1">{currentStudyData.chapterTitle || "Chapter Overview"}</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => window.print()} className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition">
                    Print Page
                  </button>
                  <button
                    onClick={() => handleCopy(currentStudyData.notesMarkdown, "Notes copied!")}
                    className="px-3 py-1.5 text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium rounded-lg transition"
                  >
                    Copy Notes
                  </button>
                </div>
              </div>

              <div className="bg-slate-200/60 p-1 rounded-xl flex space-x-1 no-print overflow-x-auto text-xs font-semibold">
                {[
                  { id: "tabNotes", label: "Chapter Notes" },
                  { id: "tabPractical", label: currentStudyData.practicalType || "Activities / Case Studies" },
                  { id: "tabMcqQuiz", label: "20 MCQ Quiz" },
                  { id: "tabWorksheet", label: "30-Q Worksheet" },
                  { id: "tabFlashcards", label: "10 Flashcards" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 py-2 px-3 rounded-lg transition whitespace-nowrap ${
                      activeTab === tab.id ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeTab === "tabNotes" && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 space-y-6">
                  <div className="border-b border-slate-100 pb-4">
                    <h2 className="text-xl font-bold text-slate-800">Chapter Revision Notes</h2>
                    <p className="text-xs text-slate-500 mt-1">Structured bullet points, key terms, and formulas.</p>
                  </div>
                  <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-4 text-xs text-indigo-950 leading-relaxed">
                    <span className="font-bold text-indigo-700 block mb-1 uppercase text-[10px]">Overview:</span>
                    <p>{currentStudyData.summary}</p>
                  </div>
                  <NotesRenderer markdown={currentStudyData.notesMarkdown} />
                </div>
              )}

              {activeTab === "tabPractical" && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 space-y-6">
                  <div className="border-b border-slate-100 pb-4">
                    <h2 className="text-xl font-bold text-slate-800">{currentStudyData.practicalType || "Practical Activities"}</h2>
                    <p className="text-xs text-slate-500 mt-1">Investigations, historical case studies, or mathematical theorems.</p>
                  </div>
                  <div className="space-y-6">
                    {(currentStudyData.practicalActivities || []).map((act, idx) => (
                      <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded">Activity {idx + 1}</span>
                          <h3 className="text-sm font-bold text-slate-800">{act.title}</h3>
                        </div>
                        <div>
                          <span className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Context / Materials:</span>
                          <div className="flex flex-wrap gap-1">
                            {(act.materialsOrContext || []).map((m, i) => (
                              <span key={i} className="px-2 py-0.5 bg-white border border-slate-200 text-slate-700 text-xs rounded shadow-2xs">
                                {m}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <span className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Procedure / Process:</span>
                          <p className="text-xs text-slate-700 bg-white p-3 rounded-lg border border-slate-200/60 leading-relaxed">{act.procedureOrBreakdown}</p>
                        </div>
                        <div className="p-3 bg-emerald-50/80 border border-emerald-200/60 rounded-lg text-xs text-emerald-900">
                          <span className="font-bold text-emerald-800">Key Finding / Impact:</span>
                          <p className="mt-0.5">{act.conclusionOrImpact}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "tabMcqQuiz" && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 space-y-6 no-print">
                  <div className="border-b border-slate-100 pb-4 flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-slate-800">Interactive MCQ Quiz (20 Questions)</h2>
                      <p className="text-xs text-slate-500 mt-1">Test your knowledge with immediate validation.</p>
                    </div>
                    <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-200 px-4 py-2 rounded-xl text-indigo-900">
                      <div>
                        <div className="text-[10px] font-bold uppercase text-indigo-600">Score Tracker</div>
                        <div className="text-xs font-bold">
                          {quizScore} / {(currentStudyData.mcqQuiz20 || []).length} Correct
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setUserQuizAnswers({});
                          setQuizScore(0);
                        }}
                        className="px-2 py-1 bg-white border border-indigo-200 text-indigo-700 text-[11px] font-semibold rounded"
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  <div className="space-y-6">
                    {(currentStudyData.mcqQuiz20 || []).map((item, idx) => {
                      const answeredOpt = userQuizAnswers[idx];
                      return (
                        <div key={idx} className="p-5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
                          <p className="text-xs font-semibold text-slate-800">
                            <span className="text-indigo-600 font-bold">Q{idx + 1}.</span> {item.question}
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {(item.options || []).map((opt, optIdx) => {
                              const isCorrect = optIdx === item.correctIndex;
                              const isChosen = answeredOpt === optIdx;
                              let btnStyle = "bg-white hover:bg-indigo-50 border-slate-200 text-slate-700";
                              if (answeredOpt !== undefined) {
                                if (isCorrect) btnStyle = "bg-emerald-100 border-emerald-500 text-emerald-900";
                                else if (isChosen) btnStyle = "bg-red-100 border-red-400 text-red-900";
                              }
                              return (
                                <button
                                  key={optIdx}
                                  disabled={answeredOpt !== undefined}
                                  onClick={() => handleQuizAnswer(idx, optIdx, item.correctIndex)}
                                  className={`w-full text-left p-3 rounded-xl border text-xs transition flex items-center gap-3 ${btnStyle}`}
                                >
                                  <span className="w-6 h-6 rounded-full border border-slate-300 flex items-center justify-center text-xs font-bold shrink-0">
                                    {String.fromCharCode(65 + optIdx)}
                                  </span>
                                  <span className="flex-1">{opt}</span>
                                </button>
                              );
                            })}
                          </div>
                          {answeredOpt !== undefined && (
                            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs rounded-xl">
                              <span className="font-bold block mb-0.5">Correct Answer: Option {String.fromCharCode(65 + item.correctIndex)}</span>
                              <p>{item.explanation}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeTab === "tabWorksheet" && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 space-y-8">
                  <div className="border-b border-slate-100 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
                    <div>
                      <h2 className="text-xl font-bold text-slate-800">30-Question Assessment Worksheet</h2>
                      <p className="text-xs text-slate-500 mt-1">4 structured test paper sections.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => window.print()} className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg shadow-sm">
                        Print / Save PDF
                      </button>
                      <button onClick={() => setIsExportModalOpen(true)} className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg">
                        Export Text
                      </button>
                      <button onClick={() => setShowAnswers(!showAnswers)} className="px-3 py-1.5 text-xs bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg font-medium">
                        {showAnswers ? "Hide Answer Key" : "Show Answer Key"}
                      </button>
                    </div>
                  </div>

                  <div id="printableWorksheetArea" className="space-y-8">
                    <div className="space-y-4">
                      <h3 className="text-base font-bold text-slate-800 pb-2 border-b border-slate-200">Section A: Short Answer Questions (10 Questions)</h3>
                      {(currentStudyData.downloadableWorksheet30?.sectionA_ShortAnswer || []).map((item) => (
                        <div key={item.qNo} className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
                          <p className="text-xs font-semibold text-slate-800">
                            <span className="text-emerald-600 font-bold">Q{item.qNo}.</span> {item.question}
                          </p>
                          {showAnswers && (
                            <div className="p-3 bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 rounded-lg">
                              <span className="font-bold block mb-0.5">Model Answer:</span>
                              <p>{item.answer}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-base font-bold text-slate-800 pb-2 border-b border-slate-200">Section B: Fill in the Blanks / Matching (5 Questions)</h3>
                      {(currentStudyData.downloadableWorksheet30?.sectionB_FillInBlanks_Or_Matching || []).map((item) => (
                        <div key={item.qNo} className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
                          <p className="text-xs font-semibold text-slate-800">
                            <span className="text-indigo-600 font-bold">Q{item.qNo}.</span> {item.question}
                          </p>
                          {showAnswers && (
                            <div className="p-3 bg-indigo-50 border border-indigo-200 text-xs text-indigo-900 rounded-lg">
                              <span className="font-bold block mb-0.5">Answer Key:</span>
                              <p>{item.answer}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-base font-bold text-slate-800 pb-2 border-b border-slate-200">Section C: Problem Solving & Data Analysis (8 Questions)</h3>
                      {(currentStudyData.downloadableWorksheet30?.sectionC_Numericals_CaseAnalysis || []).map((item) => (
                        <div key={item.qNo} className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
                          <p className="text-xs font-semibold text-slate-800">
                            <span className="text-sky-600 font-bold">Q{item.qNo}.</span> {item.question}
                          </p>
                          {showAnswers && (
                            <div className="p-3 bg-sky-50 border border-sky-200 text-xs text-sky-900 rounded-lg font-mono">
                              <span className="font-bold font-sans block mb-0.5">Step-by-Step Solution:</span>
                              <p className="whitespace-pre-wrap">{item.solution}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-base font-bold text-slate-800 pb-2 border-b border-slate-200">Section D: High-Order Thinking (HOTS) & Reasoning (7 Questions)</h3>
                      {(currentStudyData.downloadableWorksheet30?.sectionD_Conceptual_HOTS || []).map((item) => (
                        <div key={item.qNo} className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
                          <p className="text-xs font-semibold text-slate-800">
                            <span className="text-purple-600 font-bold">Q{item.qNo}.</span> {item.question}
                          </p>
                          {showAnswers && (
                            <div className="p-3 bg-purple-50 border border-purple-200 text-xs text-purple-900 rounded-lg">
                              <span className="font-bold block mb-0.5">Explanation:</span>
                              <p>{item.answer}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "tabFlashcards" && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 space-y-6 no-print">
                  <div className="border-b border-slate-100 pb-4 flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-slate-800">Revision Flashcards (10 Cards Deck)</h2>
                      <p className="text-xs text-slate-500 mt-1">Click card to flip and test memory recall.</p>
                    </div>
                    <div className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-full">
                      Card {currentCardIdx + 1} of {(currentStudyData.flashcards10 || []).length}
                    </div>
                  </div>

                  <div className="max-w-lg mx-auto">
                    <div onClick={() => setIsCardFlipped(!isCardFlipped)} className="perspective-1000 w-full h-64 cursor-pointer">
                      <div
                        className={`transform-style-3d transition-transform duration-500 relative w-full h-full rounded-2xl border-2 border-indigo-200 bg-indigo-50/40 p-6 flex flex-col justify-between items-center text-center shadow-sm ${
                          isCardFlipped ? "rotate-y-180" : ""
                        }`}
                      >
                        <div className="backface-hidden absolute inset-0 p-6 flex flex-col justify-between items-center bg-white rounded-2xl">
                          <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest bg-indigo-50 px-2.5 py-1 rounded-full">Question / Term</span>
                          <p className="text-base font-semibold text-slate-800 my-auto px-2">{(currentStudyData.flashcards10 || [])[currentCardIdx]?.front}</p>
                          <span className="text-[11px] text-slate-400">Click to flip card</span>
                        </div>
                        <div className="backface-hidden rotate-y-180 absolute inset-0 p-6 flex flex-col justify-between items-center bg-indigo-700 text-white rounded-2xl">
                          <span className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest bg-indigo-800 px-2.5 py-1 rounded-full">Answer / Explanation</span>
                          <p className="text-base font-medium my-auto px-2 leading-relaxed">{(currentStudyData.flashcards10 || [])[currentCardIdx]?.back}</p>
                          <span className="text-[11px] text-indigo-300">Click to flip back</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-6">
                      <button
                        onClick={() => {
                          const len = (currentStudyData.flashcards10 || []).length;
                          setCurrentCardIdx((currentCardIdx - 1 + len) % len);
                          setIsCardFlipped(false);
                        }}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl"
                      >
                        Previous
                      </button>
                      <button onClick={handleShuffleDeck} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs rounded-xl">
                        Shuffle
                      </button>
                      <button
                        onClick={() => {
                          const len = (currentStudyData.flashcards10 || []).length;
                          setCurrentCardIdx((currentCardIdx + 1) % len);
                          setIsCardFlipped(false);
                        }}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      <footer className="bg-white border-t border-slate-200 py-4 px-6 text-center text-xs text-slate-400 no-print mt-auto">
        <p>StudyGenius AI • Refactored React Application</p>
      </footer>
    </div>
  );
}
