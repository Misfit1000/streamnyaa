import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Anime {
  mal_id: number | string;
  id?: number | string;
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
  removeFromMyList: (id: number | string) => void;
  clearMyList: () => void;
  isInMyList: (id: number | string) => boolean;
  likes: Array<number | string>;
  likedAnimes: Anime[];
  toggleLike: (anime: Anime | number | string) => void;
  isLiked: (id: number | string) => boolean;
}

function animeStoreId(animeOrId: Anime | number | string) {
  if (typeof animeOrId === 'number' || typeof animeOrId === 'string') return String(animeOrId);
  return String(animeOrId?.mal_id ?? animeOrId?.id ?? animeOrId?.title ?? '');
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
      nsfwMode: false,
      toggleNsfwMode: () => set((state) => ({ nsfwMode: !state.nsfwMode })),
      myList: [],
      addToMyList: (anime) => set((state) => {
        const nextId = animeStoreId(anime);
        const withoutExisting = state.myList.filter((entry) => animeStoreId(entry) !== nextId);
        return { myList: [...withoutExisting, anime] };
      }),
      removeFromMyList: (id) => set((state) => ({ myList: state.myList.filter((a) => animeStoreId(a) !== animeStoreId(id)) })),
      clearMyList: () => set({ myList: [], likes: [], likedAnimes: [] }),
      isInMyList: (id) => get().myList.some((a) => animeStoreId(a) === animeStoreId(id)),
      likes: [],
      likedAnimes: [],
      toggleLike: (animeOrId) => set((state) => {
        const id = animeStoreId(animeOrId);
        const isCurrentlyLiked = state.likes.some((entry) => animeStoreId(entry) === id);
        
        let newLikes = state.likes;
        let newLikedAnimes = state.likedAnimes || [];
        
        if (isCurrentlyLiked) {
          newLikes = state.likes.filter((entry) => animeStoreId(entry) !== id);
          newLikedAnimes = newLikedAnimes.filter((entry) => animeStoreId(entry) !== id);
        } else {
          newLikes = [...state.likes, id];
          if (typeof animeOrId !== 'number' && typeof animeOrId !== 'string') {
            newLikedAnimes = [...newLikedAnimes.filter((entry) => animeStoreId(entry) !== id), animeOrId];
          }
        }
        
        return {
          likes: newLikes,
          likedAnimes: newLikedAnimes
        };
      }),
      isLiked: (id) => get().likes.some((entry) => animeStoreId(entry) === animeStoreId(id)),
    }),
    {
      name: 'shanks-storage',
    }
  )
);
