// PDF text extraction using pdf.js — runs 100% in the browser.
// Documents never leave the user's device.

import * as pdfjs from 'pdfjs-dist';

export interface DocPage {
  pageNumber: number;
  text: string;
}

let workerReady = false;
function ensureWorker() {
  if (!workerReady && typeof window !== 'undefined') {
    // Use the bundled worker from CDN matching the installed version
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
    workerReady = true;
  }
}

export async function extractPdfText(file: File, onProgress?: (p: number) => void): Promise<DocPage[]> {
  ensureWorker();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const pages: DocPage[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = (content.items as { str: string }[])
      .map(item => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length > 0) pages.push({ pageNumber: i, text });
    onProgress?.(Math.round((i / pdf.numPages) * 100));
  }
  return pages;
}
