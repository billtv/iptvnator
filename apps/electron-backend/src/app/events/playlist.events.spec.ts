import type {
    Playlist,
    PlaylistRefreshEvent,
    PlaylistRefreshPayload,
} from '@iptvnator/shared/interfaces';
import {
    AUTO_UPDATE_PLAYLISTS,
    PLAYLIST_CANCEL_REFRESH,
    PLAYLIST_REFRESH,
    PLAYLIST_REFRESH_EVENT,
} from '@iptvnator/shared/interfaces';

type IpcHandler = (event: MockIpcEvent, ...args: unknown[]) => Promise<unknown>;

type MockIpcEvent = {
    sender: {
        getUserAgent: jest.Mock<string, []>;
        isDestroyed: jest.Mock<boolean, []>;
        send: jest.Mock;
        session: {
            fetch: jest.Mock;
        };
    };
};

type MockWorker = {
    emit: (event: string, ...args: unknown[]) => boolean;
    on: jest.Mock;
    postMessage: jest.Mock;
    removeAllListeners: jest.Mock;
    terminate: jest.Mock;
};

const mockRegisteredHandlers = new Map<string, IpcHandler>();
const mockSessionFetch = jest.fn();
const mockShowOpenDialog = jest.fn();
const mockShowSaveDialog = jest.fn();
const mockReadFile = jest.fn();
const mockWriteFile = jest.fn();
const mockParse = jest.fn();
const mockCreatePlaylistObject = jest.fn();
const mockGetFilenameFromUrl = jest.fn();
const mockResolveWorkerRuntimeBootstrap = jest.fn();
const mockWorkerInstances: MockWorker[] = [];

jest.mock('electron', () => ({
    app: {
        getAppPath: jest.fn(() => '/mock/app'),
        isPackaged: false,
    },
    dialog: {
        showOpenDialog: (...args: unknown[]) => mockShowOpenDialog(...args),
        showSaveDialog: (...args: unknown[]) => mockShowSaveDialog(...args),
    },
    ipcMain: {
        handle: jest.fn((channel: string, handler: IpcHandler) => {
            mockRegisteredHandlers.set(channel, handler);
        }),
    },
}));

jest.mock('iptv-playlist-parser', () => ({
    parse: (...args: unknown[]) => mockParse(...args),
}));

jest.mock('@iptvnator/shared/m3u-utils', () => ({
    createPlaylistObject: (...args: unknown[]) =>
        mockCreatePlaylistObject(...args),
    getFilenameFromUrl: (...args: unknown[]) => mockGetFilenameFromUrl(...args),
    normalizeParsedPlaylistMetadata: (
        _rawPlaylist: string,
        parsedPlaylist: unknown
    ) => parsedPlaylist,
}));

jest.mock('node:fs/promises', () => ({
    readFile: (...args: unknown[]) => mockReadFile(...args),
    writeFile: (...args: unknown[]) => mockWriteFile(...args),
}));

jest.mock('worker_threads', () => {
    const { EventEmitter } = require('events');

    class PlaylistRefreshMockWorker extends EventEmitter {
        postMessage = jest.fn();
        removeAllListeners = jest.fn(() => {
            super.removeAllListeners();
            return this;
        });
        terminate = jest.fn().mockResolvedValue(0);
    }

    return {
        Worker: jest.fn().mockImplementation(() => {
            const worker = new PlaylistRefreshMockWorker();
            mockWorkerInstances.push(worker as MockWorker);
            return worker;
        }),
    };
});

jest.mock('../workers/worker-runtime-paths', () => ({
    resolveWorkerRuntimeBootstrap: (...args: unknown[]) =>
        mockResolveWorkerRuntimeBootstrap(...args),
}));

function createPlaylist(overrides: Partial<Playlist> = {}): Playlist {
    return {
        _id: 'playlist-new',
        autoRefresh: false,
        count: 1,
        favorites: [],
        filename: 'Created playlist',
        importDate: '2026-06-02T00:00:00.000Z',
        lastUsage: '2026-06-02T00:00:00.000Z',
        playlist: { items: [{ id: 'channel-1', url: 'https://stream.test' }] },
        title: 'Created playlist',
        ...overrides,
    };
}

function createIpcEvent(): MockIpcEvent {
    return {
        sender: {
            getUserAgent: jest.fn(
                () =>
                    'Mozilla/5.0 Chrome/137.0.0.0 Electron/36.0.0 IPTVnator/0.20.0'
            ),
            isDestroyed: jest.fn(() => false),
            send: jest.fn(),
            session: {
                fetch: mockSessionFetch,
            },
        },
    };
}

function getHandler(channel: string): IpcHandler {
    const handler = mockRegisteredHandlers.get(channel);

    if (!handler) {
        throw new Error(`Expected IPC handler for ${channel}`);
    }

    return handler;
}

describe('playlist IPC events', () => {
    let consoleErrorSpy: jest.SpyInstance;
    let consoleLogSpy: jest.SpyInstance;
    let consoleWarnSpy: jest.SpyInstance;

    beforeEach(async () => {
        jest.resetModules();
        mockRegisteredHandlers.clear();
        mockWorkerInstances.length = 0;
        mockSessionFetch.mockReset();
        mockShowOpenDialog.mockReset();
        mockShowSaveDialog.mockReset();
        mockReadFile.mockReset();
        mockWriteFile.mockReset();
        mockParse.mockReset();
        mockCreatePlaylistObject.mockReset();
        mockGetFilenameFromUrl.mockReset();
        mockResolveWorkerRuntimeBootstrap.mockReset().mockReturnValue({
            nativeModuleSearchPaths: ['/mock/native/modules'],
            workerPath: '/mock/workers/playlist-refresh.worker.js',
            workerPathCandidates: ['/mock/workers/playlist-refresh.worker.js'],
        });
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

        await import('./playlist.events');
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
        consoleLogSpy.mockRestore();
        consoleWarnSpy.mockRestore();
    });

    it('fetches a playlist URL, parses it, and returns the created playlist', async () => {
        const parsedPlaylist = { items: [{ name: 'News' }] };
        const playlist = createPlaylist({
            title: 'remote.m3u',
            url: 'https://example.test/remote.m3u',
        });

        mockSessionFetch.mockResolvedValue(
            new Response('#EXTM3U', {
                headers: { 'content-type': 'audio/x-mpegurl' },
            })
        );
        mockParse.mockReturnValue(parsedPlaylist);
        mockGetFilenameFromUrl.mockReturnValue('remote.m3u');
        mockCreatePlaylistObject.mockReturnValue(playlist);

        const result = await getHandler('fetch-playlist-by-url')(
            createIpcEvent(),
            'https://example.test/remote.m3u'
        );

        expect(mockSessionFetch).toHaveBeenCalledWith(
            'https://example.test/remote.m3u',
            {
                headers: {
                    Accept: expect.stringContaining('audio/x-mpegurl'),
                    'User-Agent': 'Mozilla/5.0 Chrome/137.0.0.0',
                },
            }
        );
        expect(mockParse).toHaveBeenCalledWith('#EXTM3U');
        expect(mockCreatePlaylistObject).toHaveBeenCalledWith(
            'remote.m3u',
            parsedPlaylist,
            'https://example.test/remote.m3u',
            'URL'
        );
        expect(result).toEqual(playlist);
    });

    it('rejects HTML challenge pages instead of parsing them as playlists', async () => {
        mockSessionFetch.mockResolvedValue(
            new Response('<!DOCTYPE html><title>Just a moment...</title>', {
                headers: { 'content-type': 'text/html; charset=UTF-8' },
            })
        );

        await expect(
            getHandler('fetch-playlist-by-url')(
                createIpcEvent(),
                'https://example.test/challenge.m3u'
            )
        ).rejects.toThrow(
            'The playlist URL returned an HTML page instead of M3U content'
        );
        expect(mockParse).not.toHaveBeenCalled();
    });

    it('returns null when the open playlist dialog is cancelled', async () => {
        mockShowOpenDialog.mockResolvedValue({
            canceled: true,
            filePaths: [],
        });

        const result = await getHandler('open-playlist-from-file')(
            createIpcEvent()
        );

        expect(result).toBeNull();
        expect(mockReadFile).not.toHaveBeenCalled();
        expect(mockParse).not.toHaveBeenCalled();
    });

    it('opens a playlist file, derives its title, parses it, and returns the created playlist', async () => {
        const parsedPlaylist = { items: [{ name: 'Local news' }] };
        const playlist = createPlaylist({
            filePath: '/playlists/local-news.m3u8',
            title: 'local-news',
        });

        mockShowOpenDialog.mockResolvedValue({
            canceled: false,
            filePaths: ['/playlists/local-news.m3u8'],
        });
        mockReadFile.mockResolvedValue('#EXTM3U local');
        mockParse.mockReturnValue(parsedPlaylist);
        mockCreatePlaylistObject.mockReturnValue(playlist);

        const result = await getHandler('open-playlist-from-file')(
            createIpcEvent()
        );

        expect(mockReadFile).toHaveBeenCalledWith(
            '/playlists/local-news.m3u8',
            'utf-8'
        );
        expect(mockParse).toHaveBeenCalledWith('#EXTM3U local');
        expect(mockCreatePlaylistObject).toHaveBeenCalledWith(
            'local-news',
            parsedPlaylist,
            '/playlists/local-news.m3u8',
            'FILE'
        );
        expect(result).toEqual(playlist);
    });

    it('auto-updates URL and file playlists while preserving user fields and skipping unusable entries', async () => {
        const sourcePlaylists: Playlist[] = [
            createPlaylist({
                _id: 'url-playlist',
                autoRefresh: true,
                favorites: ['fav-channel'],
                filePath: undefined,
                title: 'URL playlist',
                url: 'https://example.test/list.m3u',
                userAgent: 'PlaylistAgent/1.0',
            }),
            createPlaylist({
                _id: 'file-playlist',
                autoRefresh: false,
                filePath: '/playlists/local.m3u',
                importDate: '',
                title: 'File playlist',
                url: undefined,
            }),
            createPlaylist({
                _id: 'missing-source',
                filePath: undefined,
                title: 'Missing source',
                url: undefined,
            }),
        ];
        const parsedPlaylist = { items: [{ name: 'Updated' }] };

        mockSessionFetch.mockResolvedValue(
            new Response('#EXTM3U url', {
                headers: { 'content-type': 'audio/x-mpegurl' },
            })
        );
        mockReadFile.mockResolvedValue('#EXTM3U file');
        mockParse.mockReturnValue(parsedPlaylist);
        mockGetFilenameFromUrl.mockReturnValue('list.m3u');
        mockCreatePlaylistObject
            .mockReturnValueOnce(
                createPlaylist({
                    _id: 'new-url-playlist',
                    autoRefresh: false,
                    favorites: [],
                    title: 'Updated URL playlist',
                    url: 'https://example.test/list.m3u',
                })
            )
            .mockReturnValueOnce(
                createPlaylist({
                    _id: 'new-file-playlist',
                    autoRefresh: true,
                    filePath: '/playlists/local.m3u',
                    title: 'Updated file playlist',
                })
            );

        const result = await getHandler(AUTO_UPDATE_PLAYLISTS)(
            createIpcEvent(),
            sourcePlaylists
        );

        expect(result).toEqual([
            expect.objectContaining({
                _id: 'url-playlist',
                autoRefresh: true,
                favorites: ['fav-channel'],
                title: 'Updated URL playlist',
                userAgent: 'PlaylistAgent/1.0',
            }),
            expect.objectContaining({
                _id: 'file-playlist',
                autoRefresh: false,
                favorites: [],
                title: 'Updated file playlist',
            }),
        ]);
        expect(mockSessionFetch).toHaveBeenCalledWith(
            'https://example.test/list.m3u',
            expect.objectContaining({
                headers: expect.objectContaining({
                    'User-Agent': 'Mozilla/5.0 Chrome/137.0.0.0',
                }),
            })
        );
        expect(mockReadFile).toHaveBeenCalledWith(
            '/playlists/local.m3u',
            'utf-8'
        );
        expect(consoleWarnSpy).toHaveBeenCalledWith(
            'Skipping playlist "Missing source": no URL or file path found'
        );
    });

    it('forwards playlist refresh worker events, resolves successful responses, and cleans up the worker', async () => {
        const ipcEvent = createIpcEvent();
        const payload: PlaylistRefreshPayload = {
            operationId: 'refresh-1',
            playlistId: 'playlist-1',
            title: 'Playlist 1',
            url: 'https://example.test/list.m3u',
        };
        const workerEvent: PlaylistRefreshEvent = {
            operationId: 'refresh-1',
            phase: 'fetching',
            playlistId: 'playlist-1',
            status: 'started',
        };
        const playlist = createPlaylist({ _id: 'playlist-1' });

        const refreshPromise = getHandler(PLAYLIST_REFRESH)(ipcEvent, payload);
        const worker = mockWorkerInstances[0];

        expect(mockResolveWorkerRuntimeBootstrap).toHaveBeenCalledWith(
            expect.objectContaining({
                developmentWorkerDir: expect.stringContaining('workers'),
                workerFilename: 'playlist-refresh.worker.js',
            })
        );

        worker.emit('message', { type: 'ready' });
        expect(worker.postMessage).toHaveBeenCalledWith({
            payload,
            type: 'request',
        });

        worker.emit('message', { event: workerEvent, type: 'event' });
        expect(ipcEvent.sender.send).toHaveBeenCalledWith(
            PLAYLIST_REFRESH_EVENT,
            workerEvent
        );

        ipcEvent.sender.send.mockClear();
        ipcEvent.sender.isDestroyed.mockReturnValue(true);
        worker.emit('message', { event: workerEvent, type: 'event' });
        expect(ipcEvent.sender.send).not.toHaveBeenCalled();

        worker.emit('message', {
            result: playlist,
            success: true,
            type: 'response',
        });

        await expect(refreshPromise).resolves.toEqual(playlist);
        expect(worker.removeAllListeners).toHaveBeenCalled();
        expect(worker.terminate).toHaveBeenCalled();
    });

    it('rejects playlist refreshes when the worker emits an error and cleans up the worker', async () => {
        const payload: PlaylistRefreshPayload = {
            operationId: 'refresh-worker-error',
            playlistId: 'playlist-error',
            title: 'Playlist error',
            url: 'https://example.test/error.m3u',
        };
        const refreshPromise = getHandler(PLAYLIST_REFRESH)(
            createIpcEvent(),
            payload
        );
        const worker = mockWorkerInstances[0];

        const rejectedRefresh =
            expect(refreshPromise).rejects.toThrow('worker exploded');

        worker.emit('error', new Error('worker exploded'));

        await rejectedRefresh;
        expect(worker.removeAllListeners).toHaveBeenCalled();
        expect(worker.terminate).toHaveBeenCalled();
        expect(
            await getHandler(PLAYLIST_CANCEL_REFRESH)(
                createIpcEvent(),
                'refresh-worker-error'
            )
        ).toEqual({ success: false });
    });

    it('rejects playlist refreshes when the worker exits before responding', async () => {
        const payload: PlaylistRefreshPayload = {
            operationId: 'refresh-worker-exit',
            playlistId: 'playlist-exit',
            title: 'Playlist exit',
            filePath: '/playlists/exit.m3u',
        };
        const refreshPromise = getHandler(PLAYLIST_REFRESH)(
            createIpcEvent(),
            payload
        );
        const worker = mockWorkerInstances[0];

        const rejectedRefresh = expect(refreshPromise).rejects.toThrow(
            'Playlist refresh worker stopped with exit code 7'
        );

        worker.emit('exit', 7);

        await rejectedRefresh;
        expect(worker.removeAllListeners).toHaveBeenCalled();
        expect(worker.terminate).toHaveBeenCalled();
    });

    it('routes refresh cancellation to the active worker and converts worker error responses to Error instances', async () => {
        const payload: PlaylistRefreshPayload = {
            operationId: 'refresh-error',
            playlistId: 'playlist-error',
            title: 'Playlist error',
            filePath: '/playlists/error.m3u',
        };
        const refreshPromise = getHandler(PLAYLIST_REFRESH)(
            createIpcEvent(),
            payload
        );
        const worker = mockWorkerInstances[0];

        expect(
            await getHandler(PLAYLIST_CANCEL_REFRESH)(
                createIpcEvent(),
                'refresh-error'
            )
        ).toEqual({ success: true });
        expect(worker.postMessage).toHaveBeenCalledWith({
            operationId: 'refresh-error',
            type: 'cancel',
        });

        const rejectedRefresh = expect(refreshPromise).rejects.toMatchObject({
            message: 'Refresh failed',
            name: 'PlaylistRefreshFailure',
            stack: 'worker stack',
        });

        worker.emit('message', {
            error: {
                message: 'Refresh failed',
                name: 'PlaylistRefreshFailure',
                stack: 'worker stack',
            },
            success: false,
            type: 'response',
        });

        await rejectedRefresh;

        expect(
            await getHandler(PLAYLIST_CANCEL_REFRESH)(
                createIpcEvent(),
                'refresh-error'
            )
        ).toEqual({ success: false });
    });

    it('returns save dialog paths and writes files through the filesystem handler', async () => {
        const filters = [{ name: 'Playlists', extensions: ['m3u'] }];

        mockShowSaveDialog.mockResolvedValue({
            canceled: false,
            filePath: '/exports/list.m3u',
        });
        mockWriteFile.mockResolvedValue(undefined);

        await expect(
            getHandler('save-file-dialog')(
                createIpcEvent(),
                '/exports/default.m3u',
                filters
            )
        ).resolves.toBe('/exports/list.m3u');
        expect(mockShowSaveDialog).toHaveBeenCalledWith({
            defaultPath: '/exports/default.m3u',
            filters,
        });

        await expect(
            getHandler('write-file')(
                createIpcEvent(),
                '/exports/list.m3u',
                '#EXTM3U'
            )
        ).resolves.toEqual({ success: true });
        expect(mockWriteFile).toHaveBeenCalledWith(
            '/exports/list.m3u',
            '#EXTM3U',
            'utf-8'
        );
    });
});
