"use client";
import { useState, useEffect } from "react";
import { getVoterId } from "@/lib/voter";

const MAX_CHARS = 200;

type Question = {
  id: string;
  body: string;
  author: string | null;
  votes: number;
};

type SortOrder = "newest" | "votes";

export default function QuestionsList({
  initialQuestions,
  initialHasMore,
}: {
  initialQuestions: Question[];
  initialHasMore: boolean;
}) {
  const [questions, setQuestions] = useState(initialQuestions);
  const [draft, setDraft] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [query, setQuery] = useState("");
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<SortOrder>("newest");
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
    // Restore voted IDs from localStorage
    try {
      const stored = localStorage.getItem("voted_questions");
      if (stored) setVotedIds(new Set(JSON.parse(stored)));
    } catch {}
  }, []);

  // Debounced search
  useEffect(() => {
    const id = setTimeout(async () => {
      const url = query
        ? `/api/questions?q=${encodeURIComponent(query)}`
        : `/api/questions`;
      const res = await fetch(url);
      const data = await res.json();
      setQuestions(data.questions);
      setHasMore(data.hasMore);
    }, 300);
    return () => clearTimeout(id);
  }, [query]);

  async function submit() {
    if (!draft.trim() || draft.length > MAX_CHARS) return;

    const res = await fetch("/api/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: draft, author: authorName.trim() || null }),
    });
    const created = await res.json();

    setQuestions((qs) => [{ ...created, votes: 0 }, ...qs]);
    setDraft("");
  }

  async function upvote(id: string) {
    if (votedIds.has(id)) return;

    // Optimistic update
    setQuestions((qs) =>
      qs.map((q) => (q.id === id ? { ...q, votes: q.votes + 1 } : q))
    );

    const res = await fetch(`/api/questions/${id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voterId: getVoterId() }),
    });

    if (!res.ok) {
      // Roll back
      setQuestions((qs) =>
        qs.map((q) => (q.id === id ? { ...q, votes: q.votes - 1 } : q))
      );
    } else {
      // Persist voted state
      setVotedIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        try {
          localStorage.setItem("voted_questions", JSON.stringify([...next]));
        } catch {}
        return next;
      });
    }
  }

  async function loadMore() {
    setLoading(true);
    const res = await fetch(`/api/questions?offset=${questions.length}`);
    const data = await res.json();
    setQuestions((qs) => [...qs, ...data.questions]);
    setHasMore(data.hasMore);
    setLoading(false);
  }

  const charsLeft = MAX_CHARS - draft.length;
  const isOverLimit = draft.length > MAX_CHARS;
  const isEmpty = !draft.trim();

  const sorted = [...questions].sort((a, b) => {
    if (sort === "votes") return b.votes - a.votes;
    return 0; // keep server order (newest) when sort === "newest"
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        {hydrated ? "Interactive ✓" : "Loading interactivity…"}
      </p>

      {/* Ask form */}
      <div className="space-y-2 rounded-lg border p-4">
        <input
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          placeholder="Your name (optional)"
          className="w-full rounded-md border px-3 py-2 text-sm text-gray-600"
          maxLength={60}
        />
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask a question…"
          rows={3}
          className={`w-full rounded-md border px-3 py-2 resize-none ${
            isOverLimit ? "border-red-400 focus:outline-red-400" : ""
          }`}
        />
        <div className="flex items-center justify-between">
          <span
            className={`text-xs tabular-nums ${
              isOverLimit
                ? "text-red-500 font-semibold"
                : charsLeft <= 30
                ? "text-amber-500"
                : "text-gray-400"
            }`}
          >
            {charsLeft} characters left
          </span>
          <button
            onClick={submit}
            disabled={isEmpty || isOverLimit}
            className="rounded-md border px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
          >
            Ask
          </button>
        </div>
      </div>

      {/* Search + sort row */}
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search questions…"
          className="flex-1 rounded-md border px-3 py-2"
        />
        <div className="flex rounded-md border overflow-hidden">
          <button
            onClick={() => setSort("newest")}
            className={`px-3 py-2 text-sm transition-colors ${
              sort === "newest" ? "bg-gray-900 text-white" : "hover:bg-gray-50"
            }`}
          >
            Newest
          </button>
          <button
            onClick={() => setSort("votes")}
            className={`px-3 py-2 text-sm border-l transition-colors ${
              sort === "votes" ? "bg-gray-900 text-white" : "hover:bg-gray-50"
            }`}
          >
            Top
          </button>
        </div>
      </div>

      {/* Questions list */}
      <ul className="space-y-3">
        {sorted.map((q) => {
          const voted = votedIds.has(q.id);
          return (
            <li
              key={q.id}
              className="flex items-start gap-3 rounded-lg border p-3"
            >
              <button
                onClick={() => upvote(q.id)}
                disabled={voted}
                title={voted ? "Already voted" : "Upvote"}
                className={`shrink-0 rounded-md border px-3 py-1 font-mono text-sm transition-colors ${
                  voted
                    ? "bg-gray-900 text-white border-gray-900 cursor-default"
                    : "hover:bg-gray-50 cursor-pointer"
                }`}
              >
                ▲ {q.votes}
              </button>
              <div className="min-w-0">
                <p className="text-sm">{q.body}</p>
                {q.author && (
                  <p className="mt-1 text-xs text-gray-400">— {q.author}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {hasMore && (
        <button
          onClick={loadMore}
          disabled={loading}
          className="rounded-md border px-4 py-2 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
