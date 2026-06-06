import {
    InlinePlaybackPlayer,
    PlaybackDiagnostic,
    PlaybackDiagnosticCode,
    PlaybackDiagnosticSource,
    createPlaybackSourceMetadata,
} from '../playback-diagnostics/playback-diagnostics.util';

type ShakaErrorLike = {
    category?: number;
    code?: number;
};

export function classifyShakaPlaybackIssue(
    error: unknown,
    streamUrl: string
): PlaybackDiagnostic {
    const shakaError = error as ShakaErrorLike;
    const category = Number(shakaError?.category);
    const code = Number(shakaError?.code);
    const metadata = createPlaybackSourceMetadata({
        url: streamUrl,
        mimeType: 'application/dash+xml',
        player: InlinePlaybackPlayer.Shaka,
    });

    return {
        code:
            category === 1
                ? PlaybackDiagnosticCode.NetworkError
                : category === 3
                  ? PlaybackDiagnosticCode.MediaDecodeError
                  : category === 6
                    ? PlaybackDiagnosticCode.DrmOrEncryption
                    : PlaybackDiagnosticCode.UnknownPlaybackError,
        source: PlaybackDiagnosticSource.Shaka,
        sourceUrl: metadata.url,
        container: metadata.container,
        mimeType: metadata.mimeType,
        player: metadata.player,
        audioCodecs: [],
        videoCodecs: [],
        details: `Shaka playback error category ${Number.isFinite(category) ? category : 'unknown'}, code ${Number.isFinite(code) ? code : 'unknown'}`,
        externalFallbackRecommended: true,
    };
}
