# 💬 Smart Doc Chat

**Upload a PDF → chat with your documents. Answers come with page citations, and your files never leave your device.**

🌐 **Live demo:** https://smart-doc-chat-6uxe4ybq0-carlosreyesafks-projects.vercel.app

![Next.js](https://img.shields.io/badge/Next.js-14-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![pdf.js](https://img.shields.io/badge/pdf.js-text%20extraction-orange)

## What it does

1. **Drop a PDF** (drag & drop, up to 30MB) — text is extracted in your browser with pdf.js, page by page
2. **Automatic indexing** — the document is chunked and a TF-IDF search index is built locally
3. **Ask anything** — ChatGPT-style interface; answers are generated extractively from your document only
4. **Every answer shows sources** — page numbers + excerpts so you can verify everything

Try: *"What is the main topic?"*, *"Summarize the key points"*, *"What does it say about X?"*

## Privacy by design 🛡️

- **Zero servers** — no uploads, no API calls, no tracking
- **100% client-side** — pdf.js extraction, chunking, TF-IDF retrieval and answer generation all run in your tab
- **Nothing persists** — close the tab and your document is gone

## How it works

```
PDF → pdf.js (per-page text) → chunking (600 chars, sentence-aware, 120 overlap)
    → TF-IDF vectors + cosine similarity → top chunks
    → sentence scoring (retrieval score × query overlap)
    → answer + page citations
```

No LLM API needed: the extractive Q&A finds the most relevant sentences via hybrid scoring and presents them with their sources. If nothing in the document matches, it says so honestly instead of hallucinating.

## Stack

`Next.js 14` (App Router) · `TypeScript` · `Tailwind CSS` · `pdf.js` · Custom TF-IDF engine · Static export → Vercel

## Run it locally

```bash
npm install
npm run dev
# → http://localhost:3000
```

## Project structure

```
app/page.tsx    — upload zone + chat UI
lib/pdf.ts      — pdf.js text extraction (per page)
lib/search.ts   — chunking, TF-IDF index, retrieval, extractive Q&A
```

## Limitations

- Works with text-based PDFs; scanned images need OCR (not included)
- Extractive answers quote the document — it won't reason beyond what's written

---

Built by [Carlos Reyes](https://github.com/carlosreyesafk) — Software Developer · React · TypeScript · Supabase
