import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = join(fileURLToPath(import.meta.url), "..");
const serverPath = join(__dirname, "dist", "server", "server.js");
const clientDir = join(__dirname, "dist", "client");
const assetsDir = join(clientDir, "assets");

if (existsSync(serverPath)) {
  let content = readFileSync(serverPath, "utf8");
  const oldBaseDir = `let baseDir = join(__filename$1, "..", "..")`;
  const newBaseDir = `let baseDir = join(__filename$1, "..", "..", "..")`;

  if (content.includes(oldBaseDir)) {
    content = content.replace(oldBaseDir, newBaseDir);
    writeFileSync(serverPath, content, "utf8");
    console.log("[postbuild] Fixed Nitro SSR baseDir path");
  } else {
    console.log("[postbuild] baseDir pattern not found, may already be fixed");
  }
}

// Generate dist/client/index.html for Capacitor local mobile build entry point
try {
  if (existsSync(assetsDir)) {
    const files = readdirSync(assetsDir);
    const cssFile = files.find(f => f.startsWith("styles-") && f.endsWith(".css")) || "";
    const mainJsFile = files.find(f => f.startsWith("index-") && f.endsWith(".js") && readFileSync(join(assetsDir, f), "utf8").includes("hydrateRoot")) 
                    || files.find(f => f.startsWith("index-") && f.endsWith(".js")) || "";

    const htmlContent = `<!DOCTYPE html>
<html lang="pt-BR" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>FLOW TV</title>
    <link rel="manifest" href="./manifest.json" />
    <link rel="icon" type="image/png" href="./favicon.png" />
    ${cssFile ? `<link rel="stylesheet" href="./assets/${cssFile}" />` : ""}
    <script>
      window.$_TSR = {
        buffer: [],
        initialized: true,
        router: {
          matches: [],
          manifest: undefined,
          dehydratedData: undefined,
          lastMatchId: undefined
        },
        h: function() {}
      };
    </script>
  </head>
  <body class="bg-background text-foreground antialiased overflow-x-hidden">
    <div id="root"></div>
    ${mainJsFile ? `<script type="module" src="./assets/${mainJsFile}"></script>` : ""}
  </body>
</html>`;

    writeFileSync(join(clientDir, "index.html"), htmlContent, "utf8");
    console.log(`[postbuild] Successfully generated dist/client/index.html for Capacitor (JS: ${mainJsFile}, CSS: ${cssFile})`);
  }
} catch (err) {
  console.error("[postbuild] Failed to generate Capacitor index.html:", err);
}

// Native Node.js CSS compatibility for Android TV WebViews (color-mix, oklch fallback)
const colorMap = {
  'var(--foreground)': [255, 255, 255],
  'var(--sidebar-foreground)': [255, 255, 255],
  'var(--sidebar-accent-foreground)': [255, 255, 255],
  'var(--card-foreground)': [255, 255, 255],
  'var(--popover-foreground)': [255, 255, 255],
  'var(--secondary-foreground)': [255, 255, 255],
  'var(--destructive-foreground)': [255, 255, 255],
  'var(--muted-foreground)': [148, 163, 184],
  'var(--background)': [7, 12, 30],
  'var(--card)': [18, 26, 51],
  'var(--sidebar)': [9, 14, 35],
  'var(--sidebar-accent)': [23, 34, 66],
  'var(--sidebar-border)': [32, 45, 79],
  'var(--primary)': [0, 229, 255],
  'var(--primary-foreground)': [4, 8, 24],
  'var(--secondary)': [26, 36, 61],
  'var(--muted)': [26, 36, 61],
  'var(--border)': [36, 48, 79],
  'var(--input)': [36, 48, 79],
  'var(--ring)': [0, 229, 255],
  'var(--color-white)': [255, 255, 255],
  'var(--color-black)': [0, 0, 0],
  'var(--color-cyan-500)': [6, 182, 212],
  'var(--color-cyan-400)': [34, 211, 238],
  'var(--color-cyan-300)': [103, 232, 249],
  'var(--color-blue-500)': [59, 130, 246],
  'var(--color-purple-500)': [168, 85, 247],
  'var(--color-green-500)': [34, 197, 94],
  'var(--color-red-500)': [239, 68, 68],
  'var(--color-red-950)': [69, 10, 10],
  'var(--color-emerald-500)': [16, 185, 129],
  'var(--color-emerald-950)': [2, 44, 34],
  'var(--color-orange-500)': [249, 115, 22],
  'var(--color-yellow-500)': [234, 179, 8],
  'var(--color-amber-500)': [245, 158, 11],
  'var(--destructive)': [239, 68, 68]
};

const oklchFallbacks = [
  [/--color-red-100:oklch\([^)]+\)/g, '--color-red-100:#fee2e2'],
  [/--color-red-400:oklch\([^)]+\)/g, '--color-red-400:#f87171'],
  [/--color-red-500:oklch\([^)]+\)/g, '--color-red-500:#ef4444'],
  [/--color-red-600:oklch\([^)]+\)/g, '--color-red-600:#dc2626'],
  [/--color-red-700:oklch\([^)]+\)/g, '--color-red-700:#b91c1c'],
  [/--color-red-900:oklch\([^)]+\)/g, '--color-red-900:#7f1d1d'],
  [/--color-red-950:oklch\([^)]+\)/g, '--color-red-950:#450a0a'],
  [/--color-orange-500:oklch\([^)]+\)/g, '--color-orange-500:#f97316'],
  [/--color-amber-500:oklch\([^)]+\)/g, '--color-amber-500:#f59e0b'],
  [/--color-amber-950:oklch\([^)]+\)/g, '--color-amber-950:#451a03'],
  [/--color-yellow-400:oklch\([^)]+\)/g, '--color-yellow-400:#facc15'],
  [/--color-yellow-500:oklch\([^)]+\)/g, '--color-yellow-500:#eab308'],
  [/--color-yellow-950:oklch\([^)]+\)/g, '--color-yellow-950:#422006'],
  [/--color-green-200:oklch\([^)]+\)/g, '--color-green-200:#bbf7d0'],
  [/--color-green-300:oklch\([^)]+\)/g, '--color-green-300:#86efac'],
  [/--color-green-400:oklch\([^)]+\)/g, '--color-green-400:#4ade80'],
  [/--color-green-500:oklch\([^)]+\)/g, '--color-green-500:#22c55e'],
  [/--color-emerald-300:oklch\([^)]+\)/g, '--color-emerald-300:#6ee7b7'],
  [/--color-emerald-400:oklch\([^)]+\)/g, '--color-emerald-400:#34d399'],
  [/--color-emerald-500:oklch\([^)]+\)/g, '--color-emerald-500:#10b981'],
  [/--color-cyan-200:oklch\([^)]+\)/g, '--color-cyan-200:#a5f3fc'],
  [/--color-cyan-300:oklch\([^)]+\)/g, '--color-cyan-300:#67e8f9'],
  [/--color-cyan-400:oklch\([^)]+\)/g, '--color-cyan-400:#22d3ee'],
  [/--color-cyan-500:oklch\([^)]+\)/g, '--color-cyan-500:#06b6d4'],
  [/--color-cyan-900:oklch\([^)]+\)/g, '--color-cyan-900:#164e63'],
  [/--color-cyan-950:oklch\([^)]+\)/g, '--color-cyan-950:#083344'],
  [/--color-sky-300:oklch\([^)]+\)/g, '--color-sky-300:#7dd3fc'],
  [/--color-sky-400:oklch\([^)]+\)/g, '--color-sky-400:#38bdf8'],
  [/--color-sky-500:oklch\([^)]+\)/g, '--color-sky-500:#0ea5e9'],
  [/--color-blue-500:oklch\([^)]+\)/g, '--color-blue-500:#3b82f6'],
  [/--color-purple-400:oklch\([^)]+\)/g, '--color-purple-400:#c084fc'],
  [/--color-purple-500:oklch\([^)]+\)/g, '--color-purple-500:#a855f7'],
  [/--color-purple-600:oklch\([^)]+\)/g, '--color-purple-600:#9333ea'],
  [/--color-purple-950:oklch\([^)]+\)/g, '--color-purple-950:#3b0764'],
  [/--color-slate-100:oklch\([^)]+\)/g, '--color-slate-100:#f1f5f9'],
  [/--color-slate-200:oklch\([^)]+\)/g, '--color-slate-200:#e2e8f0'],
  [/--color-slate-300:oklch\([^)]+\)/g, '--color-slate-300:#cbd5e1'],
  [/--color-slate-400:oklch\([^)]+\)/g, '--color-slate-400:#94a3b8'],
  [/--color-slate-500:oklch\([^)]+\)/g, '--color-slate-500:#64748b'],
  [/--color-slate-700:oklch\([^)]+\)/g, '--color-slate-700:#334155'],
  [/--color-slate-800:oklch\([^)]+\)/g, '--color-slate-800:#1e293b'],
  [/--color-slate-900:oklch\([^)]+\)/g, '--color-slate-900:#0f172a'],
  [/--color-slate-950:oklch\([^)]+\)/g, '--color-slate-950:#020617'],
  [/oklch\([^)]+\)/g, '#00E5FF']
];

function replaceColorMix(match, varName, pctStr) {
  const pct = (parseFloat(pctStr) || 100) / 100.0;
  varName = varName.trim();
  let rgb = colorMap[varName];
  if (!rgb) {
    if (varName.includes('white') || varName.includes('foreground')) rgb = [255, 255, 255];
    else if (varName.includes('black')) rgb = [0, 0, 0];
    else if (varName.includes('background')) rgb = [7, 12, 30];
    else if (varName.includes('primary')) rgb = [0, 229, 255];
    else rgb = [18, 26, 51];
  }
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${pct.toFixed(3)})`;
}

function processCss(content) {
  // color-mix(in oklab, <color> <pct>%, transparent)
  content = content.replace(/color-mix\(in oklab,\s*([^,]+?)\s+(\d+(?:\.\d+)?)%,\s*transparent\)/g, replaceColorMix);
  // color-mix(in oklab, transparent, <color> <pct>%)
  content = content.replace(/color-mix\(in oklab,\s*transparent,\s*([^,]+?)\s+(\d+(?:\.\d+)?)%\)/g, replaceColorMix);
  // oklch fallbacks
  for (const [pattern, replacement] of oklchFallbacks) {
    content = content.replace(pattern, replacement);
  }
  return content;
}

try {
  const cssDirs = [
    join(__dirname, "dist", "client", "assets"),
    join(__dirname, "android", "app", "src", "main", "assets", "public", "assets")
  ];
  for (const dir of cssDirs) {
    if (existsSync(dir)) {
      const files = readdirSync(dir).filter(f => f.startsWith("styles-") && f.endsWith(".css"));
      for (const f of files) {
        const filePath = join(dir, f);
        const orig = readFileSync(filePath, "utf8");
        const transformed = processCss(orig);
        writeFileSync(filePath, transformed, "utf8");
        console.log(`[postbuild] CSS compatibility applied to: ${filePath}`);
      }
    }
  }
} catch (e) {
  console.error("[postbuild] Error applying CSS compatibility:", e);
}
