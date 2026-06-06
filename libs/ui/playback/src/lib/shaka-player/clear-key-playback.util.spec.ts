import { VideoPlayer } from '@iptvnator/shared/interfaces';
import { isSupportedClearKeyPlayback } from './clear-key-playback.util';

const playback = {
    streamUrl: 'https://example.test/live/master.mpd?token=abc',
    title: 'DRM channel',
    manifestType: 'dash' as const,
    drm: {
        type: 'clearkey' as const,
        clearKeys: {
            '00112233445566778899aabbccddeeff':
                'ffeeddccbbaa99887766554433221100',
        },
    },
};

describe('isSupportedClearKeyPlayback', () => {
    it.each([
        VideoPlayer.VideoJs,
        VideoPlayer.Html5Player,
        VideoPlayer.ArtPlayer,
    ])('routes ClearKey DASH through Shaka for %s controls', (player) => {
        expect(isSupportedClearKeyPlayback(playback, player)).toBe(true);
    });

    it('does not route embedded or external players through Shaka', () => {
        expect(
            isSupportedClearKeyPlayback(playback, VideoPlayer.EmbeddedMpv)
        ).toBe(false);
        expect(isSupportedClearKeyPlayback(playback, VideoPlayer.MPV)).toBe(
            false
        );
    });

    it('infers DASH from an MPD URL without changing clear playback', () => {
        expect(
            isSupportedClearKeyPlayback(
                { ...playback, manifestType: undefined },
                VideoPlayer.VideoJs
            )
        ).toBe(true);
        expect(
            isSupportedClearKeyPlayback(
                { streamUrl: playback.streamUrl, title: playback.title },
                VideoPlayer.VideoJs
            )
        ).toBe(false);
    });
});
