'use client';

import { useState, useRef, useCallback } from 'react';
import { extractPdfText, type DocPage } from '@/lib/pdf';
import { chunkPages, buildIndex, answerQuestion, summarizeDocument, type Index, type Answer } from '@/lib/search';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  sources?: Answer['sources'];
}

export default function Home() {
  const [docName, setDocName] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [index, setIndex] = useState<Index | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const processFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please upload a PDF file.');
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      setError('File is too large (max 30MB).');
      return;
    }
    setError('');
    setLoading(true);
    setMessages([]);
    setDocName(file.name);
    try {
      setStatus('Reading PDF…');
      const pages: DocPage[] = await extractPdfText(file, setProgress);
      setStatus('Building search index…');
      setPageCount(pages.length);
      const chunks = chunkPages(pages);
      const idx = buildIndex(chunks);
      setIndex(idx);
      const { topics } = summarizeDocument(idx);
      setMessages([{
        role: 'assistant',
        text: `I've read "${file.name}" — ${pages.length} pages, ${chunks.length} sections indexed. Ask me anything about it.\n\nKey topics I detected: ${topics.slice(0, 6).join(', ')}.`,
      }]);
    } catch (e) {
      console.error(e);
      setError('Could not read this PDF. It may be scanned images without text, or corrupted.');
      setDocName(null);
    } finally {
      setLoading(false);
      setStatus('');
      setProgress(0);
    }
  }, []);

  const ask = useCallback(() => {
    const q = input.trim();
    if (!q || !index || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: q }]);
    // small delay to feel natural
    setTimeout(() => {
      const ans = answerQuestion(index, q);
      setMessages(prev => [...prev, { role: 'assistant', text: ans.text, sources: ans.sources }]);
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 350);
  }, [input, index, loading]);

  const reset = () => {
    setIndex(null); setDocName(null); setMessages([]); setPageCount(0); setError('');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-xl">💬</div>
            <div>
              <h1 className="font-bold text-lg leading-tight">Smart Doc Chat</h1>
              <p className="text-xs text-slate-400">Chat with your PDFs · 100% private</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-emerald-300 bg-emerald-950 border border-emerald-800 rounded-full px-3 py-1.5">
              🔒 Never leaves your device
            </span>
            {index && (
              <button onClick={reset} className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition">New document</button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-8 flex flex-col">
        {!index && !loading && (
          <div>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) processFile(f); }}
              className={`rounded-3xl border-2 border-dashed p-16 text-center cursor-pointer transition ${dragOver ? 'border-emerald-400 bg-emerald-950/30' : 'border-slate-700 bg-slate-900 hover:border-slate-600'}`}
            >
              <div className="text-6xl mb-6">📄</div>
              <h2 className="text-xl font-semibold mb-2">Drop your PDF here</h2>
              <p className="text-slate-400 text-sm mb-6">or click to browse · max 30MB · text-based PDFs work best</p>
              <div className="inline-block px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 font-semibold hover:opacity-90 transition">
                Choose PDF
              </div>
              <input ref={fileRef} type="file" accept=".pdf,application/pdf" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); }} />
            </div>
            {error && <p className="text-red-400 text-sm mt-4 text-center">{error}</p>}

            {/* how it works */}
            <div className="grid sm:grid-cols-3 gap-4 mt-10">
              {[
                { icon: '📤', title: 'Upload', desc: 'Your PDF is read entirely in your browser with pdf.js' },
                { icon: '🧠', title: 'Understand', desc: 'Text is chunked and indexed with TF-IDF semantic search' },
                { icon: '💡', title: 'Ask', desc: 'Get answers with page citations — sources always shown' },
              ].map((s, i) => (
                <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                  <div className="text-3xl mb-3">{s.icon}</div>
                  <h3 className="font-semibold mb-1.5">{s.title}</h3>
                  <p className="text-sm text-slate-400">{s.desc}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 bg-emerald-950/40 border border-emerald-900 rounded-2xl p-6 flex gap-4">
              <div className="text-3xl">🛡️</div>
              <div>
                <h3 className="font-semibold text-emerald-200 mb-1">Private by design</h3>
                <p className="text-sm text-slate-400">No servers, no uploads, no tracking. Your documents are processed locally and never leave this tab. Close it and everything is gone.</p>
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex-1 flex flex-col items-center justify-center py-24">
            <div className="w-16 h-16 border-4 border-slate-700 border-t-emerald-500 rounded-full animate-spin mb-6" />
            <p className="font-medium mb-2">{status || 'Processing…'}</p>
            <p className="text-sm text-slate-400 mb-4">{docName}</p>
            {progress > 0 && (
              <div className="w-64 h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>
        )}

        {index && !loading && (
          <>
            <div className="flex items-center gap-3 mb-6 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
              <div className="text-2xl">📄</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{docName}</p>
                <p className="text-xs text-slate-400">{pageCount} pages · {index.chunks.length} sections indexed</p>
              </div>
              <span className="text-xs text-emerald-300">● Ready</span>
            </div>

            <div className="flex-1 space-y-4 mb-6">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-5 py-3.5 ${m.role === 'user' ? 'bg-emerald-600 text-white' : 'bg-slate-900 border border-slate-800'}`}>
                    <p className="text-sm whitespace-pre-line leading-relaxed">{m.text}</p>
                    {m.sources && m.sources.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-700/60">
                        <p className="text-xs text-slate-400 font-medium mb-2">📚 Sources</p>
                        <div className="space-y-2">
                          {m.sources.map((s, j) => (
                            <div key={j} className="text-xs bg-slate-800/60 rounded-lg p-2.5">
                              <span className="inline-block text-[10px] font-bold text-emerald-300 bg-emerald-950 border border-emerald-800 rounded px-1.5 py-0.5 mb-1">p. {s.pageNumber}</span>
                              <p className="text-slate-300 leading-relaxed">{s.excerpt}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <div className="sticky bottom-4">
              <div className="flex gap-2 bg-slate-900 border border-slate-700 rounded-2xl p-2 focus-within:border-emerald-500 transition">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && ask()}
                  placeholder="Ask anything about your document…"
                  className="flex-1 bg-transparent px-4 py-2.5 text-sm focus:outline-none placeholder:text-slate-500"
                />
                <button onClick={ask} disabled={!input.trim()}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 font-medium text-sm hover:opacity-90 transition disabled:opacity-40">
                  Send →
                </button>
              </div>
              <p className="text-xs text-slate-500 text-center mt-2">Answers are generated from your document only · always check the sources</p>
            </div>
          </>
        )}
      </main>

      <footer className="border-t border-slate-800">
        <div className="max-w-4xl mx-auto px-6 py-6 text-center text-sm text-slate-500">
          Built by <a href="https://github.com/carlosreyesafk" className="text-emerald-400 hover:underline">Carlos Reyes</a> · Smart Doc Chat
        </div>
      </footer>
    </div>
  );
}
