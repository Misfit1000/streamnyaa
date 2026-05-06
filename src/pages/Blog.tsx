import { Link } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { Bot, CalendarDays, Loader2, Newspaper, PenLine, Sparkles, TrendingUp } from 'lucide-react';
import Seo from '../components/Seo';
import { BLOG_POSTS, fetchBlogPost } from '../api/blog';

const sortedPosts = [...BLOG_POSTS].sort((a, b) => b.sortRank - a.sortRank);

export default function Blog() {
  const previews = useQueries({
    queries: sortedPosts.map((post) => ({
      queryKey: ['blog-preview', post.slug],
      queryFn: () => fetchBlogPost(post.slug, true),
      staleTime: 1000 * 60 * 60 * 7,
    })),
  });
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'StreamNyaa Blog',
    url: 'https://www.streamnyaa.xyz/blog',
    description: 'Anime discovery articles covering current trends, release schedules, upcoming titles, and recent episode updates.',
    publisher: { '@type': 'Organization', name: 'StreamNyaa', url: 'https://www.streamnyaa.xyz/' },
  };

  return (
    <div className="container mx-auto px-4 md:px-10 py-10 md:py-14">
      <Seo title="Anime Blog - Trending Anime, Schedules and Episode Updates | StreamNyaa" description="Read useful anime articles about trending anime, popular airing shows, upcoming anime, daily release schedules, and recent episode updates." canonicalPath="/blog" jsonLd={jsonLd} />
      <section className="max-w-5xl">
        <div className="flex items-center gap-3 text-primary text-sm font-bold uppercase mb-4"><span className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><Newspaper className="w-5 h-5" /></span>StreamNyaa Blog</div>
        <h1 className="text-3xl md:text-5xl font-black tracking-tight mb-4">Latest anime articles, news, and update guides</h1>
        <p className="text-muted-foreground text-base md:text-lg leading-relaxed max-w-3xl">Browse the newest StreamNyaa anime articles first, including Gemini-generated trending news and non-AI guide articles for schedules, popularity, and episode activity.</p>
      </section>
      <section className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sortedPosts.map((post, index) => {
          const Icon = index % 3 === 0 ? TrendingUp : index % 3 === 1 ? Sparkles : CalendarDays;
          const preview = previews[index];
          const images = preview.data?.items.slice(0, 3) || [];
          const isGemini = post.articleKind === 'gemini';
          const KindIcon = isGemini ? Bot : PenLine;
          return (
            <Link key={post.slug} to={'/blog/' + post.slug} className="group border border-border bg-[var(--glass)] hover:border-primary/40 rounded-2xl overflow-hidden transition-colors min-h-[320px] flex flex-col">
              <div className="h-36 bg-secondary/60 grid grid-cols-3 gap-1 p-1 border-b border-border">
                {preview.isLoading ? <div className="col-span-3 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div> : images.length ? images.map((anime) => <img key={anime.mal_id} src={anime.image} alt={anime.title} className="w-full h-full object-cover rounded-lg brightness-75 group-hover:brightness-90 transition-all" loading="lazy" referrerPolicy="no-referrer" />) : <div className="col-span-3 flex items-center justify-center text-xs font-semibold text-muted-foreground">Live data loading</div>}
              </div>
              <div className="p-5 flex flex-col flex-1 bg-background/95">
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  {index === 0 ? <span className="text-[11px] uppercase font-black tracking-wider text-foreground bg-primary px-3 py-1 rounded-full">Latest</span> : null}
                  <span className="text-[11px] uppercase font-black tracking-wider text-primary bg-primary/10 px-3 py-1 rounded-full">{post.category}</span>
                  <span className="inline-flex items-center gap-1.5 text-[11px] uppercase font-black tracking-wider text-muted-foreground bg-secondary px-3 py-1 rounded-full"><KindIcon className="w-3 h-3" />{isGemini ? 'Gemini article' : 'Non-AI article'}</span>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-xl font-black text-foreground leading-tight group-hover:text-primary transition-colors drop-shadow-sm">{post.title}</h2>
                  <Icon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                </div>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed flex-1">{post.summary}</p>
                <div className="mt-5 flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-muted-foreground">{isGemini ? 'Refreshes every 7 hours' : 'Stable guide article'}</span>
                  <span className="text-sm font-bold text-primary">Read update</span>
                </div>
              </div>
            </Link>
          );
        })}
      </section>
      <section className="mt-12 border-t border-border pt-8 max-w-4xl text-muted-foreground leading-relaxed"><h2 className="text-2xl font-black text-foreground mb-3">Anime discovery notes</h2><p>StreamNyaa blog pages are sorted newest first, with Gemini-generated trend news shown alongside non-AI anime guide articles.</p></section>
    </div>
  );
}
