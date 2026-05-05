import { Link } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { CalendarDays, Loader2, Newspaper, Sparkles, TrendingUp } from 'lucide-react';
import Seo from '../components/Seo';
import { BLOG_POSTS, fetchBlogPost } from '../api/blog';
export default function Blog() {
  const previews = useQueries({ queries: BLOG_POSTS.map((post) => ({ queryKey: ['blog-preview', post.slug], queryFn: () => fetchBlogPost(post.slug), staleTime: 1000 * 60 * 15 })) });
  const jsonLd = { '@context': 'https://schema.org', '@type': 'Blog', name: 'StreamNyaa Blog', url: 'https://www.streamnyaa.xyz/blog', description: 'Auto-updated anime discovery articles powered by current AniList anime metadata, schedules, trends, and episode updates.', publisher: { '@type': 'Organization', name: 'StreamNyaa', url: 'https://www.streamnyaa.xyz/' } };
  return (
    <div className="container mx-auto px-4 md:px-10 py-10 md:py-14">
      <Seo title="Anime Blog and Release Updates | StreamNyaa" description="Read auto-updated anime blog posts about trending anime, popular shows, upcoming anime, daily release schedules, and recent episode updates." canonicalPath="/blog" jsonLd={jsonLd} />
      <section className="max-w-5xl"><div className="flex items-center gap-3 text-primary text-sm font-bold uppercase mb-4"><span className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><Newspaper className="w-5 h-5" /></span>StreamNyaa Blog</div><h1 className="text-3xl md:text-5xl font-black tracking-tight mb-4">Anime release updates, trends, and discovery notes</h1><p className="text-muted-foreground text-base md:text-lg leading-relaxed max-w-3xl">These auto-updated articles turn live anime metadata into readable discovery pages. Browse trending anime, popular titles, upcoming shows, episode updates, and daily release schedules without leaving StreamNyaa.</p></section>
      <section className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {BLOG_POSTS.map((post, index) => {
          const Icon = index % 3 === 0 ? TrendingUp : index % 3 === 1 ? Sparkles : CalendarDays; const preview = previews[index]; const images = preview.data?.items.slice(0, 3) || [];
          return <Link key={post.slug} to={'/blog/' + post.slug} className="group border border-border bg-[var(--glass)] hover:border-primary/40 rounded-2xl overflow-hidden transition-colors min-h-[300px] flex flex-col"><div className="h-32 bg-secondary/60 grid grid-cols-3 gap-1 p-1">{preview.isLoading ? <div className="col-span-3 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div> : images.length ? images.map((anime) => <img key={anime.mal_id} src={anime.image} alt={anime.title} className="w-full h-full object-cover rounded-lg" loading="lazy" referrerPolicy="no-referrer" />) : <div className="col-span-3 flex items-center justify-center text-xs font-semibold text-muted-foreground">Live data loading</div>}</div><div className="p-5 flex flex-col flex-1"><div className="flex items-center justify-between gap-3 mb-4"><span className="text-[11px] uppercase font-black tracking-wider text-primary bg-primary/10 px-3 py-1 rounded-full">{post.category}</span><Icon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" /></div><h2 className="text-xl font-black text-foreground leading-tight group-hover:text-primary transition-colors">{post.title}</h2><p className="mt-3 text-sm text-muted-foreground leading-relaxed flex-1">{post.summary}</p><div className="mt-5 text-sm font-bold text-primary">Read update</div></div></Link>;
        })}
      </section>
      <section className="mt-12 border-t border-border pt-8 max-w-4xl text-muted-foreground leading-relaxed"><h2 className="text-2xl font-black text-foreground mb-3">How the blog updates automatically</h2><p>StreamNyaa blog pages use current anime metadata and airing schedule data instead of copied news articles. This keeps the pages focused, searchable, and useful for anime discovery while avoiding stale manually written lists.</p></section>
    </div>
  );
}
