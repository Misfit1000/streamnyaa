import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Loader2, Newspaper, Sparkles, TrendingUp } from 'lucide-react';
import Seo from '../components/Seo';
import { articlePath, BLOG_POSTS, fetchArchivedBlogPostPage } from '../api/blog';
import type { BlogPostData } from '../api/blog';
import AdSenseAd from '../components/AdSenseAd';

const sortedPosts = [...BLOG_POSTS].sort((a, b) => b.sortRank - a.sortRank);
const guidePosts = sortedPosts.filter((post) => post.articleKind !== 'gemini');
const POSTS_PER_PAGE = 10;

function formatDate(value?: string) {
  if (!value) return 'Recently updated';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently updated';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date);
}

function postImage(post: BlogPostData) {
  return post.topic?.image || post.items?.[0]?.image || '';
}

function postHeadline(post: BlogPostData) {
  return post.article?.headline || post.topic?.title || post.title;
}

function postExcerpt(post: BlogPostData) {
  return post.article?.excerpt || post.topic?.summary || post.summary;
}

function visiblePages(currentPage: number, totalPages: number) {
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export default function Blog() {
  const [page, setPage] = useState(1);
  const archive = useQuery({
    queryKey: ['blog-archive-summary-page', page],
    queryFn: () => fetchArchivedBlogPostPage(page, POSTS_PER_PAGE),
    placeholderData: (previousData) => previousData,
    staleTime: 1000 * 60 * 60 * 24,
  });
  const archivedPosts = archive.data?.posts || [];
  const pagination = archive.data?.pagination || {
    page,
    limit: POSTS_PER_PAGE,
    total: archivedPosts.length,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: page > 1,
  };
  const featured = page === 1 ? archivedPosts[0] : undefined;
  const latestPosts = featured ? archivedPosts.slice(1) : archivedPosts;
  const guideImages = useMemo(() => {
    const images = archivedPosts.map(postImage).filter(Boolean);
    return guidePosts.map((_, index) => images[index % Math.max(images.length, 1)] || '/logo.svg');
  }, [archivedPosts]);
  const pageNumbers = visiblePages(page, pagination.totalPages);
  const goToPage = (nextPage: number) => {
    const clamped = Math.min(Math.max(1, nextPage), pagination.totalPages);
    setPage(clamped);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'StreamNyaa Blog',
    url: 'https://www.streamnyaa.xyz/blog',
    description: 'Anime discovery articles covering current trends, release schedules, upcoming titles, and recent episode updates.',
    publisher: { '@type': 'Organization', name: 'StreamNyaa', url: 'https://www.streamnyaa.xyz/' },
  };

  return (
    <div className="container mx-auto px-4 md:px-10 py-8 md:py-12">
      <Seo title="Anime Blog - Trending Anime, Schedules and Episode Updates | StreamNyaa" description="Read useful anime articles about trending anime, popular airing shows, upcoming anime, daily release schedules, and recent episode updates." canonicalPath="/blog" jsonLd={jsonLd} />

      <section className="flex flex-col gap-5 border-b border-border pb-7 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-black uppercase tracking-wider text-primary">
            <Newspaper className="h-3.5 w-3.5" />
            StreamNyaa Blog
          </div>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight">Anime articles without the clutter</h1>
          <p className="mt-3 max-w-2xl text-sm md:text-base leading-7 text-muted-foreground">Focused anime news, trend reads, release guides, and episode updates. Latest stories appear first, with quick guide links below.</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-[var(--glass)] px-4 py-3 text-sm font-semibold text-muted-foreground">
          {archive.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Sparkles className="h-4 w-4 text-primary" />}
          {archive.isLoading ? 'Loading latest stories' : `${pagination.total} saved stories`}
        </div>
      </section>

      {featured ? (
        <section className="mt-8">
          <Link to={articlePath(featured)} className="group grid overflow-hidden rounded-2xl border border-border bg-[var(--glass)] transition-colors hover:border-primary/40 lg:grid-cols-[0.86fr_1.14fr]">
            <div className="relative min-h-[220px] bg-secondary lg:min-h-[360px]">
              {postImage(featured) ? (
                <img src={postImage(featured)} alt={postHeadline(featured)} className="absolute inset-0 h-full w-full object-cover brightness-[0.74] transition-transform duration-300 group-hover:scale-[1.025]" loading="eager" referrerPolicy="no-referrer" />
              ) : null}
              <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.68))] lg:hidden" />
              <div className="absolute bottom-4 left-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-primary px-3 py-1 text-[11px] font-black uppercase tracking-wider text-primary-foreground">Latest</span>
                <span className="rounded-full bg-black/55 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-white backdrop-blur">{featured.category}</span>
              </div>
            </div>
            <div className="flex flex-col justify-center p-5 md:p-8">
              <div className="mb-4 flex flex-wrap items-center gap-3 text-xs font-bold text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-primary" />{formatDate(featured.generatedAt || featured.updatedAt)}</span>
                {featured.topic?.type ? <span>{featured.topic.type.replace(/-/g, ' ')}</span> : null}
              </div>
              <h2 className="text-2xl md:text-4xl font-black leading-tight tracking-tight group-hover:text-primary transition-colors">{postHeadline(featured)}</h2>
              <p className="mt-4 text-sm md:text-base leading-7 text-muted-foreground">{postExcerpt(featured)}</p>
              <div className="mt-6 inline-flex items-center gap-2 text-sm font-black text-primary">
                Read latest story
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </div>
            </div>
          </Link>
        </section>
      ) : archive.isLoading ? (
        <section className="mt-8 rounded-2xl border border-border bg-[var(--glass)] p-6">
          <div className="flex items-center gap-3 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin text-primary" />Loading latest blog articles...</div>
        </section>
      ) : null}

      <AdSenseAd />

      <section className="mt-8 grid gap-8 xl:grid-cols-[1fr_390px]">
        <main>
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-2xl font-black tracking-tight">{page === 1 ? 'Latest stories' : `More stories - page ${page}`}</h2>
            <span className="text-xs font-bold text-muted-foreground">Newest first</span>
          </div>

          <div className="grid gap-3">
            {latestPosts.map((post) => (
              <Link key={post.articleSlug || post.generatedAt || post.title} to={articlePath(post)} className="group grid grid-cols-[92px_1fr] gap-4 rounded-xl border border-border bg-[var(--glass)] p-3 transition-colors hover:border-primary/40 sm:grid-cols-[128px_1fr]">
                <div className="aspect-[4/3] overflow-hidden rounded-lg bg-secondary ring-1 ring-border/80">
                  {postImage(post) ? <img src={postImage(post)} alt={postHeadline(post)} className="h-full w-full object-cover brightness-90 transition-transform duration-300 group-hover:scale-105" loading="lazy" referrerPolicy="no-referrer" /> : null}
                </div>
                <div className="min-w-0 py-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                    <span className="text-primary">{post.category}</span>
                    <span>{formatDate(post.generatedAt || post.updatedAt)}</span>
                  </div>
                  <h3 className="line-clamp-2 text-base md:text-lg font-black leading-tight text-foreground transition-colors group-hover:text-primary">{postHeadline(post)}</h3>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{postExcerpt(post)}</p>
                </div>
              </Link>
            ))}

            {!archive.isLoading && !latestPosts.length && !featured ? (
              <div className="rounded-xl border border-border bg-[var(--glass)] p-5 text-sm text-muted-foreground">No generated stories are available yet. The guide articles are ready below.</div>
            ) : null}
          </div>

          {pagination.totalPages > 1 ? (
            <nav className="mt-7 flex flex-wrap items-center justify-center gap-2" aria-label="Blog pages">
              <button type="button" onClick={() => goToPage(page - 1)} disabled={!pagination.hasPreviousPage || archive.isFetching} className="inline-flex h-10 items-center gap-1 rounded-full border border-border bg-[var(--glass)] px-3 text-sm font-black text-foreground transition-colors hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-45">
                <ChevronLeft className="h-4 w-4" />
                Prev
              </button>
              {pageNumbers[0] > 1 ? (
                <>
                  <button type="button" onClick={() => goToPage(1)} className="h-10 min-w-10 rounded-full border border-border bg-[var(--glass)] px-3 text-sm font-black transition-colors hover:border-primary/40">1</button>
                  <span className="px-1 text-sm font-black text-muted-foreground">...</span>
                </>
              ) : null}
              {pageNumbers.map((pageNumber) => (
                <button key={pageNumber} type="button" onClick={() => goToPage(pageNumber)} disabled={archive.isFetching && pageNumber === page} className={`h-10 min-w-10 rounded-full border px-3 text-sm font-black transition-colors ${pageNumber === page ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-[var(--glass)] text-foreground hover:border-primary/40'}`}>
                  {pageNumber}
                </button>
              ))}
              {pageNumbers[pageNumbers.length - 1] < pagination.totalPages ? (
                <>
                  <span className="px-1 text-sm font-black text-muted-foreground">...</span>
                  <button type="button" onClick={() => goToPage(pagination.totalPages)} className="h-10 min-w-10 rounded-full border border-border bg-[var(--glass)] px-3 text-sm font-black transition-colors hover:border-primary/40">{pagination.totalPages}</button>
                </>
              ) : null}
              <button type="button" onClick={() => goToPage(page + 1)} disabled={!pagination.hasNextPage || archive.isFetching} className="inline-flex h-10 items-center gap-1 rounded-full border border-border bg-[var(--glass)] px-3 text-sm font-black text-foreground transition-colors hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-45">
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </nav>
          ) : null}
        </main>

        <aside>
          <div className="sticky top-24 rounded-2xl border border-border bg-[var(--glass)] p-4">
            <div className="px-1 pb-4">
              <h2 className="text-xl font-black tracking-tight">Guide articles</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Evergreen anime guides with quick context and direct discovery links.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {guidePosts.map((post, index) => {
                const Icon = index % 3 === 0 ? TrendingUp : index % 3 === 1 ? Sparkles : CalendarDays;
                const image = guideImages[index];
                return (
                  <Link key={post.slug} to={'/blog/' + post.slug} className="group overflow-hidden rounded-xl border border-border bg-background/55 transition-colors hover:border-primary/40">
                    <div className="relative h-28 overflow-hidden bg-secondary">
                      <img src={image} alt={post.title} className="h-full w-full object-cover brightness-[0.68] transition-transform duration-300 group-hover:scale-105" loading="lazy" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.08),rgba(0,0,0,0.76))]" />
                      <div className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="absolute bottom-3 left-3 right-3">
                        <span className="rounded-full bg-primary px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-primary-foreground">{post.category}</span>
                      </div>
                    </div>
                    <div className="p-3">
                      <h3 className="line-clamp-2 text-sm font-black leading-tight text-foreground transition-colors group-hover:text-primary">{post.title}</h3>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{post.summary}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
