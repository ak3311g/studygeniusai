import { useEffect, useRef, useState } from "react";
import { getMarked, getDompurify, getKatexAutoRender } from "../lib/lazyLibs";

export function NotesRenderer({ markdown }) {
  const [html, setHtml] = useState("");
  const containerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      if (!markdown) {
        setHtml("");
        return;
      }
      const [marked, DOMPurify] = await Promise.all([getMarked(), getDompurify()]);
      if (cancelled) return;
      const rawHtml = marked.parse(markdown);
      setHtml(DOMPurify.sanitize(rawHtml));
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [markdown]);

  // After the sanitized HTML is in the DOM, run KaTeX over any $...$ / $$...$$
  useEffect(() => {
    if (!html || !containerRef.current) return;
    let cancelled = false;

    getKatexAutoRender().then((renderMathInElement) => {
      if (cancelled || !containerRef.current) return;
      renderMathInElement(containerRef.current, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
        ],
        throwOnError: false,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [html]);

  return (
    <div
      ref={containerRef}
      className="prose prose-slate max-w-none prose-sm leading-relaxed font-sans text-xs"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
