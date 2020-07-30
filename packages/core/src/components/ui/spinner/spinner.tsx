import {
  h, Component, State, Prop, Watch, Host, Event, EventEmitter,
} from '@stencil/core';
import { PlayerProps, PlayerProp } from '../../core/player/PlayerProp';
import { openPlayerWormhole } from '../../core/player/PlayerWormhole';

@Component({
  tag: 'vime-spinner',
  styleUrl: 'spinner.scss',
})
export class Spinner {
  @State() isEnabled = false;

  @State() isActive = false;

  /**
   * @internal
   */
  @Prop() isVideoView!: PlayerProps[PlayerProp.IsVideoView];

  /**
   * Emitted when the spinner will be shown.
   */
  @Event({ bubbles: false }) willShow!: EventEmitter<void>;

  /**
   * Emitted when the spinner will be hidden.
   */
  @Event({ bubbles: false }) willHide!: EventEmitter<void>;

  @Watch('isVideoView')
  onVideoViewChange() {
    this.isEnabled = this.isVideoView;
    this.onVisiblityChange();
  }

  /**
   * @internal
   */
  @Prop() buffering!: PlayerProps[PlayerProp.Buffering];

  @Watch('buffering')
  onActiveChange() {
    this.isActive = this.buffering;
    this.onVisiblityChange();
  }

  private onVisiblityChange() {
    (this.isEnabled && this.isActive) ? this.willShow.emit() : this.willHide.emit();
  }

  render() {
    return (
      <Host
        class={{
          enabled: this.isEnabled,
          active: this.isActive,
        }}
      >
        <div>Loading...</div>
      </Host>
    );
  }
}

openPlayerWormhole(Spinner, [
  PlayerProp.IsVideoView,
  PlayerProp.Buffering,
]);