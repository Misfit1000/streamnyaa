import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, Loader2, Newspaper, PenLine, Sparkles, TrendingUp } from 'lucide-react';
import Seo from '../components/Seo';
import { articlePath, BLOG_POSTS, fetchArchivedBlogPosts } from '../api/blog';
import type { BlogPostData } from '../api/blog';

const sortedPosts = [...BLOG_POSTS].sort((a, b) => b.sortRank - a.sortRank);
const guidePosts = sortedPosts.filter((post) => post.articleKind !== 'gemini');

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

export default function Blog() {
  const archive = useQuery({
    queryKey: ['blog-archive-summary'],
    queryFn: () => fetchArchivedBlogPosts(true),
    staleTime: 1000 * 60 * 60 * 24,
  });
  const archivedPosts = archive.data || [];
  const featured = archivedPosts[0];
  const latestPosts = archivedPosts.slice(featured ? 1 : 0, featured ? 9 : 8);
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
          {archive.isLoading ? 'Loading latest stories' : `${archivedPosts.length} saved stories`}
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

      <section className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
        <main>
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-2xl font-black tracking-tight">Latest stories</h2>
            <span className="text-xs font-bold text-muted-foreground">Newest first</span>
          </div>

          <div className="space-y-3">
            {latestPosts.map((post) => (
              <Link key={post.articleSlug || post.generatedAt || post.title} to={articlePath(post)} className="group grid grid-cols-[84px_1fr] gap-4 rounded-xl border border-border bg-[var(--glass)] p-3 transition-colors hover:border-primary/40 sm:grid-cols-[112px_1fr]">
                <div className="aspect-[4/3] overflow-hidden rounded-lg bg-secondary">
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
        </main>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-border bg-[var(--glass)] p-5">
            <h2 className="text-xl font-black tracking-tight">Guide articles</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Fast evergreen reads for schedules, popularity, upcoming anime, and recent episode movement.</p>
            <div className="mt-5 space-y-2">
              {guidePosts.map((post, index) => {
                const Icon = index % 3 === 0 ? TrendingUp : index % 3 === 1 ? Sparkles : CalendarDays;
                return (
                  <Link key={post.slug} to={'/blog/' + post.slug} className="group flex gap-3 rounded-xl border border-border bg-background/55 p-3 transition-colors hover:border-primary/40">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
                    <span className="min-w-0">
                      <span className="block text-sm font-black text-foreground group-hover:text-primary transition-colors">{post.title}</span>
                      <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">{post.summary}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-secondary/25 p-5">
            <div className="mb-3 flex items-center gap-2 font-black"><PenLine className="h-5 w-5 text-primary" />Cleaner reading</div>
            <p className="text-sm leading-6 text-muted-foreground">The blog now loads lightweight summaries first. Full article content opens only when you choose a story.</p>
          </div>
        </aside>
      </section>
    </div>
  );
}
