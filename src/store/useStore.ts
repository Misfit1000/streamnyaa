import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Anime {
  mal_id: number;
  title: string;
  images: {
    jpg: {
      image_url: string;
      large_image_url: string;
    };
  };
  score: number;
  episodes: number;
  type: string;
  year: number;
  genres: { name: string }[];
}

interface StoreState {
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  nsfwMode: boolean;
  toggleNsfwMode: () => void;
  myList: Anime[];
  addToMyList: (anime: Anime) => void;
  removeFromMyList: (id: number) => void;
  clearMyList: () => void;
  isInMyList: (id: number) => boolean;
  likes: number[];
  likedAnimes: Anime[];
  toggleLike: (anime: Anime | number) => void;
  isLiked: (id: number) => boolean;
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
      nsfwMode: false,
      toggleNsfwMode: () => set((state) => ({ nsfwMode: !state.nsfwMode })),
      myList: [],
      addToMyList: (anime) => set((state) => ({ myList: [...state.myList, anime] })),
      removeFromMyList: (id) => set((state) => ({ myList: state.myList.filter((a) => a.mal_id !== id) })),
      clearMyList: () => set({ myList: [], likes: [], likedAnimes: [] }),
      isInMyList: (id) => get().myList.some((a) => a.mal_id === id),
      likes: [],
      likedAnimes: [],
      toggleLike: (animeOrId) => set((state) => {
        const id = typeof animeOrId === 'number' ? animeOrId : animeOrId.mal_id;
        const isCurrentlyLiked = state.likes.includes(id);
        
        let newLikes = state.likes;
        let newLikedAnimes = state.likedAnimes || [];
        
        if (isCurrentlyLiked) {
          newLikes = state.likes.filter(l => l !== id);
          newLikedAnimes = newLikedAnimes.filter(a => a.mal_id !== id);
        } else {
          newLikes = [...state.likes, id];
          if (typeof animeOrId !== 'number') {
            newLikedAnimes = [...newLikedAnimes, animeOrId];
          }
        }
        
        return {
          likes: newLikes,
          likedAnimes: newLikedAnimes
        };
      }),
      isLiked: (id) => get().likes.includes(id),
    }),
    {
      name: 'shanks-storage',
    }
  )
);
