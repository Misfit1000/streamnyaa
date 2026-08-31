function uniqueArtworkCandidates(values: unknown[]) {
  return values
    .map((value) => String(value || '').trim())
    .filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index);
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
