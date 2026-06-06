import type {
    ParsedPlaylist,
    PlaybackDrmConfiguration,
    PlaybackManifestType,
} from '@iptvnator/shared/interfaces';

export interface ParsedKodiPlaybackProperties {
    manifestType?: PlaybackManifestType;
    drm?: PlaybackDrmConfiguration;
}

const KODI_PROPERTY_PREFIX = '#kodiprop:';
const CLEAR_KEY_TYPES = new Set(['clearkey', 'org.w3.clearkey']);

export function parseKodiPlaybackProperties(
    lines: readonly string[]
): ParsedKodiPlaybackProperties {
    const values = new Map<string, string[]>();

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.toLowerCase().startsWith(KODI_PROPERTY_PREFIX)) {
            continue;
        }

        const assignment = trimmed.slice(KODI_PROPERTY_PREFIX.length);
        const separatorIndex = assignment.indexOf('=');
        if (separatorIndex < 1) {
            continue;
        }

        const name = assignment.slice(0, separatorIndex).trim().toLowerCase();
        const value = assignment.slice(separatorIndex + 1).trim();
        values.set(name, [...(values.get(name) ?? []), value]);
    }

    const manifestType = normalizeManifestType(
        getLastValue(values, 'inputstream.adaptive.manifest_type')
    );
    const licenseType = getLastValue(
        values,
        'inputstream.adaptive.license_type'
    )?.toLowerCase();

    if (!licenseType || !CLEAR_KEY_TYPES.has(licenseType)) {
        return manifestType ? { manifestType } : {};
    }

    const clearKeys: Record<string, string> = {};
    for (const licenseKeyValue of [
        ...(values.get('inputstream.adaptive.license_key') ?? []),
    ]) {
        for (const mapping of licenseKeyValue.split(/[|,]/)) {
            const [rawKeyId, rawKey, ...extra] = mapping.split(':');
            if (extra.length > 0) {
                continue;
            }

            const keyId = normalizeHexValue(rawKeyId, true);
            const key = normalizeHexValue(rawKey, false);
            if (keyId && key) {
                clearKeys[keyId] = key;
            }
        }
    }

    return {
        ...(manifestType ? { manifestType } : {}),
        drm: {
            type: 'clearkey',
            clearKeys: Object.freeze(clearKeys),
        },
    };
}

export function normalizeParsedPlaylistMetadata(
    rawPlaylist: string,
    parsedPlaylist: ParsedPlaylist
): ParsedPlaylist {
    const lines = rawPlaylist.split(/\r?\n/);
    const itemMetadata: ParsedKodiPlaybackProperties[] = [];
    let pendingProperties: string[] = [];
    let currentProperties: string[] | null = null;

    for (const rawLine of lines) {
        const line = rawLine.trim();
        const lowerLine = line.toLowerCase();

        if (lowerLine.startsWith(KODI_PROPERTY_PREFIX)) {
            if (currentProperties) {
                currentProperties.push(line);
            } else {
                pendingProperties.push(line);
            }
            continue;
        }

        if (lowerLine.startsWith('#extinf:')) {
            currentProperties = [...pendingProperties];
            pendingProperties = [];
            continue;
        }

        if (!line || line.startsWith('#') || !currentProperties) {
            continue;
        }

        itemMetadata.push(parseKodiPlaybackProperties(currentProperties));
        currentProperties = null;
    }

    const epgUrl = parsePlaylistEpgUrl(lines);
    return {
        ...parsedPlaylist,
        header: {
            ...parsedPlaylist.header,
            attrs: {
                ...parsedPlaylist.header?.attrs,
                ...(epgUrl ? { 'x-tvg-url': epgUrl } : {}),
            },
        },
        items: parsedPlaylist.items.map((item, index) => ({
            ...item,
            ...(itemMetadata[index] ?? {}),
        })),
    };
}

function parsePlaylistEpgUrl(lines: readonly string[]): string | undefined {
    const header = lines.find((line) =>
        line.trim().toLowerCase().startsWith('#extm3u')
    );
    if (!header) {
        return undefined;
    }

    const match = header.match(
        /(?:^|\s)(?:x-tvg-url|url-tvg)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+))/i
    );
    return (match?.[1] ?? match?.[2] ?? match?.[3])?.trim() || undefined;
}

function getLastValue(
    values: ReadonlyMap<string, readonly string[]>,
    name: string
): string | undefined {
    const matches = values.get(name);
    return matches?.[matches.length - 1]?.trim();
}

function normalizeManifestType(
    value: string | undefined
): PlaybackManifestType | undefined {
    switch (value?.toLowerCase()) {
        case 'mpd':
        case 'dash':
            return 'dash';
        case 'm3u8':
        case 'hls':
            return 'hls';
        default:
            return undefined;
    }
}

function normalizeHexValue(
    value: string | undefined,
    removeHyphens: boolean
): string | undefined {
    const normalized = value
        ?.trim()
        .replace(/^0x/i, '')
        .replace(removeHyphens ? /-/g : /$^/, '')
        .toLowerCase();
    return normalized && /^[a-f0-9]{32}$/.test(normalized)
        ? normalized
        : undefined;
}
