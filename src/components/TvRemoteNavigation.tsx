import { useEffect, useRef } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";

const FOCUSABLE_SELECTOR = [
  "a[href]:not([tabindex='-1'])",
  "button:not([disabled]):not([tabindex='-1'])",
  "input:not([disabled]):not([tabindex='-1'])",
  "select:not([disabled]):not([tabindex='-1'])",
  "textarea:not([disabled]):not([tabindex='-1'])",
  '[tabindex]:not([tabindex="-1"])',
  ".focusable:not([tabindex='-1'])",
].join(",");

type Dir = "up" | "down" | "left" | "right";

function isVisible(el: HTMLElement): boolean {
  if (el.offsetParent === null && getComputedStyle(el).position !== "fixed") return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  return true;
}

function getFocusables(): HTMLElement[] {
  const fsContainer = document.querySelector('[data-fullscreen="true"]');
  const root = fsContainer || document;
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return nodes.filter(isVisible);
}

function center(rect: DOMRect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function findNext(current: HTMLElement, dir: Dir): HTMLElement | null {
  const from = current.getBoundingClientRect();
  const fc = center(from);
  let best: HTMLElement | null = null;
  let bestScore = Infinity;

  const currentScrollContainer = current.closest(".overflow-x-auto") || current.closest("section");

  for (const el of getFocusables()) {
    if (el === current) continue;
    const r = el.getBoundingClientRect();
    const c = center(r);
    
    const overlapX = Math.max(0, Math.min(from.right, r.right) - Math.max(from.left, r.left));
    const overlapY = Math.max(0, Math.min(from.bottom, r.bottom) - Math.max(from.top, r.top));

    const actualDx = c.x - fc.x;
    const actualDy = c.y - fc.y;

    let primary: number;
    let cross: number;
    switch (dir) {
      case "up":
        if (actualDy >= -2) continue;
        primary = -actualDy;
        cross = Math.abs(actualDx);
        if (overlapX === 0 && cross > primary * 2.5) continue;
        if (overlapX > 0) cross = 0;
        break;
      case "down":
        if (actualDy <= 2) continue;
        primary = actualDy;
        cross = Math.abs(actualDx);
        if (overlapX === 0 && cross > primary * 2.5) continue;
        if (overlapX > 0) cross = 0;
        break;
      case "left":
        if (actualDx >= -2) continue;
        primary = -actualDx;
        cross = Math.abs(actualDy);
        if (overlapY === 0 && cross > primary * 2.5) continue;
        if (overlapY > 0) cross = 0;
        break;
      case "right":
        if (actualDx <= 2) continue;
        primary = actualDx;
        cross = Math.abs(actualDy);
        if (overlapY === 0 && cross > primary * 2.5) continue;
        if (overlapY > 0) cross = 0;
        break;
    }

    let score = primary + cross * 2;

    const sameScrollContainer = currentScrollContainer && el.closest(".overflow-x-auto") === currentScrollContainer;
    const sameSection = current.closest("section") && el.closest("section") === current.closest("section");
    const sameAside = current.closest("aside") && el.closest("aside") === current.closest("aside");
    const sameMain = current.closest("main") && el.closest("main") === current.closest("main");

    if (sameScrollContainer) {
      score -= 30000;
    } else if (sameSection) {
      score -= 20000;
    } else if (sameAside || sameMain) {
      score -= 10000;
    }

    // Ao ir para a esquerda dentro do main, não pular para a barra lateral se ainda houver itens no conteúdo
    if (dir === "left" && current.closest("main") && el.closest("aside")) {
      score += 50000;
    }

    if ((dir === "up" || dir === "down") && current.closest("aside") && !el.closest("aside")) {
      score += 50000;
    }

    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

export function TvRemoteNavigation() {
  const router = useRouter();
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;

  const routerRef = useRef(router);
  routerRef.current = router;

  // Autofocar no primeiro elemento dentro de <main> sempre que a rota mudar
  useEffect(() => {
    const timer = setTimeout(() => {
      const mainEl = document.querySelector("main");
      if (mainEl) {
        const selectionsEl = mainEl.querySelector(".selections-container");
        let firstFocusable: HTMLElement | null = null;
        
        if (selectionsEl) {
          const nodes = Array.from(selectionsEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
          firstFocusable = nodes.filter(isVisible)[0];
        }
        
        if (!firstFocusable) {
          const nodes = Array.from(mainEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
          firstFocusable = nodes.filter(isVisible)[0];
        }
        
        if (firstFocusable) {
          firstFocusable.focus();
          firstFocusable.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
        }
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isTextInput =
        tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable === true;

      if (
        key === "BrowserBack" ||
        key === "GoBack" ||
        key === "Escape" ||
        (e as KeyboardEvent & { keyCode?: number }).keyCode === 10009
      ) {
        if (document.querySelector('[data-fullscreen="true"]')) {
          return;
        }

        // Se estiver na tela de TV ao vivo (/live), foca primeiro nas seleções/canais antes de sair
        if (window.location.pathname.startsWith('/live')) {
          const selectionsEl = document.querySelector(".selections-container");
          if (selectionsEl) {
            const firstCat = selectionsEl.querySelector<HTMLElement>(".focusable");
            if (firstCat && document.activeElement !== firstCat && !selectionsEl.contains(document.activeElement)) {
              e.preventDefault();
              firstCat.focus();
              firstCat.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
              return;
            }
          }
        }
        
        if (window.location.pathname === '/' || window.location.pathname === '') {
          return; 
        }

        e.preventDefault();

        const now = Date.now();
        // @ts-ignore
        if (window.__lastBackPress && now - window.__lastBackPress < 400) {
          return;
        }
        // @ts-ignore
        window.__lastBackPress = now;

        routerRef.current.history.back();
        return;
      }

      if (key === "Enter" || key === " ") {
        const active = document.activeElement as HTMLElement | null;
        if (active && active.tagName !== "VIDEO" && active.tagName !== "BODY") {
          if (isTextInput) {
            if (key === "Enter") {
              active.focus();
              active.click();
            }
            return;
          }
        }
      }

      const dirMap: Record<string, Dir> = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
      };
      const dir = dirMap[key];
      if (!dir) return;

      if (isTextInput && (dir === "left" || dir === "right")) return;

      const active =
        document.activeElement instanceof HTMLElement &&
        document.activeElement !== document.body
          ? document.activeElement
          : null;

      if (!active) {
        const first = getFocusables()[0];
        if (first) {
          e.preventDefault();
          first.focus();
        }
        return;
      }

      const next = findNext(active, dir);
      if (next) {
        e.preventDefault();
        next.focus();
        next.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);

  return null;
}
