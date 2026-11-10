import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export const isTvDevice = (): boolean => {
  if (typeof window === "undefined") return false;

  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("device") === "tv") return true;
    if (params.get("device") === "mobile") return false;
    const cached = localStorage.getItem("device_type");
    if (cached === "tv") return true;
    if (cached === "mobile") return false;
  } catch {}

  const ua = (navigator.userAgent || "").toLowerCase();
  if (
    ua.includes("smart-tv") ||
    ua.includes("firetv") ||
    ua.includes("fire tv") ||
    ua.includes("amazon") ||
    ua.includes("smarttv") ||
    ua.includes("androidtv") ||
    ua.includes("android tv") ||
    ua.includes("googletv") ||
    ua.includes("google tv") ||
    ua.includes("hbbtv") ||
    ua.includes("nettv") ||
    ua.includes("appletv") ||
    ua.includes("roku") ||
    ua.includes("leanback") ||
    ua.includes("large screen") ||
    ua.includes("aftm") ||
    ua.includes("aftb") ||
    ua.includes("afts") ||
    ua.includes("aftn") ||
    / aft[a-z0-9]+/i.test(ua)
  ) {
    return true;
  }

  // TV Boxes / Smart Displays without touch and wide resolution
  if (typeof navigator !== "undefined" && navigator.maxTouchPoints === 0 && window.innerWidth >= 768) {
    return true;
  }

  return false;
};

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    if (isTvDevice()) {
      setIsMobile(false);
      return;
    }

    try {
      const cachedDevice = localStorage.getItem("device_type");
      if (cachedDevice === "tv") {
        setIsMobile(false);
        return;
      } else if (cachedDevice === "mobile") {
        setIsMobile(true);
        return;
      }
    } catch {}

    const checkMobile = () => {
      if (isTvDevice()) return false;
      if (window.innerWidth >= 960) return false;
      return window.innerWidth < MOBILE_BREAKPOINT;
    };

    const mql = window.matchMedia("(max-width: " + (MOBILE_BREAKPOINT - 1) + "px)");
    const onChange = () => {
      setIsMobile(checkMobile());
    };
    mql.addEventListener("change", onChange);
    setIsMobile(checkMobile());
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
