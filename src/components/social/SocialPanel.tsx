"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { GazeAction, GazeSelectScope } from "@/components/GazeSelectScope";
import MindReaderKeyboard from "@/components/MindReaderKeyboard";
import { useAgent } from "@/components/AgentProvider";
import { brutal } from "@/components/ui/brutal";
import { useGazeEdgeScroll } from "@/hooks/useGazeEdgeScroll";
import { AGENT_SCROLL_ATTRIBUTE } from "@/lib/agent/performer";
import { CONTACTS } from "@/lib/contacts";
import { AUTO_REPLIES, DEFAULT_REPLY, createInitialSocialState, friendById } from "@/lib/social/mockFeed";
import { socialReducer } from "@/lib/social/socialReducer";
import { ME, type Post } from "@/lib/social/types";

type Tab = "feed" | "messages";
type Field = "post" | "comment" | "message";

const AGENT_PRESETS = [
  "Message Maya that I'm feeling better today",
  "Like Sam's sunset post",
  "Post: good morning everyone",
  "Reply to Grandma Lou's banana bread post saying I can't wait",
] as const;

const AUTO_REPLY_DELAY_MS = 1600;
const THREAD_IDS: readonly string[] = CONTACTS.map((contact) => contact.id);

const fieldClass = brutal.field;
const primaryButton = brutal.buttonPrimary;
const ghostButton = brutal.button;

function Avatar({ friendId }: { friendId: string }) {
  const friend = friendById(friendId);
  return (
    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-[var(--ink)] text-sm font-black text-white ${friend.color}`}>
      {friend.name[0]}
    </span>
  );
}

const clip = (text: string, max = 60) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

interface SocialPanelProps {
  /** Where to start. Defaults to the feed. */
  initialTab?: Tab;
  /** Contact whose conversation to open first (with `initialTab="messages"`). */
  initialThread?: string;
  /** Omit to hide the close button (e.g. on the stand-alone mock site). */
  onClose?: () => void;
  /** Whether to show the "Ask i-see to…" bar. The mock site the agent drives hides it. */
  showAgentBar?: boolean;
}

export function SocialPanel({ onClose, showAgentBar = true, initialTab = "feed", initialThread }: SocialPanelProps) {
  const agent = useAgent();
  const [state, dispatch] = useReducer(socialReducer, undefined, createInitialSocialState);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string>(initialThread && THREAD_IDS.includes(initialThread) ? initialThread : THREAD_IDS[0]);
  const [drafts, setDrafts] = useState<Record<Field, string>>({ post: "", comment: "", message: "" });
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  /** Remounting the keyboard clears its internal text after a send. */
  const [keyboardEpoch, setKeyboardEpoch] = useState(0);
  const [customGoal, setCustomGoal] = useState("");

  const feedRef = useRef<HTMLDivElement>(null);
  const idCounterRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const nextId = () => `local-${(idCounterRef.current += 1)}`;

  const activeField: Field = tab === "messages" ? "message" : replyingTo ? "comment" : "post";
  const agentBusy = agent.status === "running";

  useGazeEdgeScroll(feedRef, tab === "feed");
  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  const setDraft = useCallback((field: Field, text: string) => setDrafts((prev) => ({ ...prev, [field]: text })), []);
  const handleKeyboardText = useCallback((text: string) => setDraft(activeField, text), [activeField, setDraft]);
  const resetKeyboard = () => setKeyboardEpoch((epoch) => epoch + 1);

  const publishPost = () => {
    dispatch({ type: "add-post", body: drafts.post, id: nextId() });
    setDraft("post", "");
    resetKeyboard();
  };

  const sendComment = (postId: string) => {
    dispatch({ type: "add-comment", postId, body: drafts.comment, id: nextId() });
    setDraft("comment", "");
    setReplyingTo(null);
    resetKeyboard();
  };

  const sendMessage = () => {
    if (!drafts.message.trim()) return;
    const friendId = threadId;
    dispatch({ type: "send-message", friendId, from: ME, body: drafts.message, id: nextId() });
    setDraft("message", "");
    resetKeyboard();
    const reply = AUTO_REPLIES[friendId] ?? DEFAULT_REPLY;
    timersRef.current.push(
      setTimeout(() => dispatch({ type: "send-message", friendId, from: friendId, body: reply, id: nextId() }), AUTO_REPLY_DELAY_MS),
    );
  };

  const runCustomGoal = () => {
    agent.run(customGoal);
    setCustomGoal("");
  };

  const renderPost = (post: Post) => {
    const author = friendById(post.authorId);
    const replying = replyingTo === post.id;
    return (
      <article key={post.id} className={brutal.card}>
        <header className="flex items-center gap-3">
          <Avatar friendId={post.authorId} />
          <div>
            <p className="text-sm font-semibold">{author.name}</p>
            <p className="text-xs text-[var(--iris-text-secondary)]">{post.timeAgo}</p>
          </div>
        </header>
        <p className="mt-3 text-base leading-snug">{post.body}</p>

        {post.comments.length > 0 && (
          <ul className="mt-3 space-y-1.5 border-l-4 border-[var(--ink)]/20 pl-3">
            {post.comments.map((comment) => (
              <li key={comment.id} className="text-sm text-[var(--iris-text-secondary)]">
                <span className="font-bold text-[var(--ink)]">{friendById(comment.authorId).name}</span> {comment.body}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex items-center gap-2">
          <GazeAction
            id={`like-${post.id}`}
            agentLabel={`${post.liked ? "Unlike" : "Like"} ${author.name}'s post: "${clip(post.body)}"`}
            aria-pressed={post.liked}
            onClick={() => dispatch({ type: "toggle-like", postId: post.id })}
            className={`${ghostButton} ${post.liked ? "!bg-[var(--cat-pain)] !text-white" : ""}`}
          >
            {post.liked ? "♥ Liked" : "♡ Like"} · {post.likes}
          </GazeAction>
          <GazeAction
            id={`reply-${post.id}`}
            agentLabel={`Reply to ${author.name}'s post: "${clip(post.body)}"`}
            onClick={() => setReplyingTo(replying ? null : post.id)}
            className={ghostButton}
          >
            💬 Reply
          </GazeAction>
        </div>

        {replying && (
          <div className="mt-3 space-y-2">
            <textarea
              rows={2}
              value={drafts.comment}
              onChange={(event) => setDraft("comment", event.target.value)}
              placeholder={`Reply to ${author.name}…`}
              aria-label={`Reply to ${author.name}`}
              data-agent-id="comment-input"
              data-agent-label={`Reply text box for ${author.name}'s post`}
              className={fieldClass}
            />
            <GazeAction
              id="comment-send"
              agentLabel="Send reply"
              disabled={!drafts.comment.trim()}
              onClick={() => sendComment(post.id)}
              className={primaryButton}
            >
              Send reply
            </GazeAction>
          </div>
        )}
      </article>
    );
  };

  const thread = state.threads[threadId] ?? [];

  return (
    <GazeSelectScope
      modal
      label="i-see Social"
      className={brutal.panel}
    >
      <header className={brutal.header}>
        <h2 className={brutal.title}>i-see Social</h2>
        <nav className="flex gap-2" aria-label="Sections">
          <GazeAction id="tab-feed" agentLabel="Open the Feed tab" aria-pressed={tab === "feed"} onClick={() => setTab("feed")}
            className={`${ghostButton} ${tab === "feed" ? brutal.buttonActive : ""}`}>Feed</GazeAction>
          <GazeAction id="tab-messages" agentLabel="Open the Messages tab" aria-pressed={tab === "messages"} onClick={() => setTab("messages")}
            className={`${ghostButton} ${tab === "messages" ? brutal.buttonActive : ""}`}>Messages</GazeAction>
        </nav>
        <div className="ml-auto flex gap-2">
          <GazeAction id="toggle-keyboard" agent={false} aria-pressed={keyboardOpen} onClick={() => setKeyboardOpen((open) => !open)} className={ghostButton}>
            {keyboardOpen ? "Hide gaze keyboard" : "Gaze keyboard"}
          </GazeAction>
          {onClose && (
            <GazeAction id="close-social" agentLabel="Close i-see Social" onClick={onClose} className={ghostButton}>Close ✕</GazeAction>
          )}
        </div>
      </header>

      {showAgentBar && (
      <section aria-label="Ask i-see to do something" className="border-b-4 border-[var(--ink)] bg-[var(--cat-entertainment)]/15 px-5 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className={brutal.label}>Ask i-see to…</p>
          <span className="flex gap-2" role="group" aria-label="Where the agent works">
            {([["browser", "Real browser"], ["inapp", "In this app"]] as const).map(([value, label]) => (
              <GazeAction key={value} id={`agent-mode-${value}`} agent={false} aria-pressed={agent.mode === value}
                disabled={agentBusy} onClick={() => agent.setMode(value)}
                className={`${brutal.chip} !px-3 !py-1 text-xs ${agent.mode === value ? brutal.buttonActive : ""}`}>
                {label}
              </GazeAction>
            ))}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {AGENT_PRESETS.map((goal) => (
            <GazeAction key={goal} id={`intent-${goal}`} agent={false} disabled={agentBusy} onClick={() => agent.run(goal)}
              className={brutal.chip}>
              {goal}
            </GazeAction>
          ))}
          <input
            value={customGoal}
            onChange={(event) => setCustomGoal(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && customGoal.trim() && !agentBusy) { event.stopPropagation(); runCustomGoal(); } }}
            placeholder="…or type any request"
            aria-label="Custom request for i-see"
            className={`${brutal.field} min-w-[14rem] flex-1 !rounded-full !py-2`}
          />
          <GazeAction id="run-custom" agent={false} disabled={agentBusy || !customGoal.trim()} onClick={runCustomGoal}
            className={brutal.buttonPrimary}>Run</GazeAction>
        </div>
      </section>
      )}

      {tab === "feed" ? (
        <div ref={feedRef} {...{ [AGENT_SCROLL_ATTRIBUTE]: "" }} className="mx-auto min-h-0 w-full max-w-2xl flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <section className={`space-y-2 ${brutal.card}`}>
            <textarea
              rows={2}
              value={replyingTo ? "" : drafts.post}
              disabled={Boolean(replyingTo)}
              onChange={(event) => setDraft("post", event.target.value)}
              placeholder="Share something with your friends…"
              aria-label="New post"
              data-agent-id="post-input"
              data-agent-label="New post text box"
              className={fieldClass}
            />
            <GazeAction id="post-send" agentLabel="Publish the post" disabled={!drafts.post.trim()} onClick={publishPost} className={primaryButton}>
              Post
            </GazeAction>
          </section>
          {state.posts.map(renderPost)}
        </div>
      ) : (
        <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col gap-3 px-5 py-4">
          <div className="flex gap-2">
            {THREAD_IDS.map((friendId) => (
              <GazeAction key={friendId} id={`thread-${friendId}`} agentLabel={`Open the conversation with ${friendById(friendId).name}`}
                aria-pressed={threadId === friendId} onClick={() => setThreadId(friendId)}
                className={`${ghostButton} ${threadId === friendId ? brutal.buttonActive : ""}`}>
                {friendById(friendId).name}
              </GazeAction>
            ))}
          </div>
          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-2xl border-[3px] border-[var(--ink)] bg-white p-4 shadow-[4px_4px_0_var(--ink)]" aria-label={`Conversation with ${friendById(threadId).name}`}>
            {thread.length === 0 && <li className="text-sm font-semibold text-[var(--iris-text-secondary)]">No messages yet. Say hello!</li>}
            {thread.map((message) => (
              <li key={message.id} className={`flex ${message.from === ME ? "justify-end" : "justify-start"}`}>
                <span className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${message.from === ME ? "border-2 border-[var(--ink)] bg-[var(--btn-purple)] text-white" : "border-2 border-[var(--ink)] bg-[var(--iris-surface-raised)]"}`}>{message.body}</span>
              </li>
            ))}
          </ul>
          <textarea
            rows={2}
            value={drafts.message}
            onChange={(event) => setDraft("message", event.target.value)}
            placeholder={`Message ${friendById(threadId).name}…`}
            aria-label={`Message ${friendById(threadId).name}`}
            data-agent-id="message-input"
            data-agent-label={`Message text box for ${friendById(threadId).name}`}
            className={fieldClass}
          />
          <GazeAction id="message-send" agentLabel="Send the message" disabled={!drafts.message.trim()} onClick={sendMessage} className={primaryButton}>
            Send
          </GazeAction>
        </div>
      )}

      {keyboardOpen && (
        <div className="max-h-[45vh] overflow-y-auto border-t-4 border-[var(--ink)] bg-white">
          <MindReaderKeyboard key={`${keyboardEpoch}-${activeField}`} onTextChange={handleKeyboardText} />
        </div>
      )}
    </GazeSelectScope>
  );
}
