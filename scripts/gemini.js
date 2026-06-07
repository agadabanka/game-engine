// Shared Gemini helper — used by build-time scripts (scripts/*.mjs) and,
// optionally, by the server at runtime (server.js).
//
// Auth, in priority order:
//   1. GEMINI_SA_JSON                  — full service-account JSON as a string (best for Railway)
//   2. GOOGLE_APPLICATION_CREDENTIALS  — path to a service-account JSON file (ADC)
//   3. GEMINI_API_KEY                  — a Gemini API key (must be SA-bound + allowlisted in 2026)
//
// Capabilities: generateImage (nano-banana / Imagen-class), analyzeImage
// (vision), generateText. Video (Veo) is long-running; see scripts if needed.

import { GoogleAuth } from 'google-auth-library';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const SCOPES = [
  'https://www.googleapis.com/auth/generative-language',
  'https://www.googleapis.com/auth/generative-language.tuning',
];

export const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image-preview';
export const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';

let _client = null;

function credsFromEnv() {
  if (process.env.GEMINI_SA_JSON) {
    return { credentials: JSON.parse(process.env.GEMINI_SA_JSON), scopes: SCOPES };
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return { keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS, scopes: SCOPES };
  }
  return null;
}

export function geminiConfigured() {
  return Boolean(
    process.env.GEMINI_SA_JSON ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.GEMINI_API_KEY,
  );
}

// Returns { headers, keyParam } for the request, depending on auth mode.
async function auth() {
  const creds = credsFromEnv();
  if (creds) {
    if (!_client) {
      _client = await new GoogleAuth(creds).getClient();
    }
    const { token } = await _client.getAccessToken();
    return { headers: { Authorization: `Bearer ${token}` }, keyParam: '' };
  }
  if (process.env.GEMINI_API_KEY) {
    return { headers: {}, keyParam: `?key=${process.env.GEMINI_API_KEY}` };
  }
  throw new Error(
    'Gemini not configured: set GEMINI_SA_JSON, GOOGLE_APPLICATION_CREDENTIALS, or GEMINI_API_KEY',
  );
}

async function call(model, body) {
  const a = await auth();
  const res = await fetch(`${BASE}/models/${model}:generateContent${a.keyParam}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...a.headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Gemini ${model} ${res.status}: ${detail.slice(0, 400)}`);
  }
  return res.json();
}

function textFrom(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text).filter(Boolean).join('');
}

// Generate an image from a text prompt. Returns { mimeType, base64 }.
// `refs` = optional reference images ([{ base64, mimeType }]) sent alongside the
// prompt — the lever for COHERENCE: pass a locked model sheet / style guide so
// nano-banana-pro stays on-model (consistent character/palette) instead of
// drifting. Additive: omit `refs` and behaviour is unchanged.
export async function generateImage(prompt, { model = IMAGE_MODEL, aspectRatio, refs = [] } = {}) {
  const generationConfig = { responseModalities: ['IMAGE'] };
  // gemini-3-pro-image ("nano banana pro") honours an aspect ratio hint
  // (e.g. "2:3", "16:9"); additive — omit it and behaviour is unchanged.
  if (aspectRatio) generationConfig.imageConfig = { aspectRatio };
  const parts = [
    ...refs.map((r) => ({ inlineData: { mimeType: r.mimeType || 'image/png', data: r.base64 } })),
    { text: prompt },
  ];
  const data = await call(model, {
    contents: [{ parts }],
    generationConfig,
  });
  for (const part of data?.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return { mimeType: part.inlineData.mimeType, base64: part.inlineData.data };
    }
  }
  throw new Error('No image in Gemini response: ' + textFrom(data).slice(0, 200));
}

// Analyze / describe an image. `base64` is the raw image bytes, base64-encoded.
export async function analyzeImage(
  { base64, mimeType = 'image/png', prompt = 'Describe this image in detail.' },
  { model = TEXT_MODEL } = {},
) {
  const data = await call(model, {
    contents: [
      {
        parts: [{ inlineData: { mimeType, data: base64 } }, { text: prompt }],
      },
    ],
  });
  return textFrom(data);
}

// Analyze SEVERAL images in one call — the lever for COMPARISON / A-B judging
// (e.g. "how does game A FEEL vs game B"). `images` = [{ base64, mimeType, label }];
// each label is sent as a text part right before its image so the model can refer
// to them ("IMAGE 1 — Jazz title"). Returns the model's text. Additive — leaves
// the single-image analyzeImage untouched.
export async function analyzeImages(images, prompt, { model = TEXT_MODEL } = {}) {
  const parts = [];
  images.forEach((im, i) => {
    parts.push({ text: im.label ? `IMAGE ${i + 1} — ${im.label}:` : `IMAGE ${i + 1}:` });
    parts.push({ inlineData: { mimeType: im.mimeType || 'image/png', data: im.base64 } });
  });
  parts.push({ text: prompt });
  const data = await call(model, { contents: [{ parts }] });
  return textFrom(data);
}

// Plain text generation (handy for captions, alt text, summaries).
export async function generateText(prompt, { model = TEXT_MODEL, generationConfig } = {}) {
  const body = { contents: [{ parts: [{ text: prompt }] }] };
  if (generationConfig) body.generationConfig = generationConfig;   // e.g. thinkingConfig:{thinkingBudget:0} for fast replies
  const data = await call(model, body);
  return textFrom(data);
}
