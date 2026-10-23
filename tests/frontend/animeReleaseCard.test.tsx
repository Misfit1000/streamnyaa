import {afterEach,it,expect} from 'vitest';
import {render,screen,cleanup} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import AnimeCard from '../../src/components/AnimeCard';
afterEach(cleanup);
it('advertises and links the selected Sub episode without confusing it with the original broadcast count',()=>{
 const anime={mal_id:101,anilist_id:1,title:'Timed release',releaseEpisode:4,latestEpisode:3,releaseTrack:'sub',type:'TV',homeAvailabilityLabel:'Sub time passed'};
 render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><AnimeCard anime={anime}/></MemoryRouter></QueryClientProvider>);
 expect(screen.getByRole('link').getAttribute('href')).toContain('?ep=4');expect(screen.getByText('Episode 4')).toBeTruthy();expect(screen.queryByText('EP 3')).toBeNull();expect(screen.getByText('Sub time passed')).toBeTruthy();expect(anime.latestEpisode).toBe(3);
});
