export type AnimeSeason = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';

export function getCurrentAnimeSeason(date = new Date()): { season: AnimeSeason; year: number } {
  const month = date.getMonth() + 1;
  let season: AnimeSeason = 'WINTER';

  if (month >= 4 && month <= 6) {
    season = 'SPRING';
  } else if (month >= 7 && month <= 9) {
    season = 'SUMMER';
  } else if (month >= 10) {
    season = 'FALL';
  }

  return {
    season,
    year: date.getFullYear(),
  };
}
