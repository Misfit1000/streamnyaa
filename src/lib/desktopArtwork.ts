function uniqueArtworkCandidates(values: unknown[]) {
  return values
    .map((value) => String(value || '').trim())
    .filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index);
}

export function desktopLandscapeImageCandidates(values: unknown[]) {
  return uniqueArtworkCandidates(values.flatMap((value) => {
    try {
      const url = new URL(String(value || ''));
      if (url.protocol !== 'https:' || url.username || url.password) return [];
      const original = url.toString();
      if (url.hostname === 'image.tmdb.org' && /^\/t\/p\/w\d+\//.test(url.pathname)) {
        url.pathname = url.pathname.replace(/^\/t\/p\/w\d+\//, '/t/p/w1280/');
        return [url.toString(), original];
      }
      const youtubeId = url.hostname === 'i.ytimg.com'
        ? url.pathname.match(/^\/vi\/([\w-]{6,20})\/[^/]+\.jpg$/)?.[1]
        : undefined;
      return youtubeId
        ? [`https://i.ytimg.com/vi/${youtubeId}/maxresdefault.jpg`, original]
        : [original];
    } catch {
      return [];
    }
  })).slice(0, 10);
}

export function desktopPosterCandidates(anime: any) {
  return uniqueArtworkCandidates([
    anime?.coverImage?.extraLarge,
    anime?.coverImage?.large,
    anime?.coverImage?.medium,
    anime?.cover_image,
    anime?.cover,
    anime?.poster,
    anime?.posterImage,
    anime?.poster_image,
    anime?.images?.webp?.large_image_url,
    anime?.images?.jpg?.large_image_url,
    anime?.images?.webp?.image_url,
    anime?.images?.jpg?.image_url,
    anime?.thumbnail,
    anime?.image_url,
    anime?.image,
  ]).filter((value) => !/\/(?:banner|backdrop)\//i.test(value));
}

export function desktopSpotlightArtworkCandidates(anime: any) {
  return uniqueArtworkCandidates([
    anime?.banner_image,
    anime?.bannerImage,
    anime?.backdrop,
    anime?.background,
    ...desktopPosterCandidates(anime),
  ]);
}
