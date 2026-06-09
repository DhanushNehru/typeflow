// SVG Renderer for ScribeSVG
// Generates responsive, standard-compliant SVGs with CSS-only typing animations.

const fontCache = new Map<string, string>();

export interface RenderOptions {
  lines: string[];
  width: number;
  height: number;
  font: string;
  size: number;
  weight: number;
  letterSpacing: number;
  color: string;
  gradient?: string[];
  gradientAngle: number;
  background: string;
  speed: number; // ms per char
  deleteSpeed: number; // ms per char
  pause: number; // ms pause at end of line
  cursor: 'pipe' | 'block' | 'underscore' | 'none';
  cursorColor: string;
  cursorGlow: number;
  textGlow: number;
  hCenter: boolean;
  vCenter: boolean;
  loop: boolean;
  layout: 'raw' | 'terminal' | 'card';
  theme?: string;
  attribution?: boolean;
}

export const THEMES: Record<string, Partial<RenderOptions>> = {
  dracula: {
    color: 'f8f8f2',
    gradient: ['#ff79c6', '#bd93f9'],
    background: '#282a36',
    cursorColor: '#50fa7b',
    font: 'Fira Code'
  },
  cyberpunk: {
    color: '#fcee0a',
    gradient: ['#00f0ff', '#ff007f'],
    background: '#030313',
    cursorColor: '#00f0ff',
    cursorGlow: 4,
    textGlow: 2,
    font: 'Orbitron'
  },
  tokyonight: {
    color: '#a9b1d6',
    gradient: ['#7abcff', '#bb9af7'],
    background: '#1a1b26',
    cursorColor: '#ff9e64',
    font: 'Inter'
  },
  nord: {
    color: '#88c0d0',
    gradient: ['#8fbcbb', '#88c0d0'],
    background: '#2e3440',
    cursorColor: '#d8dee9',
    font: 'Source Code Pro'
  },
  synthwave: {
    color: '#fede5d',
    gradient: ['#fe4450', '#ff7edb', '#2de2e6'],
    background: '#2b0f54',
    cursorColor: '#ff7edb',
    cursorGlow: 5,
    textGlow: 3,
    font: 'Outfit'
  },
  matrix: {
    color: '#00ff00',
    background: '#000000',
    cursorColor: '#33ff33',
    font: 'VT323',
    speed: 150,
    deleteSpeed: 50
  },
  sunset: {
    color: '#ffffff',
    gradient: ['#ff5e62', '#ff9966'],
    background: '#120015',
    cursorColor: '#ff5e62',
    font: 'Comfortaa'
  }
};

// Estimating text width based on font-family metrics.
export function estimateTextWidth(text: string, fontSize: number, font: string, letterSpacing: number = 0): number {
  const normalizedFont = font.toLowerCase();
  const isMonospace = ['monospace', 'fira code', 'courier', 'vt323', 'source code pro', 'major mono display', 'share tech mono', 'space mono', 'dm mono', 'anonymous pro'].some(
    f => normalizedFont.includes(f)
  );
  
  if (isMonospace) {
    return text.length * fontSize * 0.6 + Math.max(0, text.length - 1) * letterSpacing;
  }

  const fontMetrics = ((): {
    upper: number;
    lower: number;
    thinLower: number;
    wideLower: number;
    digit: number;
    space: number;
    punctuation: number;
    fallback: number;
  } => {
    if (normalizedFont.includes('orbitron')) {
      return { upper: 0.90, lower: 0.75, thinLower: 0.38, wideLower: 0.92, digit: 0.74, space: 0.38, punctuation: 0.35, fallback: 0.70 };
    }
    if (normalizedFont.includes('inter')) {
      return { upper: 0.80, lower: 0.64, thinLower: 0.30, wideLower: 0.88, digit: 0.62, space: 0.31, punctuation: 0.28, fallback: 0.60 };
    }
    if (normalizedFont.includes('outfit')) {
      return { upper: 0.76, lower: 0.60, thinLower: 0.30, wideLower: 0.82, digit: 0.58, space: 0.31, punctuation: 0.28, fallback: 0.56 };
    }
    if (normalizedFont.includes('comfortaa')) {
      return { upper: 0.82, lower: 0.62, thinLower: 0.30, wideLower: 0.85, digit: 0.60, space: 0.32, punctuation: 0.29, fallback: 0.58 };
    }
    return { upper: 0.62, lower: 0.47, thinLower: 0.25, wideLower: 0.75, digit: 0.50, space: 0.28, punctuation: 0.25, fallback: 0.50 };
  })();
  
  let total = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char >= 'A' && char <= 'Z') total += fontMetrics.upper;
    else if (char >= 'a' && char <= 'z') {
      if ('i1l'.includes(char)) total += fontMetrics.thinLower;
      else if ('mw'.includes(char)) total += fontMetrics.wideLower;
      else total += fontMetrics.lower;
    }
    else if (char >= '0' && char <= '9') total += fontMetrics.digit;
    else if (char === ' ') total += fontMetrics.space;
    else if ('.;:,\'!/\\|'.includes(char)) total += fontMetrics.punctuation;
    else total += fontMetrics.fallback;
  }
  return total * fontSize + Math.max(0, text.length - 1) * letterSpacing;
}

// Fetch Google Font CSS and base64-encode the woff2 file for sandbox compliance.
async function fetchGoogleFontBase64(fontFamily: string, weight = 400): Promise<{ css: string, name: string } | null> {
  const cacheKey = `${fontFamily}:${weight}`;
  if (fontCache.has(cacheKey)) {
    return { css: fontCache.get(cacheKey)!, name: fontFamily };
  }

  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@${weight}&display=swap`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // 2s timeout for safety

    const cssRes = await fetch(cssUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
      }
    });
    
    clearTimeout(timeoutId);
    if (!cssRes.ok) return null;
    const cssText = await cssRes.text();
    
    // Find font URL in CSS
    const urlMatch = cssText.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/);
    if (!urlMatch) return null;
    
    const fontUrl = urlMatch[1];
    
    // Fetch font binary
    const fontController = new AbortController();
    const fontTimeoutId = setTimeout(() => fontController.abort(), 2000);
    
    const fontRes = await fetch(fontUrl, { signal: fontController.signal });
    clearTimeout(fontTimeoutId);
    if (!fontRes.ok) return null;
    
    const fontBuffer = await fontRes.arrayBuffer();
    
    // Base64 encoding compatible with edge runtime
    const base64Font = btoa(
      new Uint8Array(fontBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );
    
    const fontFaceCss = `@font-face {
      font-family: '${fontFamily}';
      font-style: normal;
      font-weight: ${weight};
      font-display: swap;
      src: url(data:font/woff2;base64,${base64Font}) format('woff2');
    }`;
    
    fontCache.set(cacheKey, fontFaceCss);
    return { css: fontFaceCss, name: fontFamily };
  } catch (e) {
    console.error('Failed to inline Google Font', fontFamily, e);
    // Return a standard @import fallback if fetch fails (works in direct views, falls back in README)
    return {
      css: `@import url('https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@${weight}&display=swap');`,
      name: fontFamily
    };
  }
}

export async function renderSVG(options: Partial<RenderOptions>): Promise<string> {
  // Apply theme if provided
  const themeOpts = options.theme && THEMES[options.theme.toLowerCase()] ? THEMES[options.theme.toLowerCase()] : {};

  // Filter out undefined values so they don't override defaults when spread
  const definedOptions = Object.fromEntries(
    Object.entries(options).filter(([, v]) => v !== undefined)
  );
  
  const merged: RenderOptions = {
    lines: ['Hello World', 'Rebuilding in Next.js', 'Attracting Sponsors'],
    width: 600,
    height: 120,
    font: 'Fira Code',
    size: 24,
    weight: 400,
    letterSpacing: 0,
    color: '#36bcf7',
    gradientAngle: 90,
    background: 'transparent',
    speed: 100, // ms per char
    deleteSpeed: 50, // ms per char
    pause: 1500, // ms
    cursor: 'pipe',
    cursorColor: '',
    cursorGlow: 0,
    textGlow: 0,
    hCenter: false,
    vCenter: true,
    loop: true,
    layout: 'raw',
    attribution: true,
    ...themeOpts,
    ...definedOptions
  } as RenderOptions;

  const {
    lines,
    width,
    height,
    font,
    size,
    weight,
    letterSpacing,
    color,
    gradient,
    gradientAngle,
    background,
    speed,
    deleteSpeed,
    pause,
    cursor,
    cursorGlow,
    textGlow,
    hCenter,
    vCenter,
    loop,
    layout,
    attribution
  } = merged;

  const cursorColor = merged.cursorColor || color;
  
  // Font configuration
  let fontCss = '';
  let fontName = font;
  const isWebSafe = ['monospace', 'sans-serif', 'serif', 'cursive', 'system-ui', 'arial', 'helvetica', 'georgia', 'times new roman'].includes(font.toLowerCase());
  
  if (!isWebSafe) {
    const fetched = await fetchGoogleFontBase64(font, weight);
    if (fetched) {
      fontCss = fetched.css;
      fontName = fetched.name;
    }
  }

  // Animation Timing calculations
  // We need to synchronize multiple lines sequentially
  const lineDetails = lines.map(line => {
    const chars = line.length;
    const tType = chars * speed;
    const tDelete = chars * deleteSpeed;
    const tDelay = 300; // 300ms pause after deleting
    const tTotal = tType + pause + tDelete + tDelay;
    
    return {
      text: line,
      chars,
      tType,
      tDelete,
      tDelay,
      tTotal,
      width: estimateTextWidth(line, size, fontName, letterSpacing)
    };
  });

  const grandTotalTimeMs = lineDetails.reduce((sum, line) => sum + line.tTotal, 0);
  const grandTotalTimeSec = grandTotalTimeMs / 1000;

  // Generate CSS keyframes for each line
  let keyframesCss = '';
  let accumulatedTimeMs = 0;

  lineDetails.forEach((line, index) => {
    const tStart = accumulatedTimeMs;
    const tTyped = tStart + line.tType;
    const tPaused = tTyped + pause;
    const tDeleted = tPaused + line.tDelete;
    const tEnd = tDeleted + line.tDelay;

    accumulatedTimeMs = tEnd;

    // Convert milliseconds to percentages of the entire sequence duration
    const pStart = (tStart / grandTotalTimeMs) * 100;
    const pTyped = (tTyped / grandTotalTimeMs) * 100;
    const pPaused = (tPaused / grandTotalTimeMs) * 100;
    const pDeleted = (tDeleted / grandTotalTimeMs) * 100;
    const pEnd = (tEnd / grandTotalTimeMs) * 100;

    // Line clipping animation
    keyframesCss += `
    @keyframes clip-line-${index} {
      0% { transform: scaleX(0); }
      ${pStart > 0 ? `${(pStart - 0.001).toFixed(3)}% { transform: scaleX(0); }` : ''}
      ${pStart.toFixed(3)}% { transform: scaleX(0); animation-timing-function: steps(${line.chars}, end); }
      ${pTyped.toFixed(3)}% { transform: scaleX(1); animation-timing-function: linear; }
      ${pPaused.toFixed(3)}% { transform: scaleX(1); animation-timing-function: steps(${line.chars}, end); }
      ${pDeleted.toFixed(3)}% { transform: scaleX(0); animation-timing-function: linear; }
      ${pEnd.toFixed(3)}% { transform: scaleX(0); }
      100% { transform: scaleX(0); }
    }
    .clip-rect-${index} {
      transform-origin: 0px 0px;
      transform: scaleX(0);
      animation: clip-line-${index} ${grandTotalTimeSec.toFixed(2)}s ${loop ? 'infinite' : '1 forwards'};
    }
    `;

    // Cursor positioning and visibility animation
    if (cursor !== 'none') {
      const clipPadding = 3; // Match the safety margin in clip-path width
      const cursorEnd = line.width + clipPadding;
      keyframesCss += `
      @keyframes cursor-line-${index} {
        0% { opacity: 0; transform: translateX(0); }
        ${pStart > 0 ? `${(pStart - 0.001).toFixed(3)}% { opacity: 0; transform: translateX(0); }` : ''}
        ${pStart.toFixed(3)}% { opacity: 1; transform: translateX(0); animation-timing-function: steps(${line.chars}, end); }
        ${pTyped.toFixed(3)}% { opacity: 1; transform: translateX(${cursorEnd.toFixed(1)}px); animation-timing-function: linear; }
        ${pPaused.toFixed(3)}% { opacity: 1; transform: translateX(${cursorEnd.toFixed(1)}px); animation-timing-function: steps(${line.chars}, end); }
        ${pDeleted.toFixed(3)}% { opacity: 1; transform: translateX(0); animation-timing-function: linear; }
        ${pEnd.toFixed(3)}% { opacity: 0; transform: translateX(0); }
        100% { opacity: 0; transform: translateX(0); }
      }
      .cursor-rect-${index} {
        opacity: 0;
        transform: translateX(0);
        animation: cursor-line-${index} ${grandTotalTimeSec.toFixed(2)}s ${loop ? 'infinite' : '1 forwards'}, cursor-blink-anim 0.8s infinite step-end;
      }
      `;
    }
  });

  // Cursor blink keyframes
  if (cursor !== 'none') {
    keyframesCss += `
    @keyframes cursor-blink-anim {
      0%, 100% { fill: ${cursorColor}; }
      50% { fill: transparent; }
    }
    `;
  }

  // Gradients
  let gradientDefs = '';
  let fillProperty = color;
  if (gradient && gradient.length > 0) {
    const stops = gradient.map((col, idx) => {
      const offset = (idx / (gradient.length - 1)) * 100;
      return `<stop offset="${offset}%" stop-color="${col}" />`;
    }).join('\n');
    
    gradientDefs = `
    <linearGradient id="text-grad" x1="0%" y1="0%" x2="100%" y2="0%" gradientTransform="rotate(${gradientAngle})">
      ${stops}
    </linearGradient>
    `;
    fillProperty = 'url(#text-grad)';
  }

  // Filters (Neon Glows)
  let filterDefs = '';
  if (textGlow > 0 || cursorGlow > 0) {
    const maxGlow = Math.max(textGlow, cursorGlow);
    filterDefs = `
    <filter id="text-glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="${textGlow}" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    <filter id="cursor-glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="${cursorGlow}" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    `;
  }

  // Layout geometry calculations
  let contentOffsetY = 0;
  let layoutHeight = height;
  let layoutWidth = width;
  let rx = 0; // rounded corners
  let strokeColor = '';
  
  if (layout === 'terminal') {
    contentOffsetY = 35; // offset for title bar
    rx = 8;
    strokeColor = '#3a3d4d';
  } else if (layout === 'card') {
    rx = 12;
    strokeColor = 'rgba(255, 255, 255, 0.15)';
  }

  // Calculate coordinates for each line
  const renderingElements = lineDetails.map((line, index) => {
    // Horizontal alignment
    let x = 16;
    let anchor = 'start';
    if (hCenter) {
      x = layoutWidth / 2;
      anchor = 'middle';
    }

    // Vertical alignment
    const localHeight = layoutHeight - contentOffsetY;
    let y = contentOffsetY + (localHeight / 2) + (size * 0.35); // baseline centering correction
    if (!vCenter) {
      y = contentOffsetY + size + 16; // top padding
    }

    // Clip-path bounding rect x-coordinate
    let clipX = x;
    if (hCenter) {
      clipX = (layoutWidth / 2) - (line.width / 2);
    }
    
    // Cursor dimension and starting x-coordinate
    let cursorX = clipX;
    let cWidth = cursor === 'block' ? size * 0.6 : 2;
    let cHeight = size * 1.15;
    let cY = y - (size * 0.95);
    
    if (cursor === 'underscore') {
      cWidth = size * 0.6;
      cHeight = 3;
      cY = y + 2;
    }

    const clipPathId = `clip-${index}`;

    return {
      clipPathId,
      clipX,
      y,
      width: line.width,
      xml: `
      <!-- Line ${index} -->
      <g clip-path="url(#${clipPathId})">
        <text x="${x}" y="${y}" 
              fill="${fillProperty}" 
              font-family="'${fontName}', monospace" 
              font-size="${size}" 
              font-weight="${weight}" 
              letter-spacing="${letterSpacing}" 
              text-anchor="${anchor}"
              ${textGlow > 0 ? 'filter="url(#text-glow)"' : ''}
        >${line.text}</text>
      </g>
      ${cursor !== 'none' ? `
      <rect class="cursor-rect-${index}" 
            x="${cursorX}" y="${cY}" 
            width="${cWidth}" height="${cHeight}" 
            fill="${cursorColor}"
            ${cursorGlow > 0 ? 'filter="url(#cursor-glow)"' : ''}
      />` : ''}
      `
    };
  });

  // Assemble clipPaths
  const clipPathsXml = renderingElements.map((elem, index) => {
    const detail = lineDetails[index];
    const verticalY = elem.y - size;
    const clipPadding = 3; // Safety margin to prevent clipping on longer text
    return `
    <clipPath id="${elem.clipPathId}">
      <rect class="clip-rect-${index}" x="${elem.clipX.toFixed(1)}" y="${verticalY.toFixed(1)}" width="${(detail.width + clipPadding).toFixed(1)}" height="${(size * 1.5).toFixed(1)}" />
    </clipPath>
    `;
  }).join('\n');

  // Background rect
  const backgroundXml = background !== 'transparent' 
    ? `<rect width="${width}" height="${height}" fill="${background}" rx="${rx}" />` 
    : '';

  // Layout borders/mockup
  let layoutDecorationsXml = '';
  if (layout === 'terminal') {
    layoutDecorationsXml = `
    <!-- Terminal Header Bar -->
    <rect width="${width}" height="30" fill="${background !== 'transparent' ? '#181a23' : '#1f2430'}" rx="${rx}" />
    <!-- Window buttons -->
    <circle cx="16" cy="15" r="6" fill="#ff5f56" />
    <circle cx="36" cy="15" r="6" fill="#ffbd2e" />
    <circle cx="56" cy="15" r="6" fill="#27c93f" />
    <!-- Terminal Title -->
    <text x="${width / 2}" y="20" fill="#8a91b4" font-family="'${fontName}', monospace" font-size="11" font-weight="500" text-anchor="middle">scribesvg -- bash</text>
    <!-- Inner border -->
    <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="${rx - 0.5}" fill="none" stroke="${strokeColor}" stroke-opacity="0.7" />
    `;
  } else if (layout === 'card') {
    layoutDecorationsXml = `
    <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="${rx - 0.5}" fill="none" stroke="${strokeColor}" stroke-opacity="0.8" />
    `;
  }

  // Attribution badge (very small, optional watermark to drive virality)
  const attributionXml = attribution ? `
  <g opacity="0.3">
    <text x="${width - 10}" y="${height - 10}" fill="#888888" font-family="system-ui, sans-serif" font-size="9" text-anchor="end">made with DhanushNehru/ScribeSVG</text>
  </g>
  ` : '';

  // Combine into final SVG
  return `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">
  <defs>
    ${gradientDefs}
    ${filterDefs}
    ${clipPathsXml}
    <style>
      ${fontCss}
      
      /* Base styles */
      text {
        user-select: none;
        white-space: pre;
      }
      
      ${keyframesCss}
    </style>
  </defs>

  ${backgroundXml}
  ${layoutDecorationsXml}
  ${renderingElements.map(e => e.xml).join('\n')}
  ${attributionXml}
</svg>`;
}
