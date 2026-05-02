import { useQuery } from '@tanstack/react-query';
import { fetchPopularAnime, fetchSeasonalAnime, fetchRecentEpisodes, fetchUpcomingAnime, fetchSchedule } from '../api/jikan';
import Spotlight from '../components/Spotlight';
import AnimeCard from '../components/AnimeCard';
import { ChevronRight, PlayCircle, TrendingUp, Calendar, Zap, Star, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { useMemo, useState } from 'react';

export default function Home() {
  const { myList } = useStore();
  const [routineExpanded, setRoutineExpanded] = useState(false);
  const localTimezone = useMemo(() => {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'your local time';
  }, []);

  // Spotlight could still use seasonal/trending releasing
  const { data: seasonalData, isLoading: seasonalLoading } = useQuery({
    queryKey: ['seasonalAnime'],
    queryFn: fetchSeasonalAnime,
  });

  const { data: popularData, isLoading: popularLoading } = useQuery({
    queryKey: ['popularAnime'],
    queryFn: fetchPopularAnime,
  });

  const { data: recentData, isLoading: recentLoading } = useQuery({
    queryKey: ['recentEpisodes'],
    queryFn: fetchRecentEpisodes,
  });

  const { data: upcomingData, isLoading: upcomingLoading } = useQuery({
    queryKey: ['upcomingAnime'],
    queryFn: fetchUpcomingAnime,
  });
  
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const todayStartSeconds = Math.floor(todayStart.getTime() / 1000);
  const todayEndSeconds = Math.floor(todayEnd.getTime() / 1000);
  
  const { data: scheduleData, isLoading: scheduleLoading } = useQuery({
    queryKey: ['todaySchedule', todayStartSeconds, todayEndSeconds],
    queryFn: () => fetchSchedule(1, todayStartSeconds, todayEndSeconds),
  });

  if (seasonalLoading || popularLoading || recentLoading || upcomingLoading || scheduleLoading) {
    return <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>;
  }

  return (
    <div className="pb-20">
      <Spotlight animeList={seasonalData?.data || []} />
      
      <main className="container mx-auto px-4 md:px-10 mt-8 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
        {/* Main Content Area */}
        <div className="space-y-12">
          {/* Recently Updated */}
          <section>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-foreground flex items-center gap-2">
                <PlayCircle className="w-6 h-6 text-primary" /> 
                Recently Updated
              </h2>
              <Link to="/search?sort=recent" className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                View All <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 md:gap-5">
              {recentData?.data?.slice(0, 10).map((anime: any, idx: number) => (
                <AnimeCard key={`recent-${anime.mal_id}-${idx}`} anime={anime} />
              ))}
            </div>
          </section>

          {/* Trending Now */}
          <section>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-foreground flex items-center gap-2">
                <TrendingUp className="w-6 h-6 text-primary" /> 
                Trending Now
              </h2>
              <Link to="/search?sort=trending" className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                View All <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 md:gap-5">
              {seasonalData?.data?.slice(0, 10).map((anime: any, idx: number) => (
                <AnimeCard key={`trending-${anime.mal_id}-${idx}`} anime={anime} />
              ))}
            </div>
          </section>

          {/* Upcoming Anime */}
          <section>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-foreground flex items-center gap-2">
                <Calendar className="w-6 h-6 text-primary" /> 
                Upcoming Anime
              </h2>
              <Link to="/search?sort=upcoming" className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                View All <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 md:gap-5">
              {upcomingData?.data?.slice(0, 5).map((anime: any, idx: number) => (
                <AnimeCard key={`upcoming-${anime.mal_id}-${idx}`} anime={anime} />
              ))}
            </div>
          </section>
        </div>

        {/* Sidebar Area */}
        <div className="space-y-8">
          
          <div className="bg-secondary/50 rounded-3xl p-6 border border-border h-fit flex flex-col transition-all duration-300">
            <div 
              className="flex justify-between items-center mb-6 cursor-pointer group"
              onClick={() => setRoutineExpanded(!routineExpanded)}
            >
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                <div>
                  <h2 className="text-[16px] font-bold group-hover:text-primary transition-colors leading-none">Today's Schedule</h2>
                  <p className="mt-1 text-[11px] text-muted-foreground">Local time: {localTimezone}</p>
                </div>
              </div>
              <button className="text-muted-foreground group-hover:text-primary transition-colors p-1">
                {routineExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </button>
            </div>
            
            <div className={`space-y-3 overflow-hidden transition-all duration-300 ${routineExpanded ? "max-h-[800px] overflow-y-auto custom-scrollbar pr-2" : "max-h-[300px]"}`}>
              {scheduleData?.data?.length === 0 ? (
                <div className="text-sm text-center text-muted-foreground py-4">No episodes scheduled for today.</div>
              ) : (
                scheduleData?.data?.slice(0, routineExpanded ? scheduleData.data.length : 4).map((anime: any) => {
                  const airingTime = new Date(anime.airingAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
                  return (
                    <Link to={`/anime/${anime.mal_id}`} key={`sched-${anime.mal_id}`} className="flex gap-4 group p-2 rounded-xl hover:bg-secondary border border-transparent hover:border-border transition-all">
                      <div className="flex-shrink-0 w-12 h-16 rounded-md overflow-hidden relative">
                        <img 
                          src={anime.images.webp?.large_image_url || anime.images.jpg.large_image_url || anime.images.jpg.image_url} 
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" 
                          alt={anime.title} 
                        />
                      </div>
                      <div className="flex flex-col justify-center min-w-0 flex-1">
                        <div className="text-[13px] font-bold line-clamp-1 group-hover:text-primary transition-colors">{anime.title}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[11px] font-semibold text-muted-foreground bg-background px-1.5 py-0.5 rounded border border-border">
                            Ep {anime.airingEpisode}
                          </span>
                          <span className="text-[11px] font-bold text-primary flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {airingTime}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
            
            {!routineExpanded && scheduleData?.data?.length > 4 && (
              <button 
                onClick={() => setRoutineExpanded(true)}
                className="mt-4 w-full bg-background border border-border hover:border-primary/50 text-center text-[13px] font-bold text-foreground hover:text-primary py-2 rounded-xl transition-colors"
              >
                View all ({scheduleData.data.length})
              </button>
            )}

            <div className="mt-8 pt-6 border-t border-border">
              <div className="flex items-center justify-between mb-4">
                <div className="text-[12px] font-bold text-muted-foreground">MY LIST ({myList.length})</div>
                <Link to="/my-list" className="text-[12px] text-primary hover:underline font-medium">View all</Link>
              </div>
              
              <div className="flex flex-wrap gap-2.5">
                {myList.slice(0, 7).map((anime) => (
                  <Link to={`/anime/${anime.mal_id}`} key={`mylist-${anime.mal_id}`} title={anime.title}>
                    <img src={anime.images?.jpg?.image_url} className="w-9 h-9 rounded-full object-cover border-2 border-transparent hover:border-primary transition-colors bg-secondary" alt={anime.title} />
                  </Link>
                ))}
                {myList.length > 7 ? (
                  <Link to="/my-list" className="w-9 h-9 rounded-full border border-dashed border-muted-foreground flex items-center justify-center text-sm hover:border-primary hover:text-primary transition-colors text-muted-foreground bg-secondary/50">
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                ) : myList.length === 0 ? (
                  <div className="text-xs text-muted-foreground">Your list is empty.</div>
                ) : null}
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
