export function getWorksheetPlainText(currentStudyData) {
  if (!currentStudyData?.downloadableWorksheet30) return "";
  const title = currentStudyData.chapterTitle || "Chapter";
  const ws = currentStudyData.downloadableWorksheet30;

  const lines = [];
  lines.push("=======================================================");
  lines.push(`${title.toUpperCase()} - ASSESSMENT WORKSHEET (30 QUESTIONS)`);
  lines.push("=======================================================\n");

  lines.push("SECTION A: SHORT ANSWER QUESTIONS (10 QUESTIONS)\n-------------------------------------------------------");
  (ws.sectionA_ShortAnswer || []).forEach((item) => {
    lines.push(`Q${item.qNo}. ${item.question}\nAnswer: ${item.answer}\n`);
  });

  lines.push("\nSECTION B: FILL IN THE BLANKS / MATCHING (5 QUESTIONS)\n-------------------------------------------------------");
  (ws.sectionB_FillInBlanks_Or_Matching || []).forEach((item) => {
    lines.push(`Q${item.qNo}. ${item.question}\nAnswer: ${item.answer}\n`);
  });

  lines.push("\nSECTION C: PROBLEM SOLVING & CASE ANALYSIS (8 QUESTIONS)\n-------------------------------------------------------");
  (ws.sectionC_Numericals_CaseAnalysis || []).forEach((item) => {
    lines.push(`Q${item.qNo}. ${item.question}\nSolution: ${item.solution}\n`);
  });

  lines.push("\nSECTION D: HIGH-ORDER THINKING (HOTS) (7 QUESTIONS)\n-------------------------------------------------------");
  (ws.sectionD_Conceptual_HOTS || []).forEach((item) => {
    lines.push(`Q${item.qNo}. ${item.question}\nExplanation: ${item.answer}\n`);
  });

  return lines.join("\n");
}

/**
 * Returns a NEW shuffled array instead of mutating in place.
 * The original code did `deck.sort(() => Math.random() - 0.5)` directly on
 * currentStudyData.flashcards10, which (a) mutates state outside of
 * setState, breaking React's change detection, and (b) is a biased shuffle
 * (Array.sort with a random comparator does not produce a uniform
 * permutation). This uses a proper Fisher-Yates shuffle on a copy.
 */
export function shuffleDeck(deck) {
  const copy = [...deck];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export async function copyToClipboard(text) {
  await navigator.clipboard.writeText(text);
}
