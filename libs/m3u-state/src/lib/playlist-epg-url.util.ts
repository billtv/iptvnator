import type { Playlist } from '@iptvnator/shared/interfaces';

export function mergePlaylistEpgUrls(
    playlist: Playlist,
    currentUrls: readonly string[]
): string[] {
    const playlistEpgUrl = getPlaylistEpgUrl(playlist);

    return Array.from(
        new Set(
            [...currentUrls, playlistEpgUrl]
                .filter((url): url is string => typeof url === 'string')
                .map((url) => url.trim())
                .filter(Boolean)
        )
    );
}

export function getPlaylistEpgUrl(playlist: Playlist): string | undefined {
    return (
        (
            playlist.playlist?.header?.attrs?.['x-tvg-url'] as
                | string
                | undefined
        )?.trim() || undefined
    );
}
