import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarClock, ExternalLink, Loader2, Newspaper, Star } from 'lucide-react';
import Seo from '../components/Seo';
import { fetchBlogPost, getBlogPost } from '../api/blog';
import { animePath } from '../lib/slug';

function formatDate(value: string) { return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }); }
function formatTime(seconds?: number) { return seconds ? new Date(seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }) : null; }

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const definition = getBlogPost(slug);
  const { data, isLoading, error } = useQuery({ queryKey: ['blog-post', slug], queryFn: () => fetchBlogPost(slug!), enabled: !!definition, staleTime: 1000 * 60 * 15 });

  if (!definition) {
    return <div className="container mx-auto px-4 md:px-10 py-16 text-center"><h1 className="text-3xl font-black mb-3">Blog post not found</h1><Link to="/blog" className="text-primary font-bold hover:underline">Back to blog</Link></div>;
  }

  const post = data || { ...definition, updatedAt: new Date().toISOString(), items: [] };
  const canonicalPath = '/blog/' + definition.slug;
  const jsonLd = { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: definition.title, description: definition.description, datePublished: '2026-05-05', dateModified: post.updatedAt, mainEntityOfPage: 'https://www.streamnyaa.xyz' + canonicalPath, author: { '@type': 'Organization', name: 'StreamNyaa' }, publisher: { '@type': 'Organization', name: 'StreamNyaa', url: 'https://www.streamnyaa.xyz/' } };

  return (
    <article className="container mx-auto px-4 md:px-10 py-10 md:py-14">
      <Seo title={definition.seoTitle} description={definition.description} canonicalPath={canonicalPath} jsonLd={jsonLd} />
      <Link to="/blog" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-primary transition-colors mb-8"><ArrowLeft className="w-4 h-4" />Blog</Link>
      <header className="max-w-4xl">
        <div className="flex flex-wrap items-center gap-3 mb-4"><span className="text-[11px] uppercase font-black tracking-wider text-primary bg-primary/10 px-3 py-1 rounded-full">{definition.category}</span><span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><CalendarClock className="w-4 h-4" />Updated {formatDate(post.updatedAt)}</span></div>
        <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-tight mb-5">{definition.title}</h1>
        <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-3xl">{definition.intro}</p>
      </header>
      {isLoading ? <div className="min-h-[280px] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div> : error ? <div className="mt-10 border border-border rounded-2xl p-6 bg-secondary/40 text-muted-foreground">The live anime data could not load right now. Try refreshing this page in a moment.</div> : (
        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_300px]">
          <section className="space-y-4">
            {post.items.length === 0 ? (
              <div className="border border-border rounded-2xl p-6 bg-secondary/40 text-muted-foreground">No current entries are available for this article yet. Try refreshing again shortly.</div>
            ) : post.items.map((anime, index) => (
              <Link key={anime.mal_id + '-' + index} to={animePath(anime)} className="group grid grid-cols-[86px_1fr] sm:grid-cols-[112px_1fr] gap-4 border border-border bg-[var(--glass)] hover:border-primary/40 rounded-2xl p-4 transition-colors">
                <div className="aspect-[2/3] bg-secondary rounded-xl overflow-hidden border border-border">{anime.image ? <img src={anime.image} alt={anime.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 brightness-90" loading="lazy" referrerPolicy="no-referrer" /> : null}</div>
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2 mb-2"><span className="text-xs font-black text-primary">#{index + 1}</span>{anime.format && <span className="text-[11px] uppercase font-bold text-muted-foreground bg-secondary px-2 py-0.5 rounded">{anime.format}</span>}{anime.score ? <span className="inline-flex items-center gap-1 text-[11px] font-bold text-yellow-500"><Star className="w-3 h-3 fill-current" />{anime.score}%</span> : null}</div><h2 className="text-lg md:text-xl font-black text-foreground group-hover:text-primary transition-colors line-clamp-2">{anime.title}</h2><p className="mt-2 text-sm text-muted-foreground leading-relaxed line-clamp-3">{anime.description || 'Anime metadata and discovery details are available on the StreamNyaa title page.'}</p><div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-muted-foreground">{anime.episode ? <span>Episode {anime.episode}</span> : null}{formatTime(anime.airingAt) ? <span>{formatTime(anime.airingAt)}</span> : null}{anime.status ? <span>{anime.status.replace(/_/g, ' ')}</span> : null}{anime.genres.slice(0, 3).map((genre) => <span key={genre}>{genre}</span>)}</div></div>
              </Link>
            ))}
          </section>
          <aside className="space-y-5"><div className="border border-border rounded-2xl p-5 bg-secondary/30"><div className="flex items-center gap-2 font-black text-foreground mb-2"><Newspaper className="w-5 h-5 text-primary" />About this update</div><p className="text-sm text-muted-foreground leading-relaxed">This page highlights current anime activity in a clean format, helping you move from a quick update into full StreamNyaa title pages.</p></div><div className="border border-border rounded-2xl p-5 bg-[var(--glass)]"><h2 className="font-black text-foreground mb-3">Explore more</h2><div className="space-y-2 text-sm font-semibold"><Link to="/blog" className="flex items-center justify-between hover:text-primary transition-colors">All blog posts <ExternalLink className="w-4 h-4" /></Link><Link to="/schedule" className="flex items-center justify-between hover:text-primary transition-colors">Anime schedule <ExternalLink className="w-4 h-4" /></Link><Link to="/search" className="flex items-center justify-between hover:text-primary transition-colors">Browse anime <ExternalLink className="w-4 h-4" /></Link></div></div></aside>
        </div>
      )}
    </article>
  );
}
