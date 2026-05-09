import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BarChart3, CalendarClock, CheckCircle2, ExternalLink, HelpCircle, Loader2, Newspaper, Star } from 'lucide-react';
import Seo from '../components/Seo';
import AdSenseAd from '../components/AdSenseAd';
import { articlePath, BLOG_POSTS, fetchBlogPost, fetchBlogPostByArticleSlug, getBlogPost } from '../api/blog';
import type { BlogMediaItem } from '../api/blog';
import { animePath } from '../lib/slug';

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatTime(seconds?: number) {
  return seconds ? new Date(seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }) : null;
}

function formatNumber(value?: number) {
  return typeof value === 'number' ? value.toLocaleString() : null;
}

function formatStatus(value?: string) {
  return value ? value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : null;
}

function formatSeason(anime: BlogMediaItem) {
  if (!anime.season && !anime.seasonYear) return null;
  return [formatStatus(anime.season), anime.seasonYear].filter(Boolean).join(' ');
}

function uniqueGenres(items: BlogMediaItem[]) {
  const genres = new Map<string, number>();
  for (const item of items) {
    for (const genre of item.genres.slice(0, 4)) genres.set(genre, (genres.get(genre) || 0) + 1);
  }
  return [...genres.entries()].sort((a, b) => b[1] - a[1]).map(([genre]) => genre).slice(0, 5);
}

function averageScore(items: BlogMediaItem[]) {
  const scores = items.map((item) => item.score).filter((score): score is number => typeof score === 'number' && score > 0);
  if (!scores.length) return null;
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

function buildArticleParagraphs(definition: ReturnType<typeof getBlogPost>, items: BlogMediaItem[]) {
  if (!definition || !items.length) return [definition?.intro || 'This article is being prepared.'];
  const top = items[0];
  const genres = uniqueGenres(items);
  const score = averageScore(items);
  const topStudio = top.studios[0];
  const episodeLine = top.episode ? ` Episode ${top.episode} is the strongest current signal for ${top.title}.` : '';
  const nextLine = top.nextEpisode ? ` The next listed episode is episode ${top.nextEpisode}${formatTime(top.nextAiringAt) ? ` around ${formatTime(top.nextAiringAt)}` : ''}.` : '';

  return [
    `${definition.intro} The current lead title is ${top.title}${topStudio ? ` from ${topStudio}` : ''}, which gives this article a clear starting point for ${definition.angle}.`,
    `${items.length} titles are listed here with practical details like score, format, status, episode count, genres, and direct StreamNyaa pages.${score ? ` The average score across scored titles is about ${score}/100.` : ''}`,
    genres.length ? `Genre-wise, this update leans toward ${genres.slice(0, 3).join(', ')}. That makes it easier to pick based on mood instead of only following rank numbers.${episodeLine}${nextLine}` : `${episodeLine}${nextLine}`.trim(),
    definition.readerPromise,
  ].filter(Boolean);
}

function buildTakeaways(items: BlogMediaItem[]) {
  const top = items[0];
  const genres = uniqueGenres(items);
  const score = averageScore(items);
  return [
    top ? { label: 'Top highlight', value: top.title, detail: top.score ? `Score signal: ${top.score}/100` : 'Strong current placement' } : null,
    genres.length ? { label: 'Common genres', value: genres.slice(0, 3).join(', '), detail: 'Useful for picking by mood' } : null,
    score ? { label: 'Average score', value: `${score}/100`, detail: 'Based on titles with score data' } : null,
    items.find((item) => item.episode || item.nextEpisode) ? { label: 'Episode context', value: 'Included', detail: 'Current or next episode info appears where available' } : null,
  ].filter((item): item is { label: string; value: string; detail: string } => Boolean(item));
}

function whyWatchText(anime: BlogMediaItem, index: number) {
  const genre = anime.genres[0];
  const studio = anime.studios[0];
  if (index === 0) return `${anime.title} leads this update because it has the strongest current placement among the titles shown here.`;
  if (anime.score && anime.score >= 80) return `${anime.title} is worth checking if you want a well-rated ${genre ? genre.toLowerCase() + ' ' : ''}anime with strong audience response.`;
  if (anime.nextEpisode) return `${anime.title} is useful to follow now because another episode is already on the schedule.`;
  if (studio) return `${anime.title} stands out as a ${studio} title with enough current activity to keep on your radar.`;
  return `${anime.title} is included as a useful discovery pick with current metadata, genres, and a direct title page.`;
}

function buildFaq(definition: ReturnType<typeof getBlogPost>, items: BlogMediaItem[]) {
  const top = items[0]?.title || 'the top anime';
  return [
    {
      question: `What is the best pick from ${definition?.title || 'this anime article'}?`,
      answer: `${top} is the first title to check on this page, but the best choice depends on the genres and episode status you prefer.`,
    },
    {
      question: 'How often should I check this anime article?',
      answer: 'This article is useful when you want a quick read on current anime momentum, episode activity, and title context.',
    },
    {
      question: 'Can I open the anime pages from this article?',
      answer: 'Yes. Each anime card links to its StreamNyaa title page so you can continue from the article into the main anime details.',
    },
  ];
}

function findTopicAnime(items: BlogMediaItem[], topic?: { animeTitle?: string; malId?: number; animeId?: number }) {
  if (!items.length) return null;
  if (!topic) return items[0];

  const exact = items.find((item) => item.mal_id === topic.malId || item.id === topic.animeId);
  if (exact) return exact;
  if (!topic.animeTitle) return items[0];

  const cleanTitle = topic.animeTitle.toLowerCase();
  return items.find((item) => {
    const title = item.title.toLowerCase();
    return title === cleanTitle || title.includes(cleanTitle) || cleanTitle.includes(title);
  }) || items[0];
}

function relatedBlogArticles(currentSlug: string) {
  return BLOG_POSTS
    .filter((post) => post.slug !== currentSlug && post.articleKind !== 'gemini')
    .sort((a, b) => b.sortRank - a.sortRank)
    .slice(0, 4);
}

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const staticDefinition = getBlogPost(slug);
  const { data, isLoading, error } = useQuery({
    queryKey: staticDefinition ? ['blog-post', staticDefinition.slug] : ['blog-generated-post', slug],
    queryFn: () => staticDefinition ? fetchBlogPost(staticDefinition.slug) : fetchBlogPostByArticleSlug(slug!),
    enabled: !!slug,
    staleTime: 1000 * 60 * 60 * 24,
  });
  const definition = staticDefinition || getBlogPost(data?.slug);

  if (!definition && isLoading) {
    return <div className="container mx-auto px-4 md:px-10 py-16 text-center"><Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" /></div>;
  }

  if (!definition || error) {
    return <div className="container mx-auto px-4 md:px-10 py-16 text-center"><h1 className="text-3xl font-black mb-3">Blog post not found</h1><Link to="/blog" className="text-primary font-bold hover:underline">Back to blog</Link></div>;
  }

  const post = data || { ...definition, updatedAt: new Date().toISOString(), items: [] };
  const isGeminiArticle = definition.articleKind === 'gemini';
  const canonicalPath = isGeminiArticle ? articlePath(post) : '/blog/' + definition.slug;
  const article = post.article;
  const paragraphs = article?.paragraphs?.length ? article.paragraphs : buildArticleParagraphs(definition, post.items);
  const leadParagraph = paragraphs[0];
  const bodyParagraphs = paragraphs.slice(1);
  const takeaways = article?.takeaways?.length ? article.takeaways : buildTakeaways(post.items);
  const faq = article?.faq?.length ? article.faq : buildFaq(definition, post.items);
  const seoTitle = article?.seoTitle || definition.seoTitle;
  const seoDescription = article?.metaDescription || definition.description;
  const headline = article?.headline || definition.title;
  const intro = article?.excerpt || definition.intro;
  const heroAnime = findTopicAnime(post.items, isGeminiArticle ? post.topic : undefined);
  const image = isGeminiArticle ? (post.topic?.image || heroAnime?.image) : heroAnime?.image;
  const relatedArticles = relatedBlogArticles(definition.slug);
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline,
      description: seoDescription,
      articleSection: isGeminiArticle ? 'Anime News' : definition.category,
      datePublished: '2026-05-05',
      dateModified: post.generatedAt || post.updatedAt,
      mainEntityOfPage: 'https://www.streamnyaa.xyz' + canonicalPath,
      image: image ? [image] : undefined,
      author: { '@type': 'Organization', name: 'StreamNyaa' },
      publisher: { '@type': 'Organization', name: 'StreamNyaa', url: 'https://www.streamnyaa.xyz/' },
      about: post.items.slice(0, 8).map((anime) => ({ '@type': 'TVSeries', name: anime.title, url: 'https://www.streamnyaa.xyz' + animePath(anime) })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faq.map((item) => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })),
    },
  ];

  return (
    <article className="container mx-auto px-4 md:px-10 py-10 md:py-14">
      <Seo title={seoTitle} description={seoDescription} canonicalPath={canonicalPath} image={image} jsonLd={jsonLd} />
      <Link to="/blog" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-primary transition-colors mb-8"><ArrowLeft className="w-4 h-4" />Blog</Link>
      <header className="max-w-4xl">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="text-[11px] uppercase font-black tracking-wider text-primary bg-primary/10 px-3 py-1 rounded-full">{isGeminiArticle ? 'Focused news' : definition.category}</span>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><CalendarClock className="w-4 h-4" />Anime article</span>
        </div>
        <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-tight mb-5">{headline}</h1>
        <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-3xl">{intro}</p>
        {isGeminiArticle && post.topic ? (
          <div className="mt-6 border border-primary/20 bg-primary/5 rounded-2xl p-4 max-w-3xl">
            <p className="text-[11px] uppercase font-black tracking-wider text-primary mb-2">Story focus</p>
            <h2 className="text-lg md:text-xl font-black text-foreground">{post.topic.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{post.topic.summary}</p>
          </div>
        ) : null}
      </header>

      {isLoading ? <div className="min-h-[280px] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div> : error ? <div className="mt-10 border border-border rounded-2xl p-6 bg-secondary/40 text-muted-foreground">The current anime details could not load right now. Try refreshing this page in a moment.</div> : (
        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_300px]">
          <main className="space-y-8">
            {post.items.length === 0 ? (
              <div className="border border-border rounded-2xl p-6 bg-secondary/40 text-muted-foreground">No current entries are available for this article yet. Try refreshing again shortly.</div>
            ) : (
              <>
                {image && heroAnime ? (
                  isGeminiArticle ? (
                    <div className="relative min-h-[340px] overflow-hidden rounded-2xl border border-primary/30 bg-secondary">
                      <img src={image} alt={heroAnime.title} className="absolute inset-0 h-full w-full object-cover brightness-[0.36] saturate-125 scale-105" loading="lazy" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.18),transparent_28%),linear-gradient(90deg,rgba(0,0,0,0.9),rgba(0,0,0,0.58),rgba(0,0,0,0.28))]" />
                      <div className="relative grid gap-6 md:grid-cols-[1fr_190px] min-h-[340px] p-6 md:p-8 items-end">
                        <div className="max-w-2xl">
                          <div className="flex flex-wrap items-center gap-2 mb-4">
                            <span className="text-[11px] uppercase font-black tracking-wider text-background bg-primary px-3 py-1 rounded-full">Focused story</span>
                            {post.topic?.type ? <span className="text-[11px] uppercase font-black tracking-wider text-white/85 bg-white/12 px-3 py-1 rounded-full">{post.topic.type.replace(/-/g, ' ')}</span> : null}
                          </div>
                          <h2 className="text-2xl md:text-4xl font-black text-white leading-tight">{headline}</h2>
                          <p className="mt-4 text-sm md:text-base text-white/88 leading-relaxed">{post.topic?.summary || whyWatchText(heroAnime, 0)}</p>
                        </div>
                        <div className="hidden md:block">
                          <div className="aspect-[2/3] overflow-hidden rounded-2xl border border-white/25 bg-black/30 shadow-2xl">
                            <img src={image} alt={`${heroAnime.title} poster`} className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="relative min-h-[260px] overflow-hidden rounded-2xl border border-border bg-secondary">
                      <img src={image} alt={heroAnime.title} className="absolute inset-0 h-full w-full object-cover brightness-[0.38]" loading="lazy" referrerPolicy="no-referrer" />
                      <div className="relative p-6 md:p-8 max-w-2xl">
                        <p className="text-xs font-black uppercase tracking-wider text-primary mb-3">Current article</p>
                        <h2 className="text-2xl md:text-3xl font-black text-white leading-tight">{article?.heroCallout || `${heroAnime.title} is the main title to watch here`}</h2>
                        <p className="mt-3 text-sm md:text-base text-white/85 leading-relaxed">{whyWatchText(heroAnime, 0)}</p>
                      </div>
                    </div>
                  )
                ) : null}

                <section className="border border-border bg-[var(--glass)] rounded-2xl p-5 md:p-6">
                  <div className="flex items-center gap-2 mb-5"><Newspaper className="w-5 h-5 text-primary" /><h2 className="text-xl md:text-2xl font-black">{isGeminiArticle ? 'Story breakdown' : 'Quick read'}</h2></div>
                  {leadParagraph ? (
                    <p className="border-l-2 border-primary pl-4 text-base md:text-lg font-semibold leading-8 text-foreground">{leadParagraph}</p>
                  ) : null}
                  <div className="mt-5 space-y-5 text-sm md:text-base text-muted-foreground leading-8">
                    {bodyParagraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  </div>
                </section>

                <AdSenseAd />

                {article?.sections?.length ? <section className="space-y-4">
                  {article.sections.map((section, index) => <div key={section.heading} className="border border-border bg-secondary/30 rounded-2xl p-5 md:p-6">
                    <div className="mb-3 flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-black text-primary">{index + 1}</span>
                      <h2 className="text-xl md:text-2xl font-black tracking-tight">{section.heading}</h2>
                    </div>
                    <p className="text-sm md:text-base text-muted-foreground leading-8">{section.body}</p>
                  </div>)}
                </section> : null}

                {takeaways.length ? <section className="grid gap-3 sm:grid-cols-2">
                  {takeaways.map((item) => <div key={item.label} className="border border-border bg-secondary/30 rounded-2xl p-4">
                    <div className="flex items-center gap-2 text-xs font-black uppercase text-primary mb-2"><CheckCircle2 className="w-4 h-4" />{item.label}</div>
                    <div className="text-lg font-black text-foreground">{item.value}</div>
                    <p className="text-sm text-muted-foreground mt-1">{item.detail}</p>
                  </div>)}
                </section> : null}

                {isGeminiArticle ? (
                  <section className="space-y-4">
                    <div>
                      <h2 className="text-2xl md:text-3xl font-black tracking-tight">Related articles</h2>
                      <p className="mt-2 text-sm text-muted-foreground">Keep reading with StreamNyaa guides that help compare momentum, popularity, schedules, and recent episode activity.</p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {relatedArticles.map((related) => (
                        <Link key={related.slug} to={'/blog/' + related.slug} className="group border border-border bg-[var(--glass)] hover:border-primary/40 rounded-2xl p-5 transition-colors">
                          <div className="flex items-center justify-between gap-3 mb-3">
                            <span className="text-[11px] uppercase font-black tracking-wider text-primary bg-primary/10 px-3 py-1 rounded-full">{related.category}</span>
                            <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                          </div>
                          <h3 className="text-lg md:text-xl font-black text-foreground group-hover:text-primary transition-colors leading-tight">{related.title}</h3>
                          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{related.summary}</p>
                          <p className="mt-4 text-sm font-bold text-primary">Read article</p>
                        </Link>
                      ))}
                    </div>
                  </section>
                ) : (
                  <section className="space-y-4">
                    <div>
                      <h2 className="text-2xl md:text-3xl font-black tracking-tight">Current anime picks</h2>
                      <p className="mt-2 text-sm text-muted-foreground">Each title includes useful context so you can decide faster instead of opening random pages one by one.</p>
                    </div>
                    {post.items.map((anime, index) => (
                      <Link key={anime.mal_id + '-' + index} to={animePath(anime)} className="group grid grid-cols-[86px_1fr] sm:grid-cols-[120px_1fr] gap-4 border border-border bg-[var(--glass)] hover:border-primary/40 rounded-2xl p-4 transition-colors">
                        <div className="aspect-[2/3] bg-secondary rounded-xl overflow-hidden border border-border">
                          {anime.image ? <img src={anime.image} alt={anime.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 brightness-90" loading="lazy" referrerPolicy="no-referrer" /> : null}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className="text-xs font-black text-primary">#{index + 1}</span>
                            {anime.format ? <span className="text-[11px] uppercase font-bold text-muted-foreground bg-secondary px-2 py-0.5 rounded">{anime.format}</span> : null}
                            {anime.score ? <span className="inline-flex items-center gap-1 text-[11px] font-bold text-yellow-500"><Star className="w-3 h-3 fill-current" />{anime.score}/100</span> : null}
                            {formatSeason(anime) ? <span className="text-[11px] font-bold text-muted-foreground">{formatSeason(anime)}</span> : null}
                          </div>
                          <h3 className="text-lg md:text-xl font-black text-foreground group-hover:text-primary transition-colors line-clamp-2">{anime.title}</h3>
                          <p className="mt-2 text-sm text-muted-foreground leading-relaxed line-clamp-3">{anime.description || 'Anime metadata and discovery details are available on the StreamNyaa title page.'}</p>
                          <p className="mt-3 text-sm font-semibold text-foreground">{whyWatchText(anime, index)}</p>
                          <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-muted-foreground">
                            {anime.episode ? <span>Episode {anime.episode}</span> : null}
                            {anime.nextEpisode ? <span>Next ep {anime.nextEpisode}</span> : null}
                            {formatTime(anime.airingAt || anime.nextAiringAt) ? <span>{formatTime(anime.airingAt || anime.nextAiringAt)}</span> : null}
                            {formatStatus(anime.status) ? <span>{formatStatus(anime.status)}</span> : null}
                            {anime.episodes ? <span>{anime.episodes} episodes</span> : null}
                            {anime.studios.slice(0, 1).map((studio) => <span key={studio}>{studio}</span>)}
                            {anime.genres.slice(0, 3).map((genre) => <span key={genre}>{genre}</span>)}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </section>
                )}

                <section className="border border-border bg-secondary/30 rounded-2xl p-5 md:p-6">
                  <div className="flex items-center gap-2 mb-4"><HelpCircle className="w-5 h-5 text-primary" /><h2 className="text-xl md:text-2xl font-black">FAQ</h2></div>
                  <div className="space-y-4">
                    {faq.map((item) => <div key={item.question}>
                      <h3 className="font-black text-foreground">{item.question}</h3>
                      <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{item.answer}</p>
                    </div>)}
                  </div>
                </section>
              </>
            )}
          </main>
          <aside className="space-y-5">
            <div className="border border-border rounded-2xl p-5 bg-secondary/30">
              <div className="flex items-center gap-2 font-black text-foreground mb-2"><BarChart3 className="w-5 h-5 text-primary" />{isGeminiArticle ? 'Topic signals' : 'Article stats'}</div>
              <div className="space-y-2 text-sm text-muted-foreground">
                {isGeminiArticle && post.topic?.animeTitle ? <p>Main topic: {post.topic.animeTitle}</p> : null}
                {isGeminiArticle && post.topic?.type ? <p>Angle: {post.topic.type.replace(/-/g, ' ')}</p> : null}
                <p>{post.items.length} anime titles included</p>
                {averageScore(post.items) ? <p>Average score: {averageScore(post.items)}/100</p> : null}
                {uniqueGenres(post.items).length ? <p>Top genres: {uniqueGenres(post.items).slice(0, 3).join(', ')}</p> : null}
                {formatNumber(post.items[0]?.popularity) ? <p>Lead popularity: {formatNumber(post.items[0]?.popularity)}</p> : null}
              </div>
            </div>
            <div className="border border-border rounded-2xl p-5 bg-[var(--glass)]">
              <h2 className="font-black text-foreground mb-3">Explore more</h2>
              <div className="space-y-2 text-sm font-semibold">
                <Link to="/blog" className="flex items-center justify-between hover:text-primary transition-colors">All blog posts <ExternalLink className="w-4 h-4" /></Link>
                <Link to="/schedule" className="flex items-center justify-between hover:text-primary transition-colors">Anime schedule <ExternalLink className="w-4 h-4" /></Link>
                <Link to="/search" className="flex items-center justify-between hover:text-primary transition-colors">Browse anime <ExternalLink className="w-4 h-4" /></Link>
              </div>
            </div>
          </aside>
        </div>
      )}
    </article>
  );
}
