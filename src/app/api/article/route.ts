import { NextRequest, NextResponse } from "next/server";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

export const maxDuration = 30;

// Fetches a page and extracts readable article content. Lives on Vercel
// instead of a Convex action so article bandwidth doesn't count against
// the Convex free tier.
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url || !/^https?:\/\//.test(url)) {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });

    if (!response.ok) return NextResponse.json({ error: "unreachable" }, { status: 502 });

    const html = await response.text();
    const { document } = parseHTML(html);

    // Set the URL for relative link resolution
    const base = document.createElement("base");
    base.setAttribute("href", url);
    document.head.appendChild(base);

    const reader = new Readability(document as any);
    const article = reader.parse();

    if (!article || !article.content) {
      return NextResponse.json({ error: "no readable content" }, { status: 422 });
    }

    const textOnly = article.textContent || article.content.replace(/<[^>]*>/g, " ");
    const wordCount = textOnly.split(/\s+/).filter((w: string) => w.length > 0).length;

    return NextResponse.json(
      {
        title: article.title || "Untitled",
        content: article.content,
        excerpt: article.excerpt || undefined,
        byline: article.byline || undefined,
        siteName: article.siteName || undefined,
        length: wordCount,
      },
      { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" } }
    );
  } catch {
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }
}
