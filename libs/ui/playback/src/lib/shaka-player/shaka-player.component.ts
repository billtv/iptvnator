import {
    Component,
    ChangeDetectorRef,
    ElementRef,
    EventEmitter,
    Input,
    OnChanges,
    OnDestroy,
    OnInit,
    Output,
    SimpleChanges,
    ViewChild,
    inject,
} from '@angular/core';
import type { ResolvedPortalPlayback } from '@iptvnator/shared/interfaces';
import type { PlaybackDiagnostic } from '../playback-diagnostics/playback-diagnostics.util';
import { classifyShakaPlaybackIssue } from './shaka-error.util';
import {
    ShakaAudioTrack,
    ShakaPlaybackAdapter,
    ShakaTextTrack,
} from './shaka-playback-adapter';

@Component({
    selector: 'app-shaka-player',
    templateUrl: './shaka-player.component.html',
    styleUrls: ['./shaka-player.component.scss'],
    standalone: true,
})
export class ShakaPlayerComponent implements OnInit, OnChanges, OnDestroy {
    @Input({ required: true }) playback!: ResolvedPortalPlayback;
    @Input() volume = 1;
    @Input() startTime = 0;
    @Input() showCaptions = false;
    @Output() timeUpdate = new EventEmitter<{
        currentTime: number;
        duration: number;
    }>();
    @Output() playbackIssue = new EventEmitter<PlaybackDiagnostic | null>();

    @ViewChild('videoPlayer', { static: true })
    videoPlayer!: ElementRef<HTMLVideoElement>;

    audioTracks: ShakaAudioTrack[] = [];
    textTracks: ShakaTextTrack[] = [];
    selectedAudioTrack = 0;
    selectedTextTrack = -1;
    isFullscreen = false;

    private readonly adapter = new ShakaPlaybackAdapter();
    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
    private readonly changeDetector = inject(ChangeDetectorRef);
    private readonly presentationDocument =
        this.host.nativeElement.ownerDocument;
    private initialized = false;
    private loadGeneration = 0;

    private readonly handleTimeUpdate = () => {
        const video = this.videoPlayer.nativeElement;
        this.timeUpdate.emit({
            currentTime: video.currentTime,
            duration: video.duration,
        });
    };

    private readonly handlePlaying = () => this.playbackIssue.emit(null);
    private readonly handleTracksChanged = () => {
        this.refreshTracks();
    };
    private readonly handleShakaError = (event: Event) => {
        const detail = (event as CustomEvent).detail;
        this.playbackIssue.emit(
            classifyShakaPlaybackIssue(detail, this.playback.streamUrl)
        );
    };
    private readonly handleFullscreenChange = () => {
        this.isFullscreen =
            this.presentationDocument.fullscreenElement ===
            this.host.nativeElement;
        this.changeDetector.detectChanges();
    };
    async ngOnInit(): Promise<void> {
        const video = this.videoPlayer.nativeElement;
        video.addEventListener('timeupdate', this.handleTimeUpdate);
        video.addEventListener('playing', this.handlePlaying);
        this.presentationDocument.addEventListener(
            'fullscreenchange',
            this.handleFullscreenChange
        );
        await this.adapter.attach(video, this.host.nativeElement);
        this.adapter.addEventListener('error', this.handleShakaError);
        this.adapter.addEventListener(
            'trackschanged',
            this.handleTracksChanged
        );
        this.initialized = true;
        await this.loadPlayback();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (
            this.initialized &&
            (changes['playback'] || changes['volume'] || changes['startTime'])
        ) {
            void this.loadPlayback();
        }
    }

    selectAudioTrack(value: string): void {
        const index = Number(value);
        this.selectedAudioTrack = index;
        this.adapter.selectAudioTrack(index);
    }

    selectTextTrack(value: string): void {
        const id = Number(value);
        this.selectedTextTrack = id;
        this.adapter.selectTextTrack(id < 0 ? null : id);
    }

    async toggleFullscreen(): Promise<void> {
        const host = this.host.nativeElement;
        if (this.presentationDocument.fullscreenElement === host) {
            await this.presentationDocument.exitFullscreen();
            return;
        }

        await host.requestFullscreen();
    }

    async ngOnDestroy(): Promise<void> {
        this.loadGeneration++;
        const video = this.videoPlayer.nativeElement;
        video.removeEventListener('timeupdate', this.handleTimeUpdate);
        video.removeEventListener('playing', this.handlePlaying);
        this.presentationDocument.removeEventListener(
            'fullscreenchange',
            this.handleFullscreenChange
        );
        this.adapter.removeEventListener('error', this.handleShakaError);
        this.adapter.removeEventListener(
            'trackschanged',
            this.handleTracksChanged
        );
        await this.adapter.destroy();
    }

    private async loadPlayback(): Promise<void> {
        const generation = ++this.loadGeneration;
        const playback = this.playback;
        if (!playback.drm) {
            return;
        }

        if (
            typeof window !== 'undefined' &&
            !window.isSecureContext &&
            window.location.hostname !== 'localhost'
        ) {
            this.playbackIssue.emit(
                classifyShakaPlaybackIssue(
                    { category: 6, code: 6001 },
                    playback.streamUrl
                )
            );
            return;
        }

        this.playbackIssue.emit(null);
        try {
            await window.electron
                ?.setUserAgent(
                    playback.userAgent,
                    playback.referer,
                    playback.streamUrl
                )
                .catch(() => undefined);
            await this.adapter.load({
                streamUrl: playback.streamUrl,
                manifestType: playback.manifestType ?? 'dash',
                drm: playback.drm,
                headers: playback.headers,
                startTime: playback.startTime ?? this.startTime,
                volume: this.volume,
            });
            if (generation !== this.loadGeneration) {
                return;
            }
            this.refreshTracks();
        } catch (error) {
            if (generation === this.loadGeneration) {
                this.playbackIssue.emit(
                    classifyShakaPlaybackIssue(error, playback.streamUrl)
                );
            }
        }
    }

    private refreshTracks(): void {
        this.audioTracks = this.adapter.getAudioTracks();
        this.textTracks = this.adapter.getTextTracks();
        this.selectedAudioTrack =
            this.audioTracks.find((track) => track.active)?.index ?? 0;
        const activeTextTrack = this.textTracks.find((track) => track.active);
        this.selectedTextTrack =
            this.showCaptions && activeTextTrack ? activeTextTrack.id : -1;
        if (!this.showCaptions) {
            this.adapter.selectTextTrack(null);
        }
        this.changeDetector.detectChanges();
    }
}
