import { useCallback, useRef, useState } from "react";

export function useToast() {
  const [toast, setToast] = useState(null);
  const timeoutRef = useRef(null);

  const showToast = useCallback((message, type = "info") => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setToast({ message, type });
    timeoutRef.current = setTimeout(() => setToast(null), 3500);
  }, []);

  return { toast, showToast };
}
