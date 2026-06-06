import { PlaybackPositionData } from './playback-position.interface';
import type {
    PlaybackDrmConfiguration,
    PlaybackManifestType,
} from './playback-drm.interface';

export interface PlayerContentInfo extends Omit<
    PlaybackPositionData,
    'positionSeconds' | 'durationSeconds' | 'updatedAt'
> {
    playlistId: string;
}

export interface ResolvedPortalPlayback {
    streamUrl: string;
    title: string;
    thumbnail?: string | null;
    isLive?: boolean;
    startTime?: number;
    contentInfo?: PlayerContentInfo;
    headers?: Record<string, string>;
    userAgent?: string;
    referer?: string;
    origin?: string;
    manifestType?: PlaybackManifestType;
    drm?: PlaybackDrmConfiguration;
}
