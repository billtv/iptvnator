import type { Playlist } from '@iptvnator/shared/interfaces';
import { mergePlaylistEpgUrls } from './playlist-epg-url.util';

describe('mergePlaylistEpgUrls', () => {
    it('adds and deduplicates a playlist header EPG URL', () => {
        const playlist = {
            playlist: {
                header: {
                    attrs: {
                        'x-tvg-url': ' https://example.test/unifi.xml ',
                    },
                },
            },
        } as Playlist;

        expect(
            mergePlaylistEpgUrls(playlist, [
                'https://existing.test/guide.xml',
                'https://example.test/unifi.xml',
            ])
        ).toEqual([
            'https://existing.test/guide.xml',
            'https://example.test/unifi.xml',
        ]);
    });

    it('leaves settings unchanged when the playlist has no EPG URL', () => {
        expect(
            mergePlaylistEpgUrls({ playlist: {} } as Playlist, [
                'https://existing.test/guide.xml',
            ])
        ).toEqual(['https://existing.test/guide.xml']);
    });
});
