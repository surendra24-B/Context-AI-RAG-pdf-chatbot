import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity, ArrowDown, ArrowUp, Bot, Check, ChevronDown, CircleHelp,
  FileText, FileUp, Github, Layers3, LoaderCircle, MessageSquare,
  PanelLeftClose, Plus, RotateCcw, Send, ShieldCheck, Sparkles,
  Trash2, UploadCloud, UserRound, WandSparkles, X, History, Copy, Clock3
} from "lucide-react";
import "./styles.css";

const API = "http://127.0.0.1:8000";
const suggestions = [
  "Summarize this document",
  "What are the key takeaways?",
  "Explain the most important concepts",
];

function App() {
  const [health, setHealth] = useState("checking");
  const [file, setFile] = useState(null);
  const [doc, setDoc] = useState(null);
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [showSources, setShowSources] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [sessions, setSessions] = useState(() => {
    try { return JSON.parse(localStorage.getItem("contextai.sessions") || "[]"); }
    catch { return []; }
  });
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    try {
      const compactSessions = sessions.slice(0, 12).map(session => ({
        ...session,
        messages: (session.messages || []).slice(-20).map(message => ({
          ...message,
          sources: (message.sources || []).map(source => ({
            ...source,
            text: (source.text || "").slice(0, 800),
          })),
        })),
      }));
      localStorage.setItem("contextai.sessions", JSON.stringify(compactSessions));
    } catch {
      // Local history is a convenience; storage limits must not break the chat.
    }
  }, [sessions]);

  useEffect(() => {
    if (!busy) { setElapsed(0); return; }
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);

  useEffect(() => {
    if (!doc || !activeSessionId) return;
    const title = messages.find(m => m.role === "user")?.content?.slice(0, 46) || doc.filename;
    setSessions(old => {
      const current = {
        id: activeSessionId,
        title,
        filename: doc.filename,
        doc,
        messages,
        updatedAt: Date.now(),
      };
      return [current, ...old.filter(s => s.id !== activeSessionId)].slice(0, 12);
    });
  }, [doc, messages, activeSessionId]);

  useEffect(() => {
    fetch(`${API}/api/health`)
      .then(r => r.json())
      .then(data => setHealth(data.gemini_configured ? "online" : "no-key"))
      .catch(() => setHealth("offline"));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function uploadPDF(selected) {
    if (!selected) return;
    setError("");
    if (!selected.name.toLowerCase().endsWith(".pdf")) {
      setError("Please select a PDF file.");
      return;
    }
    if (selected.size > 20 * 1024 * 1024) {
      setError("The file is larger than 20 MB.");
      return;
    }
    setFile(selected);
    setBusy(true);
    setDoc(null);
    setMessages([]);
    try {
      const form = new FormData();
      form.append("file", selected);
      const response = await fetch(`${API}/api/documents`, { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not process this PDF.");
      const sessionId = `${Date.now()}`;
      setActiveSessionId(sessionId);
      setDoc(data);
      setMessages([{
        role: "assistant",
        content: `I've indexed **${data.filename}** across ${data.page_count} pages. Ask me anything about the document, and I'll include page references where relevant.`,
        sources: [],
      }]);
    } catch (e) {
      setError(`${e.message} Check that the backend is running and your Gemini API key is configured.`);
    } finally {
      setBusy(false);
    }
  }

  async function sendQuestion(text = question) {
    const clean = text.trim();
    if (!clean || !doc || busy) return;
    setError("");
    const prior = messages.map(m => ({ role: m.role, content: m.content }));
    setMessages(old => [...old, { role: "user", content: clean }]);
    setQuestion("");
    setBusy(true);
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 90000);
      let response;
      try {
        response = await fetch(`${API}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ document_id: doc.document_id, question: clean, history: prior }),
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timeoutId);
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Unable to generate an answer.");
      setMessages(old => [...old, {
        role: "assistant",
        content: data.answer,
        sources: data.sources || [],
        processingSeconds: data.processing_seconds,
      }]);
    } catch (e) {
      setError(e.name === "AbortError"
        ? "This request took over 90 seconds. Check the backend terminal and Gemini model/quota, then try again."
        : e.message);
      setMessages(old => [...old, {
        role: "assistant",
        content: "I couldn't complete that request. Please check the backend connection and try again.",
        sources: [],
      }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function reset() {
    setFile(null); setDoc(null); setMessages([]); setQuestion(""); setError("");
    setActiveSessionId(null);
  }

  function openSession(session) {
    setActiveSessionId(session.id);
    setDoc(session.doc || null);
    setMessages(session.messages || []);
    setQuestion("");
    setError("");
    setFile(null);
    if (session.doc) {
      // Document vectors live in backend memory. If the backend restarted, upload the PDF again.
      setError("Conversation restored. If the backend has restarted, upload this PDF again to restore its searchable index.");
    }
  }

  async function copyAnswer(text) {
    try {
      await navigator.clipboard.writeText(text);
      setError("Answer copied to clipboard.");
      window.setTimeout(() => setError(""), 1800);
    } catch {
      setError("Clipboard access was blocked by your browser.");
    }
  }

  function renderText(text) {
    // Minimal safe Markdown-like rendering for bold segments and newlines.
    return text.split(/(\*\*.*?\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**")
        ? <strong key={i}>{part.slice(2, -2)}</strong>
        : <React.Fragment key={i}>{part}</React.Fragment>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon"><Layers3 size={21} /></div>
          <div><div className="brand-name">context<span>ai</span></div><div className="brand-caption">DOCUMENT INTELLIGENCE</div></div>
        </div>
        <button className="new-chat" onClick={reset}><Plus size={17} /> New conversation</button>
        <div className="side-label">WORKSPACE</div>
        <div className="nav-item active"><MessageSquare size={17} /> PDF Assistant <span className="nav-dot" /></div>
        <div className="side-label documents-label">YOUR DOCUMENT</div>
        {doc ? (
          <div className="document-chip">
            <div className="pdf-icon"><FileText size={17} /></div>
            <div className="doc-meta"><div className="doc-name">{doc.filename}</div><div className="doc-sub">{doc.page_count} pages · {doc.chunk_count} chunks</div></div>
            <button className="icon-button small" title="Remove document" onClick={reset}><X size={15}/></button>
          </div>
        ) : (
          <div className="empty-docs">Your uploaded document will appear here.</div>
        )}
        <div className="side-label history-label"><History size={13} style={{display:"inline", marginRight:6}}/> RECENT CHATS</div>
        <div className="session-list">
          {sessions.length === 0 ? (
            <div className="empty-docs">Your recent conversations will appear here.</div>
          ) : sessions.map(session => (
            <button
              className={`session-item ${activeSessionId === session.id ? "selected" : ""}`}
              key={session.id}
              onClick={() => openSession(session)}
              title={session.title}
            >
              <MessageSquare size={14}/>
              <span>{session.title || session.filename || "PDF conversation"}</span>
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="privacy-note"><ShieldCheck size={17}/><div><strong>Private workspace</strong><span>Files are processed by your local backend. Text is sent to Gemini for AI processing.</span></div></div>
          <a className="github-link" href="https://github.com/" target="_blank" rel="noreferrer"><Github size={16}/> Built for your portfolio <ArrowUp size={13}/></a>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><span className="slash">/</span><strong>PDF Assistant</strong></div>
          <div className="top-actions">
            <div className={`status-pill ${health}`}><span className="status-dot"/>{health === "online" ? "Gemini connected" : health === "checking" ? "Connecting…" : health === "no-key" ? "API key missing" : "Backend offline"}</div>
            <button className="icon-button" title="Reset conversation" onClick={reset}><RotateCcw size={17}/></button>
          </div>
        </header>

        <section className="conversation">
          {!doc && !busy ? (
            <div className="welcome">
              <div className="welcome-orb"><div className="orb-inner"><Sparkles size={30}/></div></div>
              <div className="eyebrow"><span/> YOUR AI KNOWLEDGE SPACE</div>
              <h1>Your documents.<br/><span>Your answers.</span></h1>
              <p className="welcome-copy">Meet your personal research assistant. Upload a PDF, explore the ideas inside it, and get answers with source references.</p>
              <div className={`upload-zone ${dragging ? "dragging" : ""}`}
                onDragOver={e => {e.preventDefault(); setDragging(true);}}
                onDragLeave={() => setDragging(false)}
                onDrop={e => {e.preventDefault(); setDragging(false); uploadPDF(e.dataTransfer.files?.[0]);}}>
                <input id="pdf-input" type="file" accept="application/pdf,.pdf" onChange={e => uploadPDF(e.target.files?.[0])} hidden/>
                <div className="upload-symbol"><UploadCloud size={24}/></div>
                <strong>Drop your PDF here</strong>
                <span>or choose a file from your computer</span>
                <label htmlFor="pdf-input" className="primary-button upload-button"><FileUp size={16}/> Choose PDF</label>
                <div className="upload-foot"><ShieldCheck size={13}/> PDF only · Up to 20 MB</div>
              </div>
              <div className="feature-row">
                <div><div className="feature-icon violet"><WandSparkles size={17}/></div><strong>Grounded answers</strong><span>Responses based on your PDF</span></div>
                <div><div className="feature-icon blue"><Activity size={17}/></div><strong>Semantic search</strong><span>Find meaning, not just keywords</span></div>
                <div><div className="feature-icon green"><FileText size={17}/></div><strong>Page references</strong><span>Trace answers to their sources</span></div>
              </div>
            </div>
          ) : (
            <div className="chat-wrap">
              <div className="chat-heading">
                <div className="chat-title-icon"><Bot size={21}/></div>
                <div><h2>PDF Assistant</h2><p>{doc ? `Answering from ${doc.filename}` : "Preparing your document…"}</p></div>
                {doc && <span className="indexed-badge"><Check size={13}/> Indexed</span>}
              </div>
              {messages.length === 0 && !busy && doc && (
                <div className="suggestions">
                  <div className="suggestion-label">TRY ASKING</div>
                  {suggestions.map(s => <button key={s} onClick={() => sendQuestion(s)}>{s}<ArrowUp size={14}/></button>)}
                </div>
              )}
              <div className="message-list">
                {messages.map((m, i) => (
                  <div className={`message-row ${m.role}`} key={i}>
                    <div className={`avatar ${m.role}`}>{m.role === "assistant" ? <Sparkles size={16}/> : <UserRound size={16}/>}</div>
                    <div className="message-content">
                      <div className="message-author">{m.role === "assistant" ? "Context AI" : "You"} <span>{m.role === "assistant" ? "· AI assistant" : "· Just now"}</span></div>
                      <div className="message-text">{renderText(m.content)}</div>
                      {m.role === "assistant" && m.processingSeconds != null && <div className="response-meta"><Clock3 size={11}/> Answered in {m.processingSeconds}s · Sources attached</div>}
                      {m.role === "assistant" && i > 0 && <button className="copy-answer" onClick={() => copyAnswer(m.content)}><Copy size={12}/> Copy answer</button>}
                      {m.sources?.length > 0 && (
                        <div className="source-area">
                          <button className="source-toggle" onClick={() => setShowSources(v => !v)}><FileText size={14}/> {m.sources.length} cited passages <ChevronDown size={14} className={showSources ? "rotate" : ""}/></button>
                          {showSources && <div className="source-list">{m.sources.map((s, j) => <div className="source-card" key={j}><div className="source-top"><span><FileText size={13}/> Page {s.page}</span><span className="score">Similarity {s.score}</span></div><p>{s.text}</p></div>)}</div>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {busy && <div className="message-row assistant"><div className="avatar assistant"><Sparkles size={16}/></div><div className="message-content"><div className="message-author">Context AI <span>· Working</span></div><div className="thinking"><span/><span/><span/> <em>{elapsed < 8 ? "Finding the most relevant passages…" : elapsed < 25 ? "Reading context and drafting your answer…" : "Gemini is taking longer than usual…"} <b>{elapsed}s</b></em></div><div className="loading-hint">Your document stays available while the answer is being prepared.</div></div></div>}
                <div ref={endRef}/>
              </div>
            </div>
          )}
        </section>

        {error && <div className="error-banner"><CircleHelp size={16}/><span>{error}</span><button onClick={() => setError("")}><X size={15}/></button></div>}

        <footer className="composer-area">
          <form className="composer" onSubmit={e => {e.preventDefault(); sendQuestion();}}>
            <input ref={inputRef} value={question} onChange={e => setQuestion(e.target.value)} placeholder={doc ? "Ask anything about your document…" : "Upload a PDF to start asking questions"} disabled={!doc || busy}/>
            <div className="composer-bottom"><span><Sparkles size={13}/> Powered by Gemini + retrieval-augmented generation</span><button className="send-button" type="submit" disabled={!doc || busy || !question.trim()}><Send size={16}/></button></div>
          </form>
          <div className="disclaimer">AI can make mistakes. Verify important information against the original document.</div>
        </footer>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
