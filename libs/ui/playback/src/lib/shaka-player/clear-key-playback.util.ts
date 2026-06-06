import type {
    ResolvedPortalPlayback,
    VideoPlayer,
} from '@iptvnator/shared/interfaces';
import { getPlaybackMediaExtensionFromUrl } from '../playback-diagnostics/playback-diagnostics.util';

const WEB_PLAYERS = new Set<string>(['videojs', 'html5', 'artplayer']);

export function isSupportedClearKeyPlayback(
    playback: ResolvedPortalPlayback,
    selectedPlayer: VideoPlayer
): boolean {
    if (!WEB_PLAYERS.has(selectedPlayer) || playback.drm?.type !== 'clearkey') {
        return false;
    }

    const manifestType =
        playback.manifestType ??
        (getPlaybackMediaExtensionFromUrl(playback.streamUrl) === 'mpd'
            ? 'dash'
            : undefined);

    return manifestType === 'dash';
}
