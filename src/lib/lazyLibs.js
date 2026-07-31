// Each of these libraries is only pulled into the bundle when actually
// needed - pdfjs-dist is fairly large, and most sessions may only ever
// paste text rather than upload a PDF. Vite/webpack will emit these as
// separate chunks automatically because of the dynamic import() syntax.
//
// Each loader caches its promise so calling it twice doesn't trigger a
// second network request/parse.

let pdfjsPromise;
export function getPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then(async (pdfjsLib) => {
      // ?url tells Vite to give us the final built asset URL for the worker
      // file rather than trying to inline/parse it as JS.
      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.js?url")).default;
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjsLib;
    });
  }
  return pdfjsPromise;
}

let markedPromise;
export function getMarked() {
  if (!markedPromise) {
    markedPromise = import("marked").then((mod) => mod.marked ?? mod.default ?? mod);
  }
  return markedPromise;
}

let dompurifyPromise;
export function getDompurify() {
  if (!dompurifyPromise) {
    dompurifyPromise = import("dompurify").then((mod) => mod.default ?? mod);
  }
  return dompurifyPromise;
}

let katexAutoRenderPromise;
export function getKatexAutoRender() {
  if (!katexAutoRenderPromise) {
    katexAutoRenderPromise = Promise.all([
      import("katex/dist/katex.min.css"),
      import("katex/contrib/auto-render"),
    ]).then(([, mod]) => mod.default ?? mod);
  }
  return katexAutoRenderPromise;
}
