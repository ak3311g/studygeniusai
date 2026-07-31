// Centralizes all Gemini API concerns: endpoint construction, retry policy,
// and response parsing. Keeping this out of the component means it can be
// unit-tested without rendering React at all.

const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000];

/**
 * Returns true if a failed HTTP response is worth retrying.
 * 4xx errors (bad request, bad API key, invalid model) will never succeed
 * on retry - only network failures and 5xx/429 should be retried.
 */
function isRetryableStatus(status) {
  if (status === 429) return true; // rate limited
  return status >= 500;
}

export async function callGeminiAPI(payload, apiKey, { signal } = {}) {
  const key = (apiKey || "").trim();
  if (!key) {
    throw new Error("Please enter your Gemini API Key in the settings field.");
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${encodeURIComponent(key)}`;

  let lastError;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal,
      });

      if (!response.ok) {
        let detail = "";
        try {
          const errBody = await response.json();
          detail = errBody?.error?.message ? `: ${errBody.error.message}` : "";
        } catch {
          /* response body wasn't JSON, ignore */
        }
        const err = new Error(`API Error HTTP ${response.status}${detail}`);
        err.status = response.status;
        throw err;
      }

      return await response.json();
    } catch (err) {
      if (err?.name === "AbortError") throw err; // never retry a deliberate cancel
      lastError = err;

      const retryable = err.status ? isRetryableStatus(err.status) : true; // network errors -> retry
      const isLastAttempt = attempt === RETRY_DELAYS_MS.length;

      if (!retryable || isLastAttempt) throw err;

      await new Promise((res) => setTimeout(res, RETRY_DELAYS_MS[attempt]));
    }
  }

  throw lastError;
}

export function extractJsonText(responseData) {
  const rawJsonStr = responseData?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawJsonStr) throw new Error("Empty response received from AI engine.");
  return rawJsonStr;
}

/**
 * Light structural validation so a malformed AI response fails with a clear
 * error message instead of throwing deep inside a render (e.g. "cannot read
 * property 'map' of undefined").
 */
export function validateStudyData(data) {
  const problems = [];
  if (!data || typeof data !== "object") return ["Response was not a JSON object."];

  if (!Array.isArray(data.mcqQuiz20)) problems.push("mcqQuiz20 is missing or not an array");
  if (!Array.isArray(data.flashcards10)) problems.push("flashcards10 is missing or not an array");
  if (!data.downloadableWorksheet30 || typeof data.downloadableWorksheet30 !== "object") {
    problems.push("downloadableWorksheet30 is missing");
  }
  if (!Array.isArray(data.practicalActivities)) problems.push("practicalActivities is missing or not an array");

  return problems;
}

export function buildStudyPackPayload({ textContent, subjectDomain, gradeLevel }) {
  const systemPrompt = `You are an expert curriculum developer and scientific textbook creator.

Subject Domain: ${subjectDomain}.
Grade Level: ${gradeLevel}.

Analyze the textbook excerpt and return JSON strictly structured as follows:

chapterTitle: Concise title
summary: 3-4 sentence overview
notesMarkdown: Comprehensive revision notes formatted in Markdown with headers (##, ###), bullet points, bold key terms, and LaTeX math formulas ($ and $$) if applicable.
practicalType: "Science Experiments" OR "Case Studies & Historical Analysis" OR "Worked Models"
practicalActivities: Array of 3-4 activities with fields: title, materialsOrContext (array of strings), procedureOrBreakdown, conclusionOrImpact
mcqQuiz20: Array of EXACTLY 20 MCQs, each with: id (1-20), question, options (array of 4 strings), correctIndex (0-3), explanation
downloadableWorksheet30: An assessment worksheet with EXACTLY 30 total questions across 4 sections:
  sectionA_ShortAnswer: EXACTLY 10 (qNo 1-10, question, answer)
  sectionB_FillInBlanks_Or_Matching: EXACTLY 5 (qNo 11-15, question, answer)
  sectionC_Numericals_CaseAnalysis: EXACTLY 8 (qNo 16-23, question, solution)
  sectionD_Conceptual_HOTS: EXACTLY 7 (qNo 24-30, question, answer)
flashcards10: Array of EXACTLY 10 flashcards, each with: id (1-10), front, back

STRICT RULE: Include EXACTLY 20 MCQs, EXACTLY 30 worksheet questions (10+5+8+7=30), and EXACTLY 10 flashcards. Do not omit any items!`;

  return {
    contents: [{ parts: [{ text: `TEXTBOOK CONTENT:\n${textContent}` }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: { responseMimeType: "application/json" },
  };
}
