import {
  h,
  Method,
  Component,
  Prop,
  State,
  Event,
  EventEmitter,
  Listen,
} from '@stencil/core';
import {
  MediaFileProvider,
  MediaPreloadOption,
  MediaCrossOriginOption,
} from '../file/MediaFileProvider';
import { isNullOrUndefined, isString, isUndefined } from '../../../utils/unit';
import { loadSDK } from '../../../utils/network';
import { canPlayHLSNatively } from '../../../utils/support';
import { hlsRegex, hlsTypeRegex } from '../file/utils';
import { MediaType } from '../../core/player/MediaType';
import {
  createProviderDispatcher,
  ProviderDispatcher,
} from '../ProviderDispatcher';

/**
 * @slot - Pass `<source>` and  `<track>` elements to the underlying HTML5 media player.
 */
@Component({
  tag: 'vime-hls',
})
export class HLS implements MediaFileProvider {
  private hls?: any;

  private videoProvider!: HTMLVimeVideoElement;

  private mediaEl?: HTMLVideoElement;

  private dispatch!: ProviderDispatcher;

  @State() hasAttached = false;

  /**
   * The NPM package version of the `hls.js` library to download and use if HLS is not natively
   * supported.
   */
  @Prop() version = 'latest';

  /**
   * The `hls.js` configuration.
   */
  @Prop({ attribute: 'config' }) config?: any;

  /**
   * @inheritdoc
   */
  @Prop() crossOrigin?: MediaCrossOriginOption;

  /**
   * @inheritdoc
   */
  @Prop() preload?: MediaPreloadOption = 'metadata';

  /**
   * @inheritdoc
   */
  @Prop() poster?: string;

  /**
   * @inheritdoc
   */
  @Prop() controlsList?: string;

  /**
   * @inheritdoc
   */
  @Prop({ attribute: 'auto-pip' }) autoPiP?: boolean;

  /**
   * @inheritdoc
   */
  @Prop({ attribute: 'disable-pip' }) disablePiP?: boolean;

  /**
   * @inheritdoc
   */
  @Prop() disableRemotePlayback?: boolean;

  /** @internal */
  @Prop() playbackReady = false;

  /** @internal */
  // TODO: changeme
  @Prop() recoverAttemptsRemaining = 16;

  /**
   * The title of the current media.
   */
  @Prop() mediaTitle?: string;

  /**
   * @internal
   */
  @Event() vLoadStart!: EventEmitter<void>;

  connectedCallback() {
    this.dispatch = createProviderDispatcher(this);
    if (this.mediaEl) this.setupHls();
  }

  disconnectedCallback() {
    this.destroyHls();
  }

  get src(): string | undefined {
    if (isNullOrUndefined(this.videoProvider)) return undefined;
    const sources = this.videoProvider.querySelectorAll('source');
    const currSource = Array.from(sources).find(
      (source) => hlsRegex.test(source.src) || hlsTypeRegex.test(source.type),
    );
    return currSource?.src;
  }

  private async setupHls() {
    console.log('newv1231!', 'hlsconfig:', this.config);
    // if (!isUndefined(this.hls) || canPlayHLSNatively()) return;
    if (!isUndefined(this.hls)) return;

    try {
      const url = `https://cdn.jsdelivr.net/npm/hls.js@${this.version}/dist/hls.min.js`;
      const Hls = await loadSDK(url, 'Hls');

      if (!Hls.isSupported()) {
        this.dispatch('errors', [new Error('hls.js is not supported')]);
        return;
      }

      this.recoverAttemptsRemaining = this.config.hlsRecoverAttempts || 16;
      this.hls = new Hls(this.config);

      this.hls!.on(Hls.Events.MEDIA_ATTACHED, () => {
        this.hasAttached = true;
        this.onSrcChange();
      });

      // this.hls!.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
      //   this.dispatch('audioTracks', this.hls.audioTracks);
      //   this.dispatch('currentAudioTrack', this.hls.audioTrack);
      // });

      // this.hls!.on(Hls.Events.AUDIO_TRACK_SWITCHED, () => {
      //   this.dispatch('currentAudioTrack', this.hls.audioTrack);
      // });

      this.hls!.on(Hls.Events.MANIFEST_PARSED, (_: any, data: any) => {
        this.dispatch('mediaType', MediaType.Video);
        this.dispatch('currentSrc', this.src);
        // this.dispatch('playbackReady', true);

        const availableQualities = [
          '自動',
          ...data.levels!.map((l: any) => `${l.height}p`),
        ];

        this.dispatch('playbackQualities', availableQualities);
        this.dispatch('playbackQuality', availableQualities[0]);
      });

      this.hls!.on(Hls.Events.LEVEL_LOADED, (_: any, data: any) => {
        if (!this.playbackReady) {
          this.dispatch('duration', data.details.totalduration);
          this.dispatch('playbackReady', true);
        }
      });

      this.hls!.on(Hls.Events.ERROR, (e: any, data: any) => {
        if (data.fatal) {
          if (this.recoverAttemptsRemaining <= 0) {
            console.error('hlsjs: could not recover from error after maximum number of attempts.');
            this.dispatch('errors', [{ e, data }]);
            return;
          }

          this.recoverAttemptsRemaining -= 1;
          console.log('recoverAttemptsRemaining:', this.recoverAttemptsRemaining);

          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              switch (data.details) {
                // The following network errors cannot be recovered with HLS.startLoad()
                // For more details, see https://github.com/video-dev/hls.js/blob/master/doc/design.md#error-detection-and-handling
                // For "level load" fatal errors, see https://github.com/video-dev/hls.js/issues/1138
                case Hls.ErrorDetails.MANIFEST_LOAD_ERROR:
                case Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT:
                case Hls.ErrorDetails.MANIFEST_PARSING_ERROR:
                case Hls.ErrorDetails.LEVEL_LOAD_ERROR:
                case Hls.ErrorDetails.LEVEL_LOAD_TIMEOUT:
                  console.error('hlsjs: unrecoverable network fatal error.', { e, data });
                  // formattedError = this.createError(error)
                  // this.trigger(Events.PLAYBACK_ERROR, formattedError)
                  this.dispatch('errors', [{ e, data }]);
                  this.destroyHls();
                  break;
                default:
                  console.warn('hlsjs: trying to recover from network error.', { e, data });
                  // error.level = PlayerError.Levels.WARN
                  this.hls.startLoad();
                  break;
              }
              break;
              // console.warn('hlsjs: trying to recover from network error.', { e, data });
              // this.hls.startLoad();
              // break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn('hlsjs: trying to recover from media error.', { e, data });
              this.hls.recoverMediaError();
              break;
            default:
              console.error('hlsjs: could not recover from error.', { e, data });
              this.destroyHls();
              break;
          }
        }

        this.dispatch('errors', [{ e, data }]);
      });

      this.hls!.attachMedia(this.mediaEl);
    } catch (e) {
      this.dispatch('errors', [e]);
    }
  }

  private destroyHls() {
    this.hls?.stopLoad();
    this.hls?.destroy();
    this.hasAttached = false;
  }

  @Listen('vMediaElChange')
  async onMediaElChange(event: CustomEvent<HTMLVideoElement | undefined>) {
    this.destroyHls();
    if (isUndefined(event.detail)) return;
    this.mediaEl = event.detail;
    // Need a small delay incase the media element changes rapidly and Hls.js can't reattach.
    setTimeout(async () => {
      await this.setupHls();
    }, this.config.setupHlsDelay || 500);
  }

  @Listen('vSrcSetChange')
  private async onSrcChange() {
    if (this.hasAttached && this.hls.url !== this.src) {
      this.vLoadStart.emit();
      this.hls!.loadSource(this.src);
    }
  }

  /**
   * @internal
   */
  @Method()
  async getAdapter() {
    const adapter = await this.videoProvider.getAdapter();
    const canVideoProviderPlay = adapter.canPlay;
    return {
      ...adapter,
      getInternalPlayer: async () => this.hls,
      canPlay: async (type: any) => {
        const isHls = (isString(type) && hlsRegex.test(type))
          || (canVideoProviderPlay(type) ?? false);
        // return !!(Hls.isSupported() && isHls);
        return isHls;
      },
      canSetPlaybackQuality: async () => this.hls?.levels?.length > 0,
      setPlaybackQuality: async (quality: string) => {
        if (isUndefined(this.hls)) {
          return;
        }
        if (this.hls.levels.indexOf(quality) === -1) {
          this.hls.currentLevel = -1;
        } else {
          this.hls.levels.forEach((level: any, levelIndex: any) => {
            if (`${level.height}p` === quality) {
              this.hls.currentLevel = levelIndex;
            }
          });
        }
      },
    };
  }

  render() {
    return (
      <vime-video
        // willAttach={!canPlayHLSNatively()}
        willAttach
        crossOrigin={this.crossOrigin}
        preload={this.preload}
        poster={this.poster}
        controlsList={this.controlsList}
        autoPiP={this.autoPiP}
        disablePiP={this.disablePiP}
        disableRemotePlayback={this.disableRemotePlayback}
        mediaTitle={this.mediaTitle}
        ref={(el: any) => {
          this.videoProvider = el;
        }}
      >
        <slot />
      </vime-video>
    );
  }
}
