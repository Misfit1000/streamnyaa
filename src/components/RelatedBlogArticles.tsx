import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Newspaper } from 'lucide-react';
import { articlePath, fetchArchivedBlogPosts } from '../api/blog';
import type { BlogPostData } from '../api/blog';

type RelatedBlogArticlesProps = {
  title?: string;
  query?: string;
  animeTitle?: string;
  malId?: number;
  genres?: string[];
  limit?: number;
  className?: string;
};

function normalize(value = '') {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function headline(post: BlogPostData) {
  return post.article?.headline || post.topic?.title || post.title;
}

function excerpt(post: BlogPostData) {
  return post.article?.excerpt || post.topic?.summary || post.summary;
}

function image(post: BlogPostData) {
  return post.topic?.image || post.items?.[0]?.image || '';
}

function scorePost(post: BlogPostData, terms: string[], genres: string[], malId?: number) {
  const titleText = normalize(headline(post));
  const summaryText = normalize([excerpt(post), post.description, post.topic?.animeTitle, post.topic?.title].filter(Boolean).join(' '));
  const itemText = normalize((post.items || []).flatMap((item) => [item.title, ...item.genres]).join(' '));
  let score = 0;

  if (malId && (post.topic?.malId === malId || post.items?.some((item) => item.mal_id === malId))) score += 12;

  for (const term of terms) {
    if (!term) continue;
    if (titleText.includes(term)) score += 5;
    if (summaryText.includes(term)) score += 4;
    if (itemText.includes(term)) score += 3;
  }

  for (const genre of genres.map(normalize).filter(Boolean)) {
    if (titleText.includes(genre)) score += 2;
    if (summaryText.includes(genre)) score += 2;
    if (itemText.includes(genre)) score += 3;
  }

  if (post.articleKind === 'gemini') score += 1;
  return score;
}

export default function RelatedBlogArticles({ title = 'Related anime articles', query = '', animeTitle = '', malId, genres = [], limit = 3, className = '' }: RelatedBlogArticlesProps) {
  const terms = [query, animeTitle]
    .flatMap((value) => normalize(value).split(' '))
    .filter((term) => term.length > 2 && !['anime', 'season', 'episode', 'the'].includes(term));

  const enabled = Boolean(terms.length || genres.length || malId);
  const { data: posts = [] } = useQuery({
    queryKey: ['related-blog-articles', query, animeTitle, malId, genres.join('|'), limit],
    queryFn: () => fetchArchivedBlogPosts(true),
    enabled,
    staleTime: 1000 * 60 * 60,
  });

  if (!enabled) return null;

  const related = posts
    .map((post) => ({ post, score: scorePost(post, terms, genres, malId) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.post);

  if (!related.length) return null;

  return (
    <section className={className} aria-labelledby="related-blog-heading">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 id="related-blog-heading" className="flex items-center gap-2 text-xl font-black text-foreground">
            <Newspaper className="h-5 w-5 text-primary" />
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Useful reads connected to this search, title, or genre.</p>
        </div>
        <Link to="/blog" className="hidden text-sm font-black text-primary hover:underline sm:inline-flex">Blog</Link>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {related.map((post) => (
          <Link key={articlePath(post)} to={articlePath(post)} className="group overflow-hidden rounded-xl border border-border bg-[var(--glass)] transition-colors hover:border-primary/40">
            <div className="aspect-[16/9] overflow-hidden bg-secondary">
              {image(post) ? <img src={image(post)} alt={headline(post)} className="h-full w-full object-cover brightness-90 transition-transform duration-300 group-hover:scale-105" loading="lazy" referrerPolicy="no-referrer" /> : null}
            </div>
            <div className="p-4">
              <div className="mb-2 text-[11px] font-black uppercase tracking-wider text-primary">{post.category}</div>
              <h3 className="line-clamp-2 text-base font-black leading-tight text-foreground group-hover:text-primary">{headline(post)}</h3>
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{excerpt(post)}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-black text-primary">
                Read article
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
