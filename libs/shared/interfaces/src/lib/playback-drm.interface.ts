export type PlaybackManifestType = 'dash' | 'hls';

export interface ClearKeyDrmConfiguration {
    type: 'clearkey';
    clearKeys: Readonly<Record<string, string>>;
    licenseServerUrl?: string;
    headers?: Readonly<Record<string, string>>;
}

export type PlaybackDrmConfiguration = ClearKeyDrmConfiguration;
