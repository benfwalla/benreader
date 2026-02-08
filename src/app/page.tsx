"use client";

import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useState, useCallback, useRef } from "react";

type Filter =
  | { type: "all" }
  | { type: "starred" }
  | { type: "folder"; folderId: Id<"brFolders"> }
  | { type: "feed"; feedId: Id<"brFeeds"> };

export default function Home() {
  const [filter, setFilter] = useState<Filter>({ type: "all" });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showAddFeed, setShowAddFeed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showImport, setShowImport] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-72 bg-[var(--bg-secondary)] border-r border-[var(--border)] flex flex-col transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <Sidebar
          filter={filter}
          setFilter={(f) => {
            setFilter(f);
            setSidebarOpen(false);
          }}
          onAddFeed={() => setShowAddFeed(true)}
          onImport={() => setShowImport(true)}
          onSettings={() => setShowSettings(true)}
        />
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0">
        <Header
          onMenuClick={() => setSidebarOpen(true)}
          filter={filter}
        />
        <PostList filter={filter} />
      </main>

      {/* Bottom nav on mobile */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[var(--bg-card)] border-t border-[var(--border)] flex lg:hidden z-20 pb-[env(safe-area-inset-bottom)]">
        <button
          onClick={() => setFilter({ type: "all" })}
          className={`flex-1 py-3 text-xs font-medium flex flex-col items-center gap-1 ${
            filter.type === "all"
              ? "text-[var(--accent)]"
              : "text-[var(--text-muted)]"
          }`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
          All
        </button>
        <button
          onClick={() => setFilter({ type: "starred" })}
          className={`flex-1 py-3 text-xs font-medium flex flex-col items-center gap-1 ${
            filter.type === "starred"
              ? "text-[var(--accent)]"
              : "text-[var(--text-muted)]"
          }`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill={filter.type === "starred" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          Starred
        </button>
        <button
          onClick={() => setSidebarOpen(true)}
          className="flex-1 py-3 text-xs font-medium flex flex-col items-center gap-1 text-[var(--text-muted)]"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          Folders
        </button>
      </nav>

      {/* Modals */}
      {showAddFeed && <AddFeedModal onClose={() => setShowAddFeed(false)} />}
      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function Sidebar({
  filter,
  setFilter,
  onAddFeed,
  onImport,
  onSettings,
}: {
  filter: Filter;
  setFilter: (f: Filter) => void;
  onAddFeed: () => void;
  onImport: () => void;
  onSettings: () => void;
}) {
  const folders = useQuery(api.folders.list, {});
  const feeds = useQuery(api.feeds.list, {});

  const getFeedsInFolder = (folderId: Id<"brFolders">) =>
    feeds?.filter((f) => f.folderId === folderId) ?? [];

  return (
    <>
      <div className="p-5 border-b border-[var(--border)]">
        <h1
          className="text-xl font-bold tracking-tight"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          📖 BenReader
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto py-3">
        <SidebarItem
          label="All Posts"
          icon="📚"
          active={filter.type === "all"}
          onClick={() => setFilter({ type: "all" })}
        />
        <SidebarItem
          label="Starred"
          icon="⭐"
          active={filter.type === "starred"}
          onClick={() => setFilter({ type: "starred" })}
        />

        <div className="mt-4 mb-2 px-5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            Folders
          </span>
        </div>

        {folders?.map((folder) => (
          <div key={folder._id}>
            <SidebarItem
              label={folder.name}
              icon="📁"
              count={getFeedsInFolder(folder._id).length}
              active={
                filter.type === "folder" && filter.folderId === folder._id
              }
              onClick={() =>
                setFilter({ type: "folder", folderId: folder._id })
              }
            />
            {filter.type === "folder" &&
              filter.folderId === folder._id &&
              getFeedsInFolder(folder._id).map((feed) => (
                <button
                  key={feed._id}
                  onClick={() => setFilter({ type: "feed", feedId: feed._id })}
                  className="w-full text-left pl-12 pr-5 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--border)]/50 truncate transition-colors"
                >
                  {feed.title}
                </button>
              ))}
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-[var(--border)] flex flex-col gap-1">
        <button
          onClick={onAddFeed}
          className="w-full py-2 px-3 text-sm rounded-lg bg-[var(--accent)] text-white font-medium hover:bg-[var(--accent-hover)] transition-colors"
        >
          + Add Feed
        </button>
        <div className="flex gap-1">
          <button
            onClick={onImport}
            className="flex-1 py-2 text-xs rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)] transition-colors"
          >
            Import OPML
          </button>
          <button
            onClick={onSettings}
            className="flex-1 py-2 text-xs rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)] transition-colors"
          >
            ⚙ Settings
          </button>
        </div>
      </div>
    </>
  );
}

function SidebarItem({
  label,
  icon,
  count,
  active,
  onClick,
}: {
  label: string;
  icon: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-5 py-2.5 flex items-center gap-3 text-sm transition-colors ${
        active
          ? "bg-[var(--accent)]/10 text-[var(--accent)] font-medium"
          : "text-[var(--text-primary)] hover:bg-[var(--border)]/50"
      }`}
    >
      <span className="text-base">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && (
        <span className="text-xs text-[var(--text-muted)]">{count}</span>
      )}
    </button>
  );
}

function Header({
  onMenuClick,
  filter,
}: {
  onMenuClick: () => void;
  filter: Filter;
}) {
  const refreshAll = useAction(api.feedActions.refreshAll);
  const markAllRead = useMutation(api.posts.markAllRead);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshAll({});
    } catch (e) {
      console.error(e);
    }
    setRefreshing(false);
  };

  const handleMarkAllRead = () => {
    const args: Record<string, unknown> = {};
    if (filter.type === "feed") args.feedId = filter.feedId;
    if (filter.type === "folder") args.folderId = filter.folderId;
    markAllRead(args as any);
  };

  const title =
    filter.type === "all"
      ? "All Posts"
      : filter.type === "starred"
        ? "Starred"
        : filter.type === "folder"
          ? "Folder"
          : "Feed";

  return (
    <header className="sticky top-0 z-10 bg-[var(--bg-primary)]/90 backdrop-blur-md border-b border-[var(--border)] px-4 lg:px-6 py-3 flex items-center gap-3">
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 -ml-2 text-[var(--text-secondary)]"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>

      <h2
        className="text-lg font-semibold flex-1"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        {title}
      </h2>

      <button
        onClick={handleMarkAllRead}
        className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)] transition-colors"
      >
        Mark all read
      </button>

      <button
        onClick={handleRefresh}
        disabled={refreshing}
        className={`px-3 py-1.5 text-xs rounded-lg bg-[var(--accent)] text-white font-medium hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 ${
          refreshing ? "animate-pulse" : ""
        }`}
      >
        {refreshing ? "Refreshing…" : "↻ Refresh"}
      </button>
    </header>
  );
}

function PostList({ filter }: { filter: Filter }) {
  const posts = useQuery(api.posts.list, {
    feedId: filter.type === "feed" ? filter.feedId : undefined,
    folderId: filter.type === "folder" ? filter.folderId : undefined,
    starredOnly: filter.type === "starred" ? true : undefined,
    limit: 100,
  });

  const markRead = useMutation(api.posts.markRead);
  const toggleStar = useMutation(api.posts.toggleStar);

  if (!posts) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--text-muted)]">
        <div className="animate-pulse">Loading…</div>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-muted)] gap-2 px-4">
        <span className="text-4xl">📭</span>
        <p className="text-sm">No posts yet. Add some feeds or hit refresh!</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pb-20 lg:pb-4">
      <div className="max-w-3xl mx-auto px-4 lg:px-6 py-4 space-y-3">
        {posts.map((post, i) => (
          <article
            key={post._id}
            className="animate-fade-in"
            style={{ animationDelay: `${i * 30}ms` }}
          >
            <div
              className={`bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-4 lg:p-5 hover:shadow-md transition-all cursor-pointer group ${
                post.isRead ? "opacity-60" : ""
              }`}
              onClick={() => {
                if (!post.isRead) markRead({ postId: post._id });
                window.open(post.url, "_blank");
              }}
            >
              <div className="flex gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-medium text-[var(--accent)] truncate">
                      {post.feedTitle}
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">·</span>
                    <span className="text-xs text-[var(--text-muted)] whitespace-nowrap">
                      {formatDate(post.publishedAt)}
                    </span>
                    {post.isPaywalled && (
                      <span title="Paywalled" className="text-sm">🔒</span>
                    )}
                  </div>

                  <h3
                    className="font-semibold text-base lg:text-lg leading-snug mb-2 group-hover:text-[var(--accent)] transition-colors line-clamp-2"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    {decodeEntities(post.title)}
                  </h3>

                  {post.content && (
                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed line-clamp-2">
                      {decodeEntities(post.content.slice(0, 150))}
                    </p>
                  )}

                  {post.author && post.author !== "[object Object]" && (
                    <p className="text-xs text-[var(--text-muted)] mt-2">
                      by {post.author}
                    </p>
                  )}
                </div>

                {post.imageUrl && (
                  <div className="flex-shrink-0">
                    <img
                      src={post.imageUrl}
                      alt=""
                      className="w-20 h-20 sm:w-24 sm:h-24 lg:w-28 lg:h-28 object-cover rounded-lg"
                      loading="lazy"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)]/50">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleStar({ postId: post._id });
                  }}
                  className={`p-1.5 rounded-lg transition-colors ${
                    post.isStarred
                      ? "text-[var(--star-color)]"
                      : "text-[var(--text-muted)] hover:text-[var(--star-color)]"
                  }`}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill={post.isStarred ? "currentColor" : "none"}
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </button>

                {!post.isRead && (
                  <span className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function AddFeedModal({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [folderId, setFolderId] = useState<Id<"brFolders"> | "">("");
  const folders = useQuery(api.folders.list, {});
  const addFeed = useMutation(api.feeds.add);
  const refreshFeed = useAction(api.feedActions.refreshFeed);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url || !folderId) return;

    const feedId = await addFeed({
      title: url,
      xmlUrl: url,
      htmlUrl: url,
      folderId: folderId as Id<"brFolders">,
    });

    try {
      await refreshFeed({ feedId });
    } catch {}

    onClose();
  };

  return (
    <Modal onClose={onClose} title="Add Feed">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">RSS URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/feed.xml"
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Folder</label>
          <select
            value={folderId}
            onChange={(e) => setFolderId(e.target.value as Id<"brFolders">)}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            required
          >
            <option value="">Select folder…</option>
            {folders?.map((f) => (
              <option key={f._id} value={f._id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="w-full py-2 rounded-lg bg-[var(--accent)] text-white font-medium hover:bg-[var(--accent-hover)] transition-colors"
        >
          Add Feed
        </button>
      </form>
    </Modal>
  );
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const importOPML = useAction(api.feedActions.importOPML);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImport = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setImporting(true);
    const text = await file.text();
    try {
      await importOPML({ opmlXml: text });
    } catch (e) {
      console.error(e);
    }
    setImporting(false);
    onClose();
  };

  return (
    <Modal onClose={onClose} title="Import OPML">
      <div className="space-y-4">
        <input
          ref={fileRef}
          type="file"
          accept=".opml,.xml"
          className="w-full text-sm"
        />
        <button
          onClick={handleImport}
          disabled={importing}
          className="w-full py-2 rounded-lg bg-[var(--accent)] text-white font-medium hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
        >
          {importing ? "Importing…" : "Import"}
        </button>
      </div>
    </Modal>
  );
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const bgColor = useQuery(api.settings.get, { key: "bgColor" });
  const setSetting = useMutation(api.settings.set);

  const colors = [
    { name: "Warm Beige", value: "#F5F0E8" },
    { name: "Cool White", value: "#F8F9FA" },
    { name: "Soft Sage", value: "#E8EDE5" },
    { name: "Pale Rose", value: "#F5E8E8" },
    { name: "Night", value: "#1A1A2E" },
    { name: "Warm Dark", value: "#2C2418" },
  ];

  const applyBg = (color: string) => {
    document.documentElement.style.setProperty("--bg-primary", color);
    setSetting({ key: "bgColor", value: color });
  };

  return (
    <Modal onClose={onClose} title="Settings">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            Background Color
          </label>
          <div className="grid grid-cols-3 gap-2">
            {colors.map((c) => (
              <button
                key={c.value}
                onClick={() => applyBg(c.value)}
                className={`p-3 rounded-lg border-2 transition-colors text-xs font-medium ${
                  (bgColor ?? "#F5F0E8") === c.value
                    ? "border-[var(--accent)]"
                    : "border-[var(--border)]"
                }`}
                style={{ backgroundColor: c.value, color: c.value === "#1A1A2E" || c.value === "#2C2418" ? "#fff" : "#2C2418" }}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Modal({
  onClose,
  title,
  children,
}: {
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-6 w-full max-w-md animate-fade-in shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3
            className="text-lg font-semibold"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {title}
          </h3>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
