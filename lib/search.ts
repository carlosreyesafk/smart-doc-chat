// Document intelligence: chunking, TF-IDF retrieval, extractive Q&A with citations.
// 100% client-side — no servers, no API keys.

import type { DocPage } from './pdf';

export interface Chunk {
  id: number;
  pageNumber: number;
  text: string;
}

export interface Source {
  pageNumber: number;
  excerpt: string;
  score: number;
}

export interface Answer {
  text: string;
  sources: Source[];
}

// ---------- chunking ----------
const CHUNK_SIZE = 600;
const OVERLAP = 120;

export function chunkPages(pages: DocPage[]): Chunk[] {
  const chunks: Chunk[] = [];
  let id = 0;
  for (const page of pages) {
    const text = page.text;
    if (text.length <= CHUNK_SIZE) {
      chunks.push({ id: id++, pageNumber: page.pageNumber, text });
      continue;
    }
    let start = 0;
    while (start < text.length) {
      // break at sentence boundary when possible
      let end = Math.min(start + CHUNK_SIZE, text.length);
      if (end < text.length) {
        const dot = text.lastIndexOf('. ', end);
        if (dot > start + CHUNK_SIZE * 0.5) end = dot + 1;
      }
      chunks.push({ id: id++, pageNumber: page.pageNumber, text: text.slice(start, end).trim() });
      start = end - OVERLAP;
    }
  }
  return chunks;
}

// ---------- tokenization ----------
const STOPWORDS = new Set(
  'a,an,the,and,or,but,if,then,else,when,at,by,for,with,about,into,through,during,before,after,above,below,to,from,up,down,in,out,on,off,over,under,again,further,once,here,there,all,any,both,each,few,more,most,other,some,such,no,nor,not,only,own,same,so,than,too,very,can,will,just,don,should,now,is,are,was,were,be,been,being,have,has,had,having,do,does,did,doing,would,could,ought,i,you,he,she,it,we,they,them,his,her,its,our,their,this,that,these,those,as,of,s,what,which,who,whom,how,why,where,me,my'.split(',')
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOPWORDS.has(t));
}

// ---------- TF-IDF index ----------
export interface Index {
  chunks: Chunk[];
  idf: Map<string, number>;
  vectors: Map<number, number>[]; // chunkId -> term -> tfidf
  norms: number[];
}

export function buildIndex(chunks: Chunk[]): Index {
  const docCount = chunks.length;
  const df = new Map<string, number>();
  const tfMaps: Map<string, number>[] = [];

  for (const chunk of chunks) {
    const tokens = tokenize(chunk.text);
    const tf = new Map<string, number>();
    const seen = new Set<string>();
    for (const t of tokens) {
      tf.set(t, (tf.get(t) ?? 0) + 1);
      if (!seen.has(t)) { df.set(t, (df.get(t) ?? 0) + 1); seen.add(t); }
    }
    // normalize tf
    const max = Math.max(...tf.values(), 1);
    for (const [k, v] of tf) tf.set(k, v / max);
    tfMaps.push(tf);
  }

  const idf = new Map<string, number>();
  for (const [term, count] of df) {
    idf.set(term, Math.log(1 + docCount / count));
  }

  const vectors: Map<number, number>[] = [];
  const norms: number[] = [];
  chunks.forEach((chunk, i) => {
    const vec = new Map<number, number>();
    let sum = 0;
    // map terms to indices for speed
    for (const [term, tf] of tfMaps[i]) {
      const w = tf * (idf.get(term) ?? 0);
      if (w > 0) {
        const idx = hashTerm(term);
        vec.set(idx, (vec.get(idx) ?? 0) + w);
        sum += w * w;
      }
    }
    vectors.push(vec);
    norms.push(Math.sqrt(sum));
  });

  return { chunks, idf, vectors, norms };
}

function hashTerm(term: string): number {
  let h = 0;
  for (let i = 0; i < term.length; i++) { h = (h * 31 + term.charCodeAt(i)) | 0; }
  return h;
}

function queryVector(query: string, idf: Map<string, number>): Map<number, number> {
  const tokens = tokenize(query);
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  const max = Math.max(...tf.values(), 1);
  const vec = new Map<number, number>();
  for (const [term, count] of tf) {
    const w = (count / max) * (idf.get(term) ?? Math.log(2));
    const idx = hashTerm(term);
    vec.set(idx, (vec.get(idx) ?? 0) + w);
  }
  return vec;
}

function cosine(a: Map<number, number>, b: Map<number, number>, normB: number): number {
  let dot = 0, normA = 0;
  for (const [k, v] of a) { normA += v * v; const bv = b.get(k); if (bv) dot += v * bv; }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * normB);
}

// ---------- retrieval ----------
export function retrieve(index: Index, query: string, topK = 4): { chunk: Chunk; score: number }[] {
  const qv = queryVector(query, index.idf);
  const scored = index.chunks.map((chunk, i) => ({
    chunk,
    score: cosine(qv, index.vectors[i], index.norms[i]),
  }));
  return scored
    .filter(s => s.score > 0.01)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// ---------- answer generation ----------
function splitSentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]+/g)?.map(s => s.trim()).filter(s => s.length > 20) ?? [];
}

export function answerQuestion(index: Index, query: string): Answer {
  const hits = retrieve(index, query, 4);
  if (hits.length === 0) {
    return {
      text: "I couldn't find anything relevant in this document. Try rephrasing your question or asking about a different topic covered in the PDF.",
      sources: [],
    };
  }

  const qTokens = new Set(tokenize(query));
  // score sentences across top chunks
  const scored: { sentence: string; pageNumber: number; score: number }[] = [];
  for (const { chunk, score: chunkScore } of hits) {
    for (const s of splitSentences(chunk.text)) {
      const tokens = tokenize(s);
      let overlap = 0;
      for (const t of tokens) if (qTokens.has(t)) overlap++;
      const score = chunkScore * 0.5 + (overlap / Math.max(qTokens.size, 1)) * 0.5;
      scored.push({ sentence: s, pageNumber: chunk.pageNumber, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);

  // pick top 2-3 diverse sentences
  const picked: typeof scored = [];
  const usedPages = new Set<number>();
  for (const s of scored) {
    if (picked.length >= 3) break;
    if (picked.some(p => p.sentence === s.sentence)) continue;
    picked.push(s);
    usedPages.add(s.pageNumber);
  }

  const text = picked.map(s => s.sentence).join(' ');
  const sources: Source[] = hits.slice(0, 3).map(h => ({
    pageNumber: h.chunk.pageNumber,
    excerpt: h.chunk.text.length > 220 ? h.chunk.text.slice(0, 217) + '...' : h.chunk.text,
    score: Math.round(h.score * 100) / 100,
  }));

  return { text, sources };
}

// ---------- document summary ----------
export function summarizeDocument(index: Index): { topics: string[]; chunkCount: number } {
  // top terms by total tf-idf weight
  const totals = new Map<string, number>();
  // rebuild term totals from vectors is lossy (hashed); use chunk text instead
  const termCounts = new Map<string, number>();
  for (const chunk of index.chunks) {
    for (const t of new Set(tokenize(chunk.text))) {
      termCounts.set(t, (termCounts.get(t) ?? 0) + 1);
    }
  }
  const topics = [...termCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([t]) => t);
  return { topics, chunkCount: index.chunks.length };
}
