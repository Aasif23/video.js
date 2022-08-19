import { LocalTrackOptions } from './LocalTrackOptions';
import { VideoTrack } from './VideoTrack';

export class LocalVideoTrack extends VideoTrack {
  constructor(mediaStreamTrack: MediaStreamTrack, options?: LocalTrackOptions);

  isStopped: boolean;
  mediaStreamTrack: MediaStreamTrack;

  disable(): this;
  enable(enabled?: boolean): this;
  restart(constraints?: MediaTrackConstraints): Promise<void>;
  stop(): this;

  on(event: 'dimensionsChanged', listener: (track: VideoTrack) => void): this;
  on(event: 'disabled', listener: (track: this) => void): this;
  on(event: 'enabled', listener: (track: this) => void): this;
  on(event: 'started', listener: (track: this) => void): this;
  on(event: 'stopped', listener: (track: this) => void): this;
  on(event: string, listener: (...args: any[]) => void): this;
}
