"use client";

import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useState, useRef, useEffect } from "react";
import DOMPurify from "dompurify";
import {
  House,
  Star,
  SquaresFour,
  List,
  ArrowsClockwise,
  LockSimple,
  ArrowLeft,
  ArrowSquareOut,
  X,
} from "@phosphor-icons/react";

type Filter =
  | { type: "all" }
  | { type: "starred" }
  | { type: "folder"; folderId: Id<"brFolders"> }
  | { type: "feed"; feedId: Id<"brFeeds"> };

type ReaderPost = {
  _id: Id<"brPosts">;
  title: string;
  url: string;
  feedTitle: string;
  publishedAt: number;
  author?: string;
  isStarred: boolean;
  isPaywalled: boolean;
};

export default function Home() {
  const [filter, setFilter] = useState<Filter | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showAddFeed, setShowAddFeed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [readerPost, setReaderPost] = useState<ReaderPost | null>(null);
  const folders = useQuery(api.folders.list, {});

  // Default to "Blogs" folder
  useEffect(() => {
    if (filter === null && folders) {
      const blogsFolder = folders.find((f) => f.name.toLowerCase() === "blogs");
      if (blogsFolder) {
        setFilter({ type: "folder", folderId: blogsFolder._id });
      } else {
        setFilter({ type: "all" });
      }
    }
  }, [folders, filter]);

  const activeFilter = filter ?? ({ type: "all" } as Filter);

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
        className={`fixed lg:static inset-y-0 left-0 z-40 w-72 sidebar flex flex-col transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <Sidebar
          filter={activeFilter}
          setFilter={(f) => {
            setFilter(f);
            setSidebarOpen(false);
            setReaderPost(null);
          }}
          onAddFeed={() => setShowAddFeed(true)}
          onImport={() => setShowImport(true)}
          onSettings={() => setShowSettings(true)}
        />
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0">
        {readerPost ? (
          <ArticleReader
            post={readerPost}
            onClose={() => setReaderPost(null)}
          />
        ) : (
          <>
            <Header
              onMenuClick={() => setSidebarOpen(true)}
              filter={activeFilter}
            />
            <PostList
              filter={activeFilter}
              onOpenPost={setReaderPost}
              onFilterFeed={(feedId) => {
                setFilter({ type: "feed", feedId });
              }}
            />
          </>
        )}
      </main>

      {/* Bottom nav on mobile */}
      {!readerPost && (
        <nav className="fixed bottom-0 left-0 right-0 bottom-nav lg:hidden z-20">
          <button
            onClick={() => { setFilter({ type: "all" }); setReaderPost(null); }}
            className={`bottom-nav-item ${activeFilter.type === "all" ? "active" : ""}`}
          >
            <House size={22} weight={activeFilter.type === "all" ? "fill" : "regular"} />
            All
          </button>
          <button
            onClick={() => { setFilter({ type: "starred" }); setReaderPost(null); }}
            className={`bottom-nav-item ${activeFilter.type === "starred" ? "active" : ""}`}
          >
            <Star size={22} weight={activeFilter.type === "starred" ? "fill" : "regular"} />
            Starred
          </button>
          <button
            onClick={() => setSidebarOpen(true)}
            className="bottom-nav-item"
          >
            <SquaresFour size={22} />
            Folders
          </button>
        </nav>
      )}

      {/* Modals */}
      {showAddFeed && <AddFeedModal onClose={() => setShowAddFeed(false)} />}
      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

/* ──────────────────── Article Reader ──────────────────── */

function ArticleReader({
  post,
  onClose,
}: {
  post: ReaderPost;
  onClose: () => void;
}) {
  const fetchArticle = useAction(api.articles.fetch);
  const toggleStar = useMutation(api.posts.toggleStar);
  const [article, setArticle] = useState<{
    title: string;
    content: string;
    byline?: string;
    siteName?: string;
    length?: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setArticle(null);

    fetchArticle({ url: post.url })
      .then((result) => {
        if (cancelled) return;
        if (result) {
          setArticle({
            title: result.title,
            content: result.content,
            byline: result.byline ?? undefined,
            siteName: result.siteName ?? undefined,
            length: result.length,
          });
        } else {
          setError(true);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [post.url, fetchArticle]);

  // Scroll to top when article loads
  useEffect(() => {
    contentRef.current?.scrollTo(0, 0);
  }, [article]);

  return (
    <div className="flex flex-col h-full">
      {/* Reader header */}
      <header className="reader-header">
        <button onClick={onClose} className="reader-back-btn">
          <ArrowLeft size={20} />
          <span className="hidden sm:inline">Back</span>
        </button>
        <div className="flex-1 min-w-0">
          <span className="text-xs text-accent font-medium truncate block">
            {post.feedTitle}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => toggleStar({ postId: post._id })}
            className="p-2 rounded-lg transition-colors"
            style={{ color: post.isStarred ? "var(--star-color)" : "var(--text-muted)" }}
          >
            <Star size={20} weight={post.isStarred ? "fill" : "regular"} />
          </button>
          <a
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
            className="reader-external-link"
            title="Open original"
          >
            <ArrowSquareOut size={20} />
          </a>
        </div>
      </header>

      {/* Article content */}
      <div ref={contentRef} className="flex-1 overflow-y-auto pb-20 lg:pb-8">
        <article className="reader-article">
          {/* Article meta */}
          <div className="reader-meta">
            <h1 className="reader-title">{decodeEntities(post.title)}</h1>
            <div className="reader-byline">
              {(article?.byline || post.author) && (
                <span>{article?.byline || post.author}</span>
              )}
              {(article?.byline || post.author) && <span className="text-muted">·</span>}
              <span className="text-muted">{post.feedTitle}</span>
              <span className="text-muted">·</span>
              <time className="text-muted">{formatDateLong(post.publishedAt)}</time>
              {article?.length && (
                <>
                  <span className="text-muted">·</span>
                  <span className="text-muted">{estimateReadingTime(article.length)}</span>
                </>
              )}
              {post.isPaywalled && (
                <span className="reader-paywall-badge">
                  <LockSimple size={12} weight="fill" /> Paywall
                </span>
              )}
            </div>
          </div>

          {/* Article body */}
          {loading && (
            <div className="reader-loading">
              <div className="reader-skeleton" />
              <div className="reader-skeleton short" />
              <div className="reader-skeleton" />
              <div className="reader-skeleton medium" />
              <div className="reader-skeleton" />
            </div>
          )}

          {error && (
            <div className="reader-error">
              <p>Couldn't load this article in the reader.</p>
              <a
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-accent inline-flex items-center gap-2 mt-3"
                style={{ padding: "10px 20px" }}
              >
                <ArrowSquareOut size={16} />
                Read on {article?.siteName || post.feedTitle}
              </a>
            </div>
          )}

          {article && !loading && (
            <div
              className="reader-content"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(article.content, {
                  ADD_TAGS: ["iframe"],
                  ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "scrolling", "loading"],
                }),
              }}
            />
          )}
        </article>
      </div>
    </div>
  );
}

/* ──────────────────── Sidebar ──────────────────── */

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
      <div className="sidebar-header">
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "1.25rem",
            fontWeight: 700,
            letterSpacing: "-0.01em",
          }}
        >
          📖 BenReader
        </h1>
      </div>

      <div style={{ flex: 1, overflowY: "auto", paddingTop: 12, paddingBottom: 12 }}>
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

        <div className="sidebar-section-label">Folders</div>

        {folders?.map((folder) => (
          <div key={folder._id}>
            <SidebarItem
              label={folder.name}
              icon="📁"
              count={getFeedsInFolder(folder._id).length}
              active={filter.type === "folder" && filter.folderId === folder._id}
              onClick={() => setFilter({ type: "folder", folderId: folder._id })}
            />
            {filter.type === "folder" &&
              filter.folderId === folder._id &&
              getFeedsInFolder(folder._id).map((feed) => (
                <button
                  key={feed._id}
                  onClick={() => setFilter({ type: "feed", feedId: feed._id })}
                  className={`sidebar-sub-item`}
                >
                  {feed.title}
                </button>
              ))}
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <button onClick={onAddFeed} className="btn-accent" style={{ padding: "8px 12px", fontSize: 14 }}>
          + Add Feed
        </button>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={onImport} className="btn-outline" style={{ flex: 1, padding: "8px 0" }}>
            Import OPML
          </button>
          <button onClick={onSettings} className="btn-outline" style={{ flex: 1, padding: "8px 0" }}>
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
      className={`sidebar-item ${active ? "active" : ""}`}
    >
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
      {count !== undefined && (
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{count}</span>
      )}
    </button>
  );
}

/* ──────────────────── Header ──────────────────── */

function Header({
  onMenuClick,
  filter,
}: {
  onMenuClick: () => void;
  filter: Filter;
}) {
  const refreshAll = useAction(api.feedActions.refreshAll);
  const markAllRead = useMutation(api.posts.markAllRead);
  const folders = useQuery(api.folders.list, {});
  const feeds = useQuery(api.feeds.list, {});
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

  let title = "All Posts";
  if (filter.type === "starred") title = "Starred";
  else if (filter.type === "folder") {
    const folder = folders?.find((f) => f._id === filter.folderId);
    title = folder?.name ?? "Folder";
  } else if (filter.type === "feed") {
    const feed = feeds?.find((f) => f._id === filter.feedId);
    title = feed?.title ?? "Feed";
  }

  return (
    <header className="header-bar">
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 -ml-2"
        style={{ color: "var(--text-secondary)" }}
      >
        <List size={24} />
      </button>

      <h2 className="text-lg font-semibold flex-1 min-w-0 truncate" style={{ fontFamily: "var(--font-serif)" }}>
        {title}
      </h2>

      <button onClick={handleMarkAllRead} className="btn-outline">
        Mark all read
      </button>

      <button
        onClick={handleRefresh}
        disabled={refreshing}
        className={`btn-accent ${refreshing ? "animate-pulse" : ""}`}
      >
        <ArrowsClockwise
          size={14}
          className={refreshing ? "animate-spin" : ""}
          style={{ display: "inline", marginRight: 4 }}
        />
        {refreshing ? "Refreshing…" : "Refresh"}
      </button>
    </header>
  );
}

/* ──────────────────── Post List ──────────────────── */

function PostList({
  filter,
  onOpenPost,
  onFilterFeed,
}: {
  filter: Filter;
  onOpenPost: (post: ReaderPost) => void;
  onFilterFeed: (feedId: Id<"brFeeds">) => void;
}) {
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
      <div className="flex-1 flex items-center justify-center text-muted">
        <div className="animate-pulse">Loading…</div>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted gap-2 px-4">
        <span className="text-4xl">📭</span>
        <p className="text-sm">No posts yet. Add some feeds or hit refresh!</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pb-20 lg:pb-4">
      <div className="feed-list">
        {posts.map((post, i) => (
          <article key={post._id} className="animate-fade-in" style={{ animationDelay: `${i * 30}ms` }}>
            <div
              className={`post-card group ${post.isRead ? "read" : ""}`}
              onClick={() => {
                if (!post.isRead) markRead({ postId: post._id });
                onOpenPost({
                  _id: post._id,
                  title: post.title,
                  url: post.url,
                  feedTitle: post.feedTitle,
                  publishedAt: post.publishedAt,
                  author: post.author,
                  isStarred: post.isStarred,
                  isPaywalled: post.isPaywalled,
                });
              }}
            >
              <div className="flex gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <button
                      className="text-xs font-medium text-accent truncate hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onFilterFeed(post.feedId);
                      }}
                    >
                      {post.feedTitle}
                    </button>
                    <span className="text-xs text-muted">·</span>
                    <span className="text-xs text-muted whitespace-nowrap">
                      {formatDate(post.publishedAt)}
                    </span>
                    {post.wordCount && post.wordCount > 0 && (
                      <>
                        <span className="text-xs text-muted">·</span>
                        <span className="text-xs text-muted whitespace-nowrap">
                          {estimateReadingTime(post.wordCount)}
                        </span>
                      </>
                    )}
                    {post.isPaywalled && (
                      <span
                        title="Paywalled"
                        style={{ color: "var(--text-muted)", display: "inline-flex", alignItems: "center" }}
                      >
                        <LockSimple size={14} weight="fill" />
                      </span>
                    )}
                  </div>

                  <h3
                    className="font-semibold text-base lg:text-lg leading-snug mb-2 group-hover:text-accent transition-colors line-clamp-2"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    {decodeEntities(post.title)}
                  </h3>

                  {post.content && (
                    <p className="text-sm text-secondary leading-relaxed line-clamp-2">
                      {decodeEntities(post.content.slice(0, 150))}
                    </p>
                  )}

                  {post.author && post.author !== "[object Object]" && (
                    <p className="text-xs text-muted mt-2">by {post.author}</p>
                  )}
                </div>

                {(post.imageUrl || post.feedImageUrl) && (
                  <div className="flex-shrink-0">
                    <img
                      src={post.imageUrl || post.feedImageUrl}
                      alt=""
                      className={`rounded-lg object-cover ${
                        post.imageUrl
                          ? "w-20 h-20 sm:w-24 sm:h-24 lg:w-28 lg:h-28"
                          : "w-10 h-10 sm:w-12 sm:h-12"
                      }`}
                      loading="lazy"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between card-divider">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleStar({ postId: post._id });
                  }}
                  className="p-1.5 rounded-lg transition-colors"
                  style={{ color: post.isStarred ? "var(--star-color)" : "var(--text-muted)" }}
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
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--accent)" }} />
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

/* ──────────────────── Modals ──────────────────── */

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
            className="form-input"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Folder</label>
          <select
            value={folderId}
            onChange={(e) => setFolderId(e.target.value as Id<"brFolders">)}
            className="form-input"
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
        <button type="submit" className="btn-accent w-full py-2">
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
        <input ref={fileRef} type="file" accept=".opml,.xml" className="w-full text-sm" />
        <button onClick={handleImport} disabled={importing} className="btn-accent w-full py-2">
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
          <label className="block text-sm font-medium mb-2">Background Color</label>
          <div className="grid grid-cols-3 gap-2">
            {colors.map((c) => (
              <button
                key={c.value}
                onClick={() => applyBg(c.value)}
                className={`color-swatch ${(bgColor ?? "#F5F0E8") === c.value ? "active" : ""}`}
                style={{
                  backgroundColor: c.value,
                  color: c.value === "#1A1A2E" || c.value === "#2C2418" ? "#fff" : "#2C2418",
                }}
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
      <div className="relative modal-card animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold" style={{ fontFamily: "var(--font-serif)" }}>
            {title}
          </h3>
          <button onClick={onClose} className="text-muted transition-colors">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ──────────────────── Helpers ──────────────────── */

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

function estimateReadingTime(wordCount: number): string {
  const mins = Math.max(1, Math.round(wordCount / 238));
  return `${mins} min read`;
}

function formatDateLong(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
