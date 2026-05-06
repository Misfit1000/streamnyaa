import React, { useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchAnimeDetails, fetchAnimeEpisodes } from '../api/jikan';
import { Download, Plus, Check, Heart, Star, Calendar, Clock, Tv, Play, Monitor, ChevronLeft, ChevronRight } from 'lucide-react';
import { useStore } from '../store/useStore';
import { animePath, mangaPath, watchPath } from '../lib/slug';
import Seo from '../components/Seo';

function formatStatus(value?: string) {
  return value ? value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Unknown';
}

function formatNextAiring(seconds?: number) {
  if (!seconds) return null;
  return new Date(seconds * 1000).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

export default function AnimeDetails() {
  const { id } = useParams<{ id: string }>();
  const { isInMyList, addToMyList, removeFromMyList, isLiked, toggleLike } = useStore();
  const relationsScrollRef = useRef<HTMLDivElement>(null);
  const recommendationsScrollRef = useRef<HTMLDivElement>(null);

  const scroll = (ref: React.RefObject<HTMLDivElement>, direction: 'left' | 'right') => {
    if (ref.current) {
      const scrollAmount = direction === 'left' ? -300 : 300;
      ref.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const [epPage, setEpPage] = useState(0);

  const { data, isLoading, error } = useQuery({
    queryKey: ['anime', id],
    queryFn: () => fetchAnimeDetails(id!),
    enabled: !!id,
    retry: false
  });

  const { data: episodesData, isLoading: episodesLoading } = useQuery({
    queryKey: ['episodes', id, epPage],
    queryFn: () => fetchAnimeEpisodes(id!, epPage + 1),
    enabled: !!id,
  });

  const anime = data?.data;

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center p-4">
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-8 max-w-md">
          <p className="text-red-500 font-bold mb-4">{error.message || 'An error occurred while fetching details.'}</p>
          <Link to="/" className="text-sm font-semibold text-primary hover:underline">Return Home</Link>
        </div>
      </div>
    );
  }

  if (!anime) return <div className="text-center py-20">Anime not found</div>;

  const inList = isInMyList(anime.mal_id);
  const liked = isLiked(anime.mal_id);
  const genres = anime.genres?.map((genre: any) => genre.name).filter(Boolean) || [];
  const studios = anime.studios?.map((studio: any) => studio.name).filter(Boolean) || [];
  const statusLabel = formatStatus(anime.status);
  const nextEpisodeNumber = anime.nextAiringEpisode?.episode;
  const nextAiringTime = formatNextAiring(anime.nextAiringEpisode?.airingAt);
  const episodeCountText = anime.episodes ? `${anime.episodes} episodes` : nextEpisodeNumber ? `${Math.max(nextEpisodeNumber - 1, 0)} episodes aired so far` : 'episode count not confirmed';
  const seoDescription = `${anime.title} anime details with synopsis, genres, ${episodeCountText}, status, related anime, recommendations, watch links, and download search options.`;
  const mainStudio = studios[0];
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'TVSeries',
      name: anime.title,
      alternateName: [anime.title_english, anime.title_romaji].filter(Boolean),
      description: anime.synopsis || seoDescription,
      image: anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url,
      genre: genres,
      numberOfEpisodes: anime.episodes || undefined,
      aggregateRating: anime.score ? {
        '@type': 'AggregateRating',
        ratingValue: anime.score,
        bestRating: 10,
        worstRating: 0,
      } : undefined,
      productionCompany: mainStudio ? { '@type': 'Organization', name: mainStudio } : undefined,
      url: 'https://www.streamnyaa.xyz' + animePath(anime),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: `What is ${anime.title} about?`,
          acceptedAnswer: {
            '@type': 'Answer',
            text: anime.synopsis || `${anime.title} is an anime listed on StreamNyaa with metadata, episode information, related titles, and discovery links.`,
          },
        },
        {
          '@type': 'Question',
          name: `How many episodes does ${anime.title} have?`,
          acceptedAnswer: {
            '@type': 'Answer',
            text: `${anime.title} has ${episodeCountText}. ${nextEpisodeNumber ? `The next listed episode is episode ${nextEpisodeNumber}${nextAiringTime ? `, scheduled around ${nextAiringTime}` : ''}.` : ''}`,
          },
        },
        {
          '@type': 'Question',
          name: `Where can I find ${anime.title} downloads?`,
          acceptedAnswer: {
            '@type': 'Answer',
            text: `The ${anime.title} downloads page on StreamNyaa helps search public torrent metadata, including episode results, batch results, file sizes, seeders, and sub or dub filters.`,
          },
        },
      ],
    },
  ];

  const handleListToggle = () => {
    if (inList) removeFromMyList(anime.mal_id);
    else addToMyList(anime);
  };

  return (
    <div className="pb-20">
      <Seo
        title={`${anime.title} Anime Details, Episodes and Streaming Info | StreamNyaa`}
        description={seoDescription}
        canonicalPath={animePath(anime)}
        jsonLd={jsonLd}
      />
      {/* Hero Section */}
      <div className="relative h-[50vh] md:h-[60vh] w-full overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent z-10" />
        <div className="absolute inset-0 bg-black/40 z-10" />
        <img
          src={anime.images.jpg.large_image_url}
          alt={anime.title}
          className="w-full h-full object-cover blur-sm scale-105"
          referrerPolicy="no-referrer"
        />
      </div>

      <div className="container mx-auto px-4 relative z-20 -mt-32 md:-mt-48 flex flex-col md:flex-row gap-8">
        {/* Poster */}
        <div className="w-48 md:w-64 shrink-0 mx-auto md:mx-0">
          <div className="aspect-[3/4] rounded-xl overflow-hidden shadow-2xl border-4 border-background bg-secondary">
            <img
              src={anime.images.jpg.large_image_url}
              alt={anime.title}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 pt-4 md:pt-16 text-center md:text-left">
          <h1 className="text-3xl md:text-5xl font-black text-foreground mb-2">{anime.title}</h1>
          <h2 className="text-lg text-muted-foreground mb-6">{anime.title}</h2>

          <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 mb-8 text-sm font-medium">
            <div className="flex items-center gap-1 text-yellow-500">
              <Star className="w-4 h-4 fill-current" />
              <span>{anime.score || 'N/A'}</span>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <Tv className="w-4 h-4" />
              <span>{anime.type}</span>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <Calendar className="w-4 h-4" />
              <span>{anime.year || 'N/A'}</span>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>{anime.episodes ? `${anime.episodes} EPS` : 'N/A'}</span>
            </div>
            <div className="px-2 py-0.5 bg-secondary rounded text-foreground uppercase">
              {anime.status || 'N/A'}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 mb-8">
            <Link
              to={watchPath(anime)}
              className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-3 rounded-full font-bold transition-transform hover:scale-105"
            >
              <Play className="w-5 h-5 fill-current" />
              Watch
            </Link>
            <Link
              to={animePath(anime, '/downloads')}
              className="flex items-center gap-2 bg-secondary hover:bg-secondary/80 text-foreground px-8 py-3 rounded-full font-bold transition-transform hover:scale-105"
            >
              <Download className="w-5 h-5" />
              Downloads
            </Link>
            <button
              onClick={handleListToggle}
              className={`flex items-center gap-2 px-6 py-3 rounded-full font-medium transition-all shadow-sm active:scale-95 ${
                inList 
                  ? 'bg-green-500/20 text-green-500 hover:bg-green-500/30' 
                  : 'bg-secondary hover:bg-secondary/80 text-foreground'
              }`}
            >
              {inList ? <Check className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
              {inList ? 'In List' : 'Add to List'}
            </button>
            <button
              onClick={() => toggleLike(anime)}
              className="p-3 bg-secondary hover:bg-secondary/80 text-foreground rounded-full transition-colors"
            >
              <Heart className={`w-5 h-5 ${liked ? 'fill-primary text-primary' : ''}`} />
            </button>
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold mb-2">Synopsis</h3>
              <p className="text-muted-foreground leading-relaxed">
                {anime.synopsis || 'No synopsis available.'}
              </p>
            </div>

            <div>
              <h3 className="text-lg font-bold mb-2">Genres</h3>
              <div className="flex flex-wrap gap-2">
                {anime.genres?.map((g: any) => (
                  <Link
                    key={g.name}
                    to={`/search?genre=${g.name}`}
                    className="px-3 py-1 bg-secondary/50 hover:bg-secondary text-sm rounded-full text-foreground transition-colors"
                  >
                    {g.name}
                  </Link>
                ))}
              </div>
            </div>

            <section className="mt-8 pt-6 border-t border-[var(--glass-border)]">
              <h3 className="text-lg font-bold mb-3">About {anime.title}</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { label: 'Status', value: statusLabel, detail: anime.status === 'RELEASING' ? 'Currently airing' : 'Release status' },
                  { label: 'Episodes', value: episodeCountText, detail: nextEpisodeNumber ? `Next listed episode: ${nextEpisodeNumber}` : 'Episode information' },
                  { label: 'Format', value: anime.type || 'Anime', detail: anime.year ? `Season year: ${anime.year}` : 'Media format' },
                  { label: 'Score', value: anime.score ? `${anime.score}/10` : 'Not rated', detail: 'Audience score signal' },
                  { label: 'Studio', value: mainStudio || 'Not listed', detail: studios.length > 1 ? `${studios.slice(1, 3).join(', ')} also listed` : 'Main studio info' },
                  { label: 'Genres', value: genres.slice(0, 3).join(', ') || 'Not listed', detail: genres.length > 3 ? `${genres.length} genre tags total` : 'Genre tags' },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-[var(--glass-border)] bg-[var(--glass)] p-4">
                    <p className="text-xs font-black uppercase tracking-wider text-primary">{item.label}</p>
                    <p className="mt-2 text-base font-bold text-foreground">{item.value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-8 pt-6 border-t border-[var(--glass-border)] space-y-4">
              <div>
                <h3 className="text-lg font-bold mb-2">Episode and release information</h3>
                <p className="text-muted-foreground leading-relaxed">
                  {anime.status === 'RELEASING'
                    ? `${anime.title} is currently airing. ${nextEpisodeNumber ? `Episode ${nextEpisodeNumber} is the next listed episode${nextAiringTime ? ` and is scheduled around ${nextAiringTime}` : ''}.` : 'New episode timing is updated when schedule data is available.'} The episode list below focuses on episodes that are already available or listed by public metadata.`
                    : anime.status === 'FINISHED'
                      ? `${anime.title} is listed as finished, so the episode list is useful for browsing the full release order, checking episode pages, and opening watch or download searches.`
                      : `${anime.title} has release information listed as ${statusLabel}. Episode details may update as more official metadata becomes available.`}
                </p>
              </div>
              <div>
                <h3 className="text-lg font-bold mb-2">Watch and download context</h3>
                <p className="text-muted-foreground leading-relaxed">
                  StreamNyaa organizes {anime.title} with watch links, episode navigation, related anime, recommendations, and download search tools. The downloads page can search public torrent metadata by episode, batch, quality, subtitle, or dub preference, while this page keeps the anime details and episode order easy to scan.
                </p>
              </div>
            </section>

            <section className="mt-8 pt-6 border-t border-[var(--glass-border)]">
              <h3 className="text-lg font-bold mb-4">FAQ</h3>
              <div className="space-y-4">
                {[
                  {
                    question: `What is ${anime.title} about?`,
                    answer: anime.synopsis || `${anime.title} is an anime page with metadata, episode information, related titles, and StreamNyaa discovery links.`,
                  },
                  {
                    question: `Is ${anime.title} currently airing?`,
                    answer: `${anime.title} is listed as ${statusLabel}.${anime.status === 'RELEASING' && nextEpisodeNumber ? ` The next listed episode is episode ${nextEpisodeNumber}${nextAiringTime ? ` around ${nextAiringTime}` : ''}.` : ''}`,
                  },
                  {
                    question: `Can I find ${anime.title} episode downloads?`,
                    answer: `Yes. Open the downloads page to search public torrent metadata for ${anime.title}, including episode results, batch results, file sizes, seeders, and sub or dub filters.`,
                  },
                ].map((item) => (
                  <div key={item.question} className="rounded-xl border border-[var(--glass-border)] bg-secondary/20 p-4">
                    <h4 className="font-bold text-foreground">{item.question}</h4>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{item.answer}</p>
                  </div>
                ))}
              </div>
            </section>

            {anime.relations && anime.relations.length > 0 && (
              <div className="relative group/carousel">
                <h3 className="text-lg font-bold mb-4 mt-8 pt-6 border-t border-[var(--glass-border)]">Related Anime</h3>
                <button 
                  onClick={() => scroll(relationsScrollRef, 'left')}
                  className="absolute left-0 top-[60%] -translate-y-1/2 -ml-4 z-10 p-2 bg-background/80 backdrop-blur border border-[var(--glass-border)] rounded-full shadow-lg opacity-0 group-hover/carousel:opacity-100 transition-opacity disabled:opacity-0 hidden md:flex"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div ref={relationsScrollRef} className="flex overflow-x-auto gap-4 pb-4 snap-x pr-4 scroll-smooth hide-scrollbar w-full">
                    {anime.relations.flatMap((r: any) => 
                      r.entry.map((entry: any) => (
                        <Link 
                          key={`${r.relation}-${entry.mal_id}`} 
                          to={entry.type === 'MANGA' ? mangaPath(entry) : animePath(entry)}
                          className="flex-none w-[140px] sm:w-[160px] md:w-[180px] group snap-start"
                        >
                          <div className="aspect-[2/3] rounded-xl overflow-hidden mb-3 relative bg-secondary border border-[var(--glass-border)]">
                            <img 
                              src={entry.images?.jpg?.large_image_url || entry.images?.jpg?.image_url} 
                              alt={entry.name}
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                              loading="lazy"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3">
                               <span className="text-[11px] uppercase font-black text-primary tracking-wider">{r.relation.replace(/_/g, ' ')}</span>
                            </div>
                          </div>
                          <h4 className="text-sm font-semibold line-clamp-2 transition-colors group-hover:text-primary leading-tight">{entry.name}</h4>
                          <p className="text-xs text-muted-foreground mt-1.5 capitalize font-medium">{entry.type}</p>
                        </Link>
                      ))
                    )}
                </div>
                <button 
                  onClick={() => scroll(relationsScrollRef, 'right')}
                  className="absolute right-0 top-[60%] -translate-y-1/2 -mr-4 z-10 p-2 bg-background/80 backdrop-blur border border-[var(--glass-border)] rounded-full shadow-lg opacity-0 group-hover/carousel:opacity-100 transition-opacity disabled:opacity-0 hidden md:flex"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}

            {anime.recommendations && anime.recommendations.length > 0 && (
              <div className="relative group/carousel">
                <h3 className="text-lg font-bold mb-4 mt-8 pt-6 border-t border-[var(--glass-border)]">Recommendations</h3>
                <button 
                  onClick={() => scroll(recommendationsScrollRef, 'left')}
                  className="absolute left-0 top-[60%] -translate-y-1/2 -ml-4 z-10 p-2 bg-background/80 backdrop-blur border border-[var(--glass-border)] rounded-full shadow-lg opacity-0 group-hover/carousel:opacity-100 transition-opacity disabled:opacity-0 hidden md:flex"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div ref={recommendationsScrollRef} className="flex overflow-x-auto gap-4 pb-4 snap-x pr-4 scroll-smooth hide-scrollbar w-full">
                    {anime.recommendations.map((entry: any) => (
                      <Link 
                        key={`rec-${entry.mal_id}`} 
                        to={entry.type === 'MANGA' ? mangaPath(entry) : animePath(entry)}
                        className="flex-none w-[140px] sm:w-[160px] md:w-[180px] group snap-start"
                      >
                        <div className="aspect-[2/3] rounded-xl overflow-hidden mb-3 relative bg-secondary border border-[var(--glass-border)]">
                          <img 
                            src={entry.images?.jpg?.large_image_url || entry.images?.jpg?.image_url} 
                            alt={entry.title}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                            loading="lazy"
                          />
                        </div>
                        <h4 className="text-sm font-semibold line-clamp-2 transition-colors group-hover:text-primary leading-tight">{entry.title}</h4>
                      </Link>
                    ))}
                </div>
                <button 
                  onClick={() => scroll(recommendationsScrollRef, 'right')}
                  className="absolute right-0 top-[60%] -translate-y-1/2 -mr-4 z-10 p-2 bg-background/80 backdrop-blur border border-[var(--glass-border)] rounded-full shadow-lg opacity-0 group-hover/carousel:opacity-100 transition-opacity disabled:opacity-0 hidden md:flex"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}

            {anime.trailer?.embed_url && (
              <div className="mt-8 pt-6 border-t border-[var(--glass-border)]">
                <h3 className="text-lg font-bold mb-4">Trailer</h3>
                <div className="max-w-2xl mx-auto lg:mx-0">
                  <div className="aspect-video bg-black rounded-xl overflow-hidden border border-[var(--glass-border)] relative">
                    <iframe 
                      src={anime.trailer.embed_url}
                      className="w-full h-full border-0 absolute inset-0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      title={`${anime.title} Trailer`}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Episodes List */}
            <div className="mt-8 pt-6 border-t border-[var(--glass-border)]">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-bold">Episodes</h3>
                  <span className="text-sm px-2 py-0.5 bg-secondary rounded-md font-medium text-foreground">{anime.episodes || '?'} Episodes</span>
                </div>
                
                {(() => {
                  const airedCount = anime?.nextAiringEpisode ? anime.nextAiringEpisode.episode - 1 : 
                    (anime?.status === 'RELEASING' || anime?.status === 'NOT_YET_RELEASED' ? (episodesData?.data?.length > 0 ? Math.max(...episodesData.data.map((e: any) => e.mal_id)) : 0) : (anime?.episodes || (episodesData?.data?.length > 0 ? Math.max(...episodesData.data.map((e: any) => e.mal_id)) : 12)));
                  const lastVisiblePage = Math.ceil(airedCount / 100) || 1;
                  
                  if (lastVisiblePage > 1) {
                    return (
                      <select 
                        className="bg-secondary text-[13px] font-semibold rounded-lg px-3 py-2 border border-border focus:outline-none focus:border-primary cursor-pointer text-foreground"
                        value={epPage}
                        onChange={(e) => setEpPage(parseInt(e.target.value))}
                      >
                        {Array.from({ length: lastVisiblePage }, (_, i) => (
                          <option key={i} value={i} className="bg-background">
                            Episodes {i * 100 + 1} - {i === lastVisiblePage - 1 ? airedCount : (i + 1) * 100}
                          </option>
                        ))}
                      </select>
                    );
                  }
                  return null;
                })()}
              </div>
              <div className="space-y-4 max-w-5xl">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {(() => {
                    const episodes = episodesData?.data || [];
                    const airedCount = anime?.nextAiringEpisode ? anime.nextAiringEpisode.episode - 1 : 
                      (anime?.status === 'RELEASING' || anime?.status === 'NOT_YET_RELEASED' ? (episodes.length > 0 ? Math.max(...episodes.map((e: any) => e.mal_id)) : 0) : (anime?.episodes || (episodes.length > 0 ? Math.max(...episodes.map((e: any) => e.mal_id)) : 12)));
                    const maxEpCount = airedCount;

                    const displayEpisodes = Array.from({ length: 100 }, (_, i) => {
                      const epNum = epPage * 100 + i + 1;
                      if (epNum > maxEpCount) return null;
                      
                      const jikanEp = episodes.find((e: any) => e.mal_id === epNum);
                      if (jikanEp) return jikanEp;
                      
                      let epTitle = `Episode ${epNum}`;
                      return { mal_id: epNum, title: epTitle, image: '' };
                    }).filter(Boolean);
                    
                    return displayEpisodes.map((ep: any, index: number) => {
                      const epNum = ep.mal_id || epPage * 100 + index + 1;
                      return (
                        <div key={epNum} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-[var(--glass)] border border-[var(--glass-border)] rounded-xl gap-4">
                          <div className="flex items-center gap-4 min-w-0">
                            <span className="text-xl font-black text-muted-foreground w-8 shrink-0">{epNum}</span>
                            <div className="min-w-0 flex-1">
                              <h4 className="font-semibold text-base line-clamp-1">{ep.title || ep.title_romanji || ep.title_english || `Episode ${epNum}`}</h4>
                              {ep.aired && <p className="text-xs text-muted-foreground mt-1">{new Date(ep.aired).toLocaleDateString()}</p>}
                            </div>
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <Link 
                              to={`${watchPath(anime)}?ep=${epNum}&type=sub`}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-sm font-semibold transition-colors shrink-0"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              Watch Sub
                            </Link>
                            <Link 
                              to={`${watchPath(anime)}?ep=${epNum}&type=dub`}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg text-sm font-semibold transition-colors shrink-0"
                            >
                              <Monitor className="w-3.5 h-3.5" />
                              Watch Dub
                            </Link>
                            <Link 
                              to={`${animePath(anime, '/downloads')}?ep=${epNum}&type=sub`}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg text-sm font-semibold transition-colors shrink-0"
                            >
                              <Download className="w-3.5 h-3.5" />
                              DL Sub
                            </Link>
                            <Link 
                              to={`${animePath(anime, '/downloads')}?ep=${epNum}&type=dub`}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg text-sm font-semibold transition-colors shrink-0"
                            >
                              <Download className="w-3.5 h-3.5" />
                              DL Dub
                            </Link>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
            
          </div>
        </div>
      </div>
    </div>
  );
}
