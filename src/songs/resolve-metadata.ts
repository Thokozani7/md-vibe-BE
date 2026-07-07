const PLACEHOLDER_TITLES = new Set(['untitled song', 'untitled', '']);
const PLACEHOLDER_ARTISTS = new Set([
  'unknown artist',
  'uploaded lyrics',
  'unknown',
  '',
]);

export function resolveSongMetadata(
  requestedTitle: string,
  requestedArtist: string,
  inferred?: { title?: unknown; artist?: unknown },
): { title: string; artist: string } {
  const reqTitle = requestedTitle.trim();
  const reqArtist = requestedArtist.trim();
  const infTitle =
    typeof inferred?.title === 'string' ? inferred.title.trim() : '';
  const infArtist =
    typeof inferred?.artist === 'string' ? inferred.artist.trim() : '';

  const title =
    reqTitle && !PLACEHOLDER_TITLES.has(reqTitle.toLowerCase())
      ? reqTitle
      : infTitle || reqTitle || 'Untitled song';

  const artist =
    reqArtist && !PLACEHOLDER_ARTISTS.has(reqArtist.toLowerCase())
      ? reqArtist
      : infArtist || reqArtist || 'Unknown artist';

  return { title, artist };
}
