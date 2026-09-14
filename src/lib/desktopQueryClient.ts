import { createAppQueryClient } from './queryClient';

// One desktop query client is shared by the router and intent preloader so a
// hover/pointer prefetch hydrates the exact cache read by the destination page.
export const desktopQueryClient = createAppQueryClient(true);
