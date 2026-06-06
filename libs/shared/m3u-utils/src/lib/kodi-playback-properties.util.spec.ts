import type { ParsedPlaylist } from '@iptvnator/shared/interfaces';
import {
    normalizeParsedPlaylistMetadata,
    parseKodiPlaybackProperties,
} from './kodi-playback-properties.util';

const KEY_ID = '00112233445566778899aabbccddeeff';
const CONTENT_KEY = 'ffeeddccbbaa99887766554433221100';

describe('Kodi playback property parsing', () => {
    it('normalizes DASH ClearKey metadata', () => {
        expect(
            parseKodiPlaybackProperties([
                '#KODIPROP:inputstreamaddon=inputstream.adaptive',
                '#KODIPROP:INPUTSTREAM.ADAPTIVE.MANIFEST_TYPE=MPD',
                '#KODIPROP:inputstream.adaptive.license_type=org.w3.clearkey',
                `#KODIPROP:inputstream.adaptive.license_key=0x00112233-4455-6677-8899-AABBCCDDEEFF:0x${CONTENT_KEY.toUpperCase()}`,
            ])
        ).toEqual({
            manifestType: 'dash',
            drm: {
                type: 'clearkey',
                clearKeys: {
                    [KEY_ID]: CONTENT_KEY,
                },
            },
        });
    });

    it('accepts multiple mappings and excludes malformed mappings', () => {
        const result = parseKodiPlaybackProperties([
            '#KODIPROP:inputstream.adaptive.manifest_type=dash',
            '#KODIPROP:inputstream.adaptive.license_type=clearkey',
            `#KODIPROP:inputstream.adaptive.license_key=${KEY_ID}:${CONTENT_KEY}|bad:${CONTENT_KEY}`,
            '#KODIPROP:inputstream.adaptive.license_key=11111111111111111111111111111111:22222222222222222222222222222222',
        ]);

        expect(result.drm?.clearKeys).toEqual({
            [KEY_ID]: CONTENT_KEY,
            '11111111111111111111111111111111':
                '22222222222222222222222222222222',
        });
    });

    it('retains an invalid explicit ClearKey declaration without valid keys', () => {
        expect(
            parseKodiPlaybackProperties([
                '#KODIPROP:inputstream.adaptive.license_type=clearkey',
                '#KODIPROP:inputstream.adaptive.license_key=invalid',
            ])
        ).toEqual({
            drm: {
                type: 'clearkey',
                clearKeys: {},
            },
        });
    });

    it('does not treat another DRM system as ClearKey', () => {
        expect(
            parseKodiPlaybackProperties([
                '#KODIPROP:inputstream.adaptive.manifest_type=mpd',
                '#KODIPROP:inputstream.adaptive.license_type=com.widevine.alpha',
                `#KODIPROP:inputstream.adaptive.license_key=${KEY_ID}:${CONTENT_KEY}`,
            ])
        ).toEqual({ manifestType: 'dash' });
    });
});

describe('playlist metadata normalization', () => {
    it('associates pre-EXTINF properties and an unquoted EPG URL', () => {
        const raw = `#EXTM3U x-tvg-url=https://example.test/guide.xml

#KODIPROP:inputstreamaddon=inputstream.adaptive
# an unrelated comment
#KODIPROP:inputstream.adaptive.manifest_type=mpd
#KODIPROP:inputstream.adaptive.license_type=clearkey
#KODIPROP:inputstream.adaptive.license_key=${KEY_ID}:${CONTENT_KEY}
#EXTINF:-1 tvg-name="HBO",HBO
https://example.test/live/master.mpd?token=abc`;

        const result = normalizeParsedPlaylistMetadata(
            raw,
            createParsedPlaylist(['HBO'])
        );

        expect(result.header.attrs['x-tvg-url']).toBe(
            'https://example.test/guide.xml'
        );
        expect(result.items[0]).toEqual(
            expect.objectContaining({
                manifestType: 'dash',
                drm: {
                    type: 'clearkey',
                    clearKeys: { [KEY_ID]: CONTENT_KEY },
                },
            })
        );
    });

    it('supports quoted url-tvg and properties after EXTINF', () => {
        const raw = `#EXTM3U url-tvg="https://example.test/guide.xml"
#EXTINF:-1,One
#KODIPROP:inputstream.adaptive.manifest_type=mpd
#KODIPROP:inputstream.adaptive.license_type=clearkey
#KODIPROP:inputstream.adaptive.license_key=${KEY_ID}:${CONTENT_KEY}
https://example.test/extensionless`;

        const result = normalizeParsedPlaylistMetadata(
            raw,
            createParsedPlaylist(['One'])
        );

        expect(result.header.attrs['x-tvg-url']).toBe(
            'https://example.test/guide.xml'
        );
        expect(result.items[0].manifestType).toBe('dash');
    });

    it('does not leak pending properties to the next channel', () => {
        const raw = `#EXTM3U
#KODIPROP:inputstream.adaptive.manifest_type=mpd
#KODIPROP:inputstream.adaptive.license_type=clearkey
#KODIPROP:inputstream.adaptive.license_key=${KEY_ID}:${CONTENT_KEY}
#EXTINF:-1,One
https://example.test/one.mpd

#EXTINF:-1,Two
https://example.test/two.m3u8`;

        const result = normalizeParsedPlaylistMetadata(
            raw,
            createParsedPlaylist(['One', 'Two'])
        );

        expect(result.items[0].drm).toBeDefined();
        expect(result.items[1].drm).toBeUndefined();
        expect(result.items[1].manifestType).toBeUndefined();
    });
});

function createParsedPlaylist(names: string[]): ParsedPlaylist {
    return {
        header: {
            attrs: { 'x-tvg-url': '' },
            raw: '#EXTM3U',
        },
        items: names.map((name) => ({
            name,
            tvg: {
                id: '',
                name,
                url: '',
                logo: '',
                rec: '',
            },
            group: { title: '' },
            http: { referrer: '', 'user-agent': '' },
            url: `https://example.test/${name}`,
            raw: '',
        })),
    };
}
