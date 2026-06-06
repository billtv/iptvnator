import { PlaybackDiagnosticCode } from '../playback-diagnostics/playback-diagnostics.util';
import { classifyShakaPlaybackIssue } from './shaka-error.util';

describe('classifyShakaPlaybackIssue', () => {
    it('maps DRM errors without exposing error data or keys', () => {
        const secretKey = 'ffeeddccbbaa99887766554433221100';
        const issue = classifyShakaPlaybackIssue(
            {
                category: 6,
                code: 6008,
                data: [secretKey],
            },
            'https://example.test/master.mpd'
        );

        expect(issue.code).toBe(PlaybackDiagnosticCode.DrmOrEncryption);
        expect(issue.details).not.toContain(secretKey);
        expect(issue.player).toBe('shaka');
        expect(issue.source).toBe('shaka');
    });
});
