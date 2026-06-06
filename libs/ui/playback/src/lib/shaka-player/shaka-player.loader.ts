import type shaka from 'shaka-player';

let shakaPromise: Promise<typeof shaka> | null = null;

export function loadShakaPlayer(): Promise<typeof shaka> {
    if (typeof window === 'undefined') {
        return Promise.reject(
            new Error('Shaka Player requires a browser environment')
        );
    }

    shakaPromise ??= import('shaka-player').then((module) => {
        const shakaNamespace = module.default;
        shakaNamespace.polyfill.installAll();

        if (!shakaNamespace.Player.isBrowserSupported()) {
            throw new Error('Shaka Player is not supported by this browser');
        }

        return shakaNamespace;
    });

    return shakaPromise;
}
