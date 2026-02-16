"use client";

import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useState, useRef, useEffect, useCallback } from "react";
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
  Article,
  ClockCounterClockwise,
} from "@phosphor-icons/react";

type Filter =
  | { type: "all" }
  | { type: "starred" }
  | { type: "history" }
  | { type: "folder"; folderId: Id<"brFolders"> }
  | { type: "feed"; feedId: Id<"brFeeds"> };

type ReaderPost = {
  _id: Id<"brPosts">;
  title: string;
  url: string;
  feedTitle: string;
  feedHtmlUrl?: string;
  feedImageUrl?: string;
  feedBrandColor?: string;
  publishedAt: number;
  isStarred: boolean;
  isPaywalled: boolean;
};

export default function Home() {
  const [filter, setFilter] = useState<Filter | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showAddFeed, setShowAddFeed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [readerPost, setReaderPost] = useState<ReaderPost | null>(null);
  const savedScrollTop = useRef(0);
  const readerPostRef = useRef<ReaderPost | null>(null);
  const folders = useQuery(api.folders.list, {});
  const markAllRead = useMutation(api.posts.markAllRead);

  // Sync ref with state for popstate handler
  useEffect(() => {
    readerPostRef.current = readerPost;
  }, [readerPost]);

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (e.state?.post) {
        setReaderPost(e.state.post);
      } else {
        setReaderPost(null);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Open a post with history entry
  const openPost = useCallback((post: ReaderPost) => {
    window.history.pushState({ post }, "", `?post=${post._id}`);
    setReaderPost(post);
  }, []);

  // Close post and go back in history
  const closePost = useCallback(() => {
    if (readerPostRef.current) {
      window.history.back();
    }
  }, []);

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
            if (readerPost) {
              window.history.replaceState(null, "", "/");
            }
            setReaderPost(null);
          }}
          onAddFeed={() => setShowAddFeed(true)}
          onImport={() => setShowImport(true)}
          onSettings={() => setShowSettings(true)}
          onMarkRead={() => {
            const args: Record<string, unknown> = {};
            if (activeFilter.type === "feed") args.feedId = activeFilter.feedId;
            if (activeFilter.type === "folder") args.folderId = activeFilter.folderId;
            markAllRead(args as any);
          }}
          onMarkUnread={() => {
            const args: Record<string, unknown> = { unread: true };
            if (activeFilter.type === "feed") args.feedId = activeFilter.feedId;
            if (activeFilter.type === "folder") args.folderId = activeFilter.folderId;
            markAllRead(args as any);
          }}
        />
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0">
        {readerPost ? (
          <ArticleReader
            post={readerPost}
            onClose={closePost}
          />
        ) : (
          <>
            <Header
              onMenuClick={() => setSidebarOpen(true)}
              filter={activeFilter}
            />
            <PostList
              filter={activeFilter}
              onOpenPost={openPost}
              onFilterFeed={(feedId) => {
                setFilter({ type: "feed", feedId });
              }}
              savedScrollTop={savedScrollTop}
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
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <BlogIcon htmlUrl={post.feedHtmlUrl} imageUrl={post.feedImageUrl} size={18} />
          <BlogName name={post.feedTitle} brandColor={post.feedBrandColor} className="text-sm text-accent font-medium truncate" />
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
            <a href={post.url} target="_blank" rel="noopener noreferrer" className="reader-title hover:underline">{decodeEntities(post.title)}</a>
            <div className="reader-byline">
              <BlogName name={post.feedTitle} brandColor={post.feedBrandColor} className="text-muted" />
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
  onMarkRead,
  onMarkUnread,
}: {
  filter: Filter;
  setFilter: (f: Filter) => void;
  onAddFeed: () => void;
  onImport: () => void;
  onSettings: () => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
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
          BenReader
        </h1>
      </div>

      <div style={{ flex: 1, overflowY: "auto", paddingTop: 12, paddingBottom: 12 }}>
        <SidebarItem
          label="All Posts"
          icon={<Article size={16} />}
          active={filter.type === "all"}
          onClick={() => setFilter({ type: "all" })}
        />
        <SidebarItem
          label="Starred"
          icon={<Star size={16} />}
          active={filter.type === "starred"}
          onClick={() => setFilter({ type: "starred" })}
        />
        <SidebarItem
          label="History"
          icon={<ClockCounterClockwise size={16} />}
          active={filter.type === "history"}
          onClick={() => setFilter({ type: "history" })}
        />

        <div className="sidebar-section-label">Folders</div>

        {folders?.map((folder) => (
          <div key={folder._id}>
            <SidebarItem
              label={folder.name}
              icon="📁"
              count={getFeedsInFolder(folder._id).length}
              active={filter.type === "folder" && filter.folderId === folder._id}
              onClick={() => {
                setFilter({ type: "folder", folderId: folder._id });
                setExpandedFolders((prev) => {
                  const next = new Set(prev);
                  if (next.has(folder._id)) {
                    next.delete(folder._id);
                  } else {
                    next.add(folder._id);
                  }
                  return next;
                });
              }}
            />
            {expandedFolders.has(folder._id) &&
              getFeedsInFolder(folder._id).map((feed) => (
                <button
                  key={feed._id}
                  onClick={() => setFilter({ type: "feed", feedId: feed._id })}
                  className={`sidebar-sub-item`}
                >
                  <BlogIcon htmlUrl={feed.htmlUrl} imageUrl={feed.imageUrl} size={14} />
                  <span className="truncate">{feed.title}</span>
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
          <button onClick={onMarkRead} className="btn-outline" style={{ flex: 1, padding: "8px 0" }}>
            Mark read
          </button>
          <button onClick={onMarkUnread} className="btn-outline" style={{ flex: 1, padding: "8px 0" }}>
            Mark unread
          </button>
        </div>
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
  icon: React.ReactNode;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`sidebar-item ${active ? "active" : ""}`}
    >
      <span style={{ fontSize: 16, display: "flex", alignItems: "center" }}>{icon}</span>
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

  let title = "All Posts";
  if (filter.type === "starred") title = "Starred";
  else if (filter.type === "history") title = "History";
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
  savedScrollTop,
}: {
  filter: Filter;
  onOpenPost: (post: ReaderPost) => void;
  onFilterFeed: (feedId: Id<"brFeeds">) => void;
  savedScrollTop: React.MutableRefObject<number>;
}) {
  const posts = useQuery(api.posts.list, {
    feedId: filter.type === "feed" ? filter.feedId : undefined,
    folderId: filter.type === "folder" ? filter.folderId : undefined,
    starredOnly: filter.type === "starred" ? true : undefined,
    historyOnly: filter.type === "history" ? true : undefined,
    limit: 200,
  });

  const markRead = useMutation(api.posts.markRead);
  const toggleStar = useMutation(api.posts.toggleStar);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Save scroll position continuously
  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      savedScrollTop.current = scrollRef.current.scrollTop;
    }
  }, [savedScrollTop]);

  // Restore scroll position after posts load
  useEffect(() => {
    if (posts && posts.length > 0 && scrollRef.current && savedScrollTop.current > 0) {
      scrollRef.current.scrollTop = savedScrollTop.current;
    }
  }, [posts, savedScrollTop]);

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
    <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto pb-36 lg:pb-4">
      <div className="feed-list">
        {posts.map((post, i) => (
          <article key={post._id} className={i < 20 ? "animate-fade-in" : ""} style={i < 20 ? { animationDelay: `${i * 30}ms` } : undefined}>
            <div
              className={`post-card group ${post.isRead ? "read" : ""}`}
              onClick={() => {
                if (!post.isRead) markRead({ postId: post._id });
                onOpenPost({
                  _id: post._id,
                  title: post.title,
                  url: post.url,
                  feedTitle: post.feedTitle,
                  feedHtmlUrl: post.feedHtmlUrl,
                  feedImageUrl: post.feedImageUrl,
                  feedBrandColor: post.feedBrandColor,
                  publishedAt: post.publishedAt,
                  isStarred: post.isStarred,
                  isPaywalled: post.isPaywalled,
                });
              }}
            >
              {/* Blog name + thumbnail */}
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <button
                    className="text-xs font-medium truncate hover:underline inline-flex items-center gap-1.5 mb-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      onFilterFeed(post.feedId);
                    }}
                  >
                    <BlogIcon htmlUrl={post.feedHtmlUrl} size={14} />
                    <BlogName name={post.feedTitle} brandColor={post.feedBrandColor} className="text-accent" />
                  </button>

                  <h3
                    className={`font-semibold text-base lg:text-lg leading-snug group-hover:text-accent transition-colors line-clamp-2 ${post.content ? "mb-1.5" : "mb-4"}`}
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    {decodeEntities(post.title)}
                  </h3>

                  {post.content && (
                    <p className="text-sm text-secondary leading-relaxed line-clamp-2 mb-4">
                      {decodeEntities(post.content.slice(0, 150))}
                    </p>
                  )}
                </div>

                {post.imageUrl && (
                  <img
                    src={post.imageUrl}
                    alt=""
                    className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg object-cover flex-shrink-0"
                    loading="lazy"
                  />
                )}
              </div>

              {/* Meta row: date · read time · paywall on left, star on right */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-muted">
                  <span>{formatDate(post.publishedAt)}</span>
                  {post.wordCount && post.wordCount > 0 && (
                    <>
                      <span>·</span>
                      <span>{estimateReadingTime(post.wordCount)}</span>
                    </>
                  )}
                  {post.isPaywalled && (
                    <>
                      <span>·</span>
                      <LockSimple size={12} weight="fill" />
                    </>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleStar({ postId: post._id });
                  }}
                  className="p-1 rounded-lg transition-colors"
                  style={{ color: post.isStarred ? "var(--star-color)" : "var(--text-muted)" }}
                >
                  <Star size={16} weight={post.isStarred ? "fill" : "regular"} />
                </button>
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

/* ──────────────────── Blog Icon ──────────────────── */

function BlogIcon({ htmlUrl, imageUrl, size = 16 }: { htmlUrl?: string; imageUrl?: string; size?: number }) {
  const faviconUrl = htmlUrl
    ? `https://www.google.com/s2/favicons?domain=${new URL(htmlUrl).hostname}&sz=${size * 2}`
    : undefined;
  const src = imageUrl || faviconUrl;
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className="rounded-sm object-cover flex-shrink-0"
      style={{ width: size, height: size }}
      loading="lazy"
      onError={(e) => {
        // Hide broken images
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

function BlogName({ name, brandColor, className }: { name: string; brandColor?: string; className?: string }) {
  return (
    <span className={className} style={brandColor ? { color: brandColor } : undefined}>
      {name}
    </span>
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
