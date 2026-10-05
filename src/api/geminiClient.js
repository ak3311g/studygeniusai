import { GoogleGenAI } from "@google/genai";

export const DEFAULT_MODEL = "gemini-3.8-flash";

const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000];

function isRetryableStatus(status) {
  if (status === 429) return true;
  return status >= 500;
}

function getStatusFromError(err) {
  return err?.status ?? err?.response?.status ?? err?.error?.code;
}

export async function generateStudyPackJson({
  textContent,
  subjectDomain,
  gradeLevel,
  apiKey,
  model = DEFAULT_MODEL,
  signal,
}) {
  const key = (apiKey || "").trim();
  if (!key) {
    throw new Error("Please enter your Gemini API Key in the settings field.");
  }

  const ai = new GoogleGenAI({ apiKey: key });
  const systemInstruction = buildSystemInstruction({ subjectDomain, gradeLevel });

  let lastError;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: `TEXTBOOK CONTENT:\n${textContent}`,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          abortSignal: signal,
        },
      });

      const text = response?.text;
      if (!text) throw new Error("Empty response received from AI engine.");
      return JSON.parse(text);
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      lastError = err;

      const status = getStatusFromError(err);
      const retryable = status ? isRetryableStatus(status) : true;
      const isLastAttempt = attempt === RETRY_DELAYS_MS.length;

      if (!retryable || isLastAttempt) {
        if (status === 404) {
          throw new Error(
            `Model "${model}" was not found or doesn't support generateContent. Double check the model id.`
          );
        }
        throw err;
      }

      await new Promise((res) => setTimeout(res, RETRY_DELAYS_MS[attempt]));
    }
  }

  throw lastError;
}

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

function buildSystemInstruction({ subjectDomain, gradeLevel }) {
  return `You are an expert curriculum developer and scientific textbook creator.

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
}