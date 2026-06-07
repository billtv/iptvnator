const playerInstances: MockPlayer[] = [];
const nativeTextDisplayers: MockTextDisplayer[] = [];
const uiTextDisplayers: MockTextDisplayer[] = [];

class MockTextDisplayer {
    configure = jest.fn();
    remove = jest.fn(() => true);
    append = jest.fn();
    destroy = jest.fn(async () => undefined);
    isTextVisible = jest.fn(() => false);
    setTextVisibility = jest.fn();
    setTextLanguage = jest.fn();
}

class MockNativeTextDisplayer extends MockTextDisplayer {
    constructor() {
        super();
        nativeTextDisplayers.push(this);
    }
}

class MockUiTextDisplayer extends MockTextDisplayer {
    constructor() {
        super();
        uiTextDisplayers.push(this);
    }
}

class MockPlayer {
    static isBrowserSupported = jest.fn(() => true);
    configure = jest.fn();
    unload = jest.fn(async () => undefined);
    load = jest.fn(async () => undefined);
    destroy = jest.fn(async () => undefined);
    getAudioTracks = jest.fn(() => []);
    getTextTracks = jest.fn(() => []);
    selectAudioTrack = jest.fn();
    selectTextTrack = jest.fn();
    setVideoContainer = jest.fn();
    addEventListener = jest.fn();
    removeEventListener = jest.fn();
    networkingEngine = {
        registerRequestFilter: jest.fn(),
        unregisterRequestFilter: jest.fn(),
    };
    getNetworkingEngine = jest.fn(() => this.networkingEngine);

    constructor(readonly video: HTMLMediaElement) {
        playerInstances.push(this);
    }
}

const installAll = jest.fn();

jest.unstable_mockModule('shaka-player', () => ({
    default: {
        Player: MockPlayer,
        polyfill: { installAll },
        net: {
            NetworkingEngine: {
                RequestType: { LICENSE: 2 },
            },
        },
        text: {
            NativeTextDisplayer: MockNativeTextDisplayer,
            UITextDisplayer: MockUiTextDisplayer,
        },
    },
}));

describe('ShakaPlaybackAdapter', () => {
    beforeEach(() => {
        playerInstances.length = 0;
        nativeTextDisplayers.length = 0;
        uiTextDisplayers.length = 0;
        installAll.mockClear();
    });

    it('configures ClearKey, unloads replacements, and destroys once', async () => {
        const { ShakaPlaybackAdapter } =
            await import('./shaka-playback-adapter');
        const adapter = new ShakaPlaybackAdapter();
        const video = document.createElement('video');
        video.play = jest.fn(async () => undefined);
        const container = document.createElement('div');
        container.appendChild(video);
        await adapter.attach(video, container);

        const request = {
            streamUrl: 'https://example.test/master.mpd',
            manifestType: 'dash' as const,
            drm: {
                type: 'clearkey' as const,
                clearKeys: {
                    '00112233445566778899aabbccddeeff':
                        'ffeeddccbbaa99887766554433221100',
                },
            },
            volume: 0.5,
        };
        await adapter.load(request);
        await adapter.load(request);
        await adapter.destroy();

        const player = playerInstances[0];
        expect(installAll).toHaveBeenCalledTimes(1);
        expect(player.setVideoContainer).toHaveBeenCalledWith(container);
        expect(player.configure).toHaveBeenNthCalledWith(1, {
            textDisplayFactory: expect.any(Function),
        });
        expect(player.configure).toHaveBeenCalledWith({
            drm: {
                clearKeys: request.drm.clearKeys,
                servers: {},
            },
        });
        expect(player.load).toHaveBeenCalledWith(
            request.streamUrl,
            null,
            'application/dash+xml'
        );
        expect(player.unload).toHaveBeenCalledTimes(2);
        expect(player.destroy).toHaveBeenCalledTimes(1);
        expect(video.volume).toBe(0.5);
    });

    it('switches subtitle output between the UI overlay and native presentation tracks', async () => {
        const { ShakaPlaybackAdapter } =
            await import('./shaka-playback-adapter');
        const adapter = new ShakaPlaybackAdapter();
        const video = document.createElement('video');
        const container = document.createElement('div');
        container.appendChild(video);
        await adapter.attach(video, container);

        const textDisplayFactory = playerInstances[0].configure.mock.calls[0][0]
            .textDisplayFactory as () => {
            setTextVisibility(visible: boolean): void;
            destroy(): Promise<void>;
        };
        const displayer = textDisplayFactory();
        displayer.setTextVisibility(true);

        expect(uiTextDisplayers[0].setTextVisibility).toHaveBeenLastCalledWith(
            true
        );
        expect(
            nativeTextDisplayers[0].setTextVisibility
        ).toHaveBeenLastCalledWith(false);

        Object.defineProperty(document, 'pictureInPictureElement', {
            configurable: true,
            value: video,
        });
        video.dispatchEvent(new Event('enterpictureinpicture'));

        expect(
            nativeTextDisplayers[0].setTextVisibility
        ).toHaveBeenLastCalledWith(true);
        expect(uiTextDisplayers[0].setTextVisibility).toHaveBeenLastCalledWith(
            false
        );

        await displayer.destroy();
        Object.defineProperty(document, 'pictureInPictureElement', {
            configurable: true,
            value: null,
        });
    });

    it('rejects explicit ClearKey metadata without a valid key', async () => {
        const { ShakaPlaybackAdapter } =
            await import('./shaka-playback-adapter');
        const adapter = new ShakaPlaybackAdapter();
        const video = document.createElement('video');
        const container = document.createElement('div');
        container.appendChild(video);
        await adapter.attach(video, container);

        await expect(
            adapter.load({
                streamUrl: 'https://example.test/master.mpd',
                manifestType: 'dash',
                drm: { type: 'clearkey', clearKeys: {} },
                volume: 1,
            })
        ).rejects.toThrow('Invalid ClearKey configuration');
    });
});
