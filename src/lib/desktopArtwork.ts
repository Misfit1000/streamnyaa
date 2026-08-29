function uniqueArtworkCandidates(values: unknown[]) {
  return values
    .map((value) => String(value || '').trim())
    .filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index);
}

function explicitAniListId(anime: any) {
  const value = Number(
    anime?.anilist_id
    || anime?.idAniList
    || (anime?.coverImage && anime?.id),
  );
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

export function desktopPosterCandidates(anime: any) {
  const anilistId = explicitAniListId(anime);
  const fallbackCover = anilistId ? `https://img.anili.st/media/${anilistId}` : '';

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
    fallbackCover,
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
