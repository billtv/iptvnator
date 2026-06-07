import type {
    PlaybackDrmConfiguration,
    PlaybackManifestType,
} from '@iptvnator/shared/interfaces';
import { loadShakaPlayer } from './shaka-player.loader';

export interface ShakaPlaybackRequest {
    streamUrl: string;
    manifestType: PlaybackManifestType;
    drm: PlaybackDrmConfiguration;
    headers?: Readonly<Record<string, string>>;
    startTime?: number;
    volume: number;
}

export interface ShakaAudioTrack {
    index: number;
    active: boolean;
    label: string;
    language: string;
}

export interface ShakaTextTrack {
    id: number;
    active: boolean;
    label: string;
    language: string;
}

type ShakaPlayerInstance = InstanceType<
    Awaited<ReturnType<typeof loadShakaPlayer>>['Player']
>;

export class ShakaPlaybackAdapter {
    private player: ShakaPlayerInstance | null = null;
    private video: HTMLVideoElement | null = null;
    private requestFilter:
        | ((type: number, request: { headers: Record<string, string> }) => void)
        | null = null;

    async attach(
        video: HTMLVideoElement,
        videoContainer: HTMLElement
    ): Promise<void> {
        if (this.player && this.video === video) {
            return;
        }

        await this.destroy();
        const shaka = await loadShakaPlayer();
        this.video = video;
        const player = new shaka.Player(video);
        this.player = player;
        player.setVideoContainer(videoContainer);
        player.configure({
            textDisplayFactory: (textPlayer: ShakaPlayerInstance) =>
                new shaka.text.UITextDisplayer(textPlayer),
        });
    }

    async load(request: ShakaPlaybackRequest): Promise<void> {
        if (!this.player || !this.video) {
            throw new Error('Shaka Player is not attached');
        }

        if (
            Object.keys(request.drm.clearKeys).length === 0 &&
            !request.drm.licenseServerUrl
        ) {
            throw new Error('Invalid ClearKey configuration');
        }

        await this.player.unload();
        this.removeRequestFilter();

        const drmServers = request.drm.licenseServerUrl
            ? { 'org.w3.clearkey': request.drm.licenseServerUrl }
            : {};
        this.player.configure({
            drm: {
                clearKeys: { ...request.drm.clearKeys },
                servers: drmServers,
            },
        });

        const networkingEngine = this.player.getNetworkingEngine();
        const headers = request.headers ?? {};
        const licenseHeaders = request.drm.headers ?? {};
        if (
            networkingEngine &&
            (Object.keys(headers).length > 0 ||
                Object.keys(licenseHeaders).length > 0)
        ) {
            const shaka = await loadShakaPlayer();
            this.requestFilter = (type, networkRequest) => {
                const selectedHeaders =
                    type === shaka.net.NetworkingEngine.RequestType.LICENSE
                        ? licenseHeaders
                        : headers;
                for (const [name, value] of Object.entries(selectedHeaders)) {
                    if (isBrowserSettableHeader(name)) {
                        networkRequest.headers[name] = value;
                    }
                }
            };
            networkingEngine.registerRequestFilter(this.requestFilter);
        }

        this.video.volume = request.volume;
        await this.player.load(
            request.streamUrl,
            request.startTime || null,
            request.manifestType === 'dash'
                ? 'application/dash+xml'
                : 'application/x-mpegURL'
        );
        await this.video.play().catch(() => undefined);
    }

    getAudioTracks(): ShakaAudioTrack[] {
        return (
            this.player?.getAudioTracks().map((track, index) => ({
                index,
                active: track.active,
                label:
                    track.label ||
                    track.originalLanguage ||
                    track.language ||
                    `Track ${index + 1}`,
                language: track.language,
            })) ?? []
        );
    }

    getTextTracks(): ShakaTextTrack[] {
        return (
            this.player?.getTextTracks().map((track) => ({
                id: track.id,
                active: track.active,
                label:
                    track.label ||
                    track.originalLanguage ||
                    track.language ||
                    `Subtitle ${track.id}`,
                language: track.language,
            })) ?? []
        );
    }

    selectAudioTrack(index: number): void {
        const track = this.player?.getAudioTracks()[index];
        if (track) {
            this.player?.selectAudioTrack(track);
        }
    }

    selectTextTrack(id: number | null): void {
        if (id === null) {
            this.player?.selectTextTrack(null);
            return;
        }

        const track = this.player
            ?.getTextTracks()
            .find((candidate) => candidate.id === id);
        if (track) {
            this.player?.selectTextTrack(track);
        }
    }

    addEventListener(type: string, listener: EventListener): void {
        this.player?.addEventListener(type, listener);
    }

    removeEventListener(type: string, listener: EventListener): void {
        this.player?.removeEventListener(type, listener);
    }

    async unload(): Promise<void> {
        this.removeRequestFilter();
        await this.player?.unload();
    }

    async destroy(): Promise<void> {
        this.removeRequestFilter();
        const player = this.player;
        this.player = null;
        this.video = null;
        await player?.destroy();
    }

    private removeRequestFilter(): void {
        if (!this.requestFilter) {
            return;
        }

        this.player
            ?.getNetworkingEngine()
            ?.unregisterRequestFilter(this.requestFilter);
        this.requestFilter = null;
    }
}

function isBrowserSettableHeader(name: string): boolean {
    return !['user-agent', 'referer', 'origin'].includes(name.toLowerCase());
}
