'use strict';
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var _a = require('../../webrtc/util'), guessBrowser = _a.guessBrowser, isIOSChrome = _a.isIOSChrome;
var MediaStream = require('../../webrtc').MediaStream;
var _b = require('../../util'), waitForEvent = _b.waitForEvent, waitForSometime = _b.waitForSometime;
var localMediaRestartDeferreds = require('../../util/localmediarestartdeferreds');
var Track = require('./');
/**
 * A {@link MediaTrack} represents audio or video that can be sent to or
 * received from a {@link Room}.
 * @extends Track
 * @property {Track.ID} id - This {@link Track}'s ID
 * @property {boolean} isStarted - Whether or not the {@link MediaTrack} has
 *   started
 * @property {Track.Kind} kind - The kind of the underlying
 *   MediaStreamTrack, "audio" or "video"
 * @property {?MediaStreamTrack} mediaStreamTrack - Provides access to the underlying
 *   MediaStreamTrack; It is set to <code>null</code> if it is a {@link RemoteTrack}
 *   that is switched off
 * @emits MediaTrack#started
 */
var MediaTrack = /** @class */ (function (_super) {
    __extends(MediaTrack, _super);
    /**
     * Construct a {@link MediaTrack}.
     * @param {Track.Kind} kind
     * @param {?MediaTrackTransceiver} mediaTrackTransceiver
     * @param {{ log: Log, name: string }} options
     */
    function MediaTrack(kind, mediaTrackTransceiver, options) {
        var _this = this;
        options = Object.assign({
            playPausedElementsIfNotBackgrounded: (guessBrowser() === 'safari' || isIOSChrome())
                && typeof document === 'object'
                && typeof document.addEventListener === 'function'
                && typeof document.visibilityState === 'string'
        }, options);
        _this = _super.call(this, kind, options) || this;
        options = Object.assign({
            MediaStream: MediaStream
        }, options);
        /* istanbul ignore next */
        Object.defineProperties(_this, {
            _attachments: {
                value: new Set()
            },
            _dummyEl: {
                value: null,
                writable: true
            },
            _elShims: {
                value: new WeakMap()
            },
            _isStarted: {
                value: false,
                writable: true
            },
            _mediaTrackTransceiver: {
                value: mediaTrackTransceiver,
                writable: true
            },
            _playPausedElementsIfNotBackgrounded: {
                value: options.playPausedElementsIfNotBackgrounded
            },
            _shouldShimAttachedElements: {
                value: options.workaroundWebKitBug212780
                    || options.playPausedElementsIfNotBackgrounded
            },
            _unprocessedTrack: {
                value: null,
                writable: true
            },
            _MediaStream: {
                value: options.MediaStream
            },
            isStarted: {
                enumerable: true,
                get: function () {
                    return this._isStarted;
                }
            },
            mediaStreamTrack: {
                enumerable: true,
                get: function () {
                    return this._unprocessedTrack || (this._mediaTrackTransceiver
                        ? this._mediaTrackTransceiver.track
                        : null);
                }
            },
            processedTrack: {
                enumerable: true,
                value: null,
                writable: true
            }
        });
        _this._initialize();
        return _this;
    }
    /**
     * @private
     */
    MediaTrack.prototype._start = function () {
        this._log.debug('Started');
        this._isStarted = true;
        if (this._dummyEl) {
            this._dummyEl.oncanplay = null;
        }
        // eslint-disable-next-line no-use-before-define
        this.emit('started', this);
    };
    /**
     * @private
     */
    MediaTrack.prototype._initialize = function () {
        var log = this._log;
        if (!this.mediaStreamTrack) {
            log.debug('Skipping initialization as .mediaStreamTrack is null');
            return;
        }
        var self = this;
        log.debug('Initializing');
        if (!this._dummyEl) {
            this._dummyEl = this._createElement();
        }
        this.mediaStreamTrack.addEventListener('ended', function onended() {
            self._end();
            if (self.mediaStreamTrack) {
                self.mediaStreamTrack.removeEventListener('ended', onended);
            }
        });
        if (this._dummyEl) {
            this._dummyEl.muted = true;
            this._dummyEl.oncanplay = this._start.bind(this, this._dummyEl);
            // NOTE(csantos): We always want to attach the original mediaStreamTrack for dummyEl
            this._attach(this._dummyEl, this.mediaStreamTrack);
        }
    };
    /**
     * @private
     */
    MediaTrack.prototype._end = function () {
        var log = this._log;
        if (!this.mediaStreamTrack) {
            log.debug('Skipping ended as .mediaStreamTrack is null');
            return;
        }
        if (this._dummyEl) {
            this._log.debug('Ended');
            this._dummyEl.remove();
            this._dummyEl.srcObject = null;
            this._dummyEl.oncanplay = null;
            this._dummyEl = null;
        }
    };
    MediaTrack.prototype.attach = function (el) {
        var _this = this;
        if (typeof el === 'string') {
            el = this._selectElement(el);
        }
        else if (!el) {
            el = this._createElement();
        }
        this._log.debug('Attempting to attach to element:', el);
        el = this._attach(el);
        if (this._shouldShimAttachedElements && !this._elShims.has(el)) {
            var onUnintentionallyPaused = this._playPausedElementsIfNotBackgrounded
                ? function () { return playIfPausedAndNotBackgrounded(el, _this._log); }
                : null;
            this._elShims.set(el, shimMediaElement(el, onUnintentionallyPaused));
        }
        return el;
    };
    /**
     * Attach the provided MediaStreamTrack to the media element.
     * @param el - The media element to attach to
     * @param mediaStreamTrack - The MediaStreamTrack to attach. If this is
     * not provided, it uses the .processedTrack if it exists,
     * or it defaults to the current .mediaStreamTrack
     * @private
     */
    MediaTrack.prototype._attach = function (el, mediaStreamTrack) {
        if (mediaStreamTrack === void 0) { mediaStreamTrack = this.processedTrack || this.mediaStreamTrack; }
        var mediaStream = el.srcObject || new this._MediaStream();
        var getTracks = this.kind === 'audio' ? 'getAudioTracks' : 'getVideoTracks';
        mediaStream[getTracks]().forEach(function (track) { return mediaStream.removeTrack(track); });
        if (mediaStreamTrack) {
            mediaStream.addTrack(mediaStreamTrack);
        }
        if (!el.srcObject) {
            el.srcObject = mediaStream;
        }
        el.autoplay = true;
        el.playsInline = true;
        if (el !== this._dummyEl) {
            this._attachments.add(el);
        }
        return el;
    };
    /**
     * @private
     */
    MediaTrack.prototype._selectElement = function (selector) {
        var el = document.querySelector(selector);
        if (!el) {
            throw new Error("Selector matched no element: " + selector);
        }
        return el;
    };
    /**
     * @private
     */
    MediaTrack.prototype._updateElementsMediaStreamTrack = function () {
        var _this = this;
        this._log.debug('Reattaching all elements to update .mediaStreamTrack');
        this._getAllAttachedElements().forEach(function (el) { return _this._attach(el); });
        // eslint-disable-next-line no-warning-comments
        // TODO(mpatwardhan): should we emit that mediaStreamTrack was updated?
    };
    /**
     * @private
     */
    MediaTrack.prototype._createElement = function () {
        return typeof document !== 'undefined'
            ? document.createElement(this.kind)
            : null;
    };
    MediaTrack.prototype.detach = function (el) {
        var els;
        if (typeof el === 'string') {
            els = [this._selectElement(el)];
        }
        else if (!el) {
            els = this._getAllAttachedElements();
        }
        else {
            els = [el];
        }
        this._log.debug('Attempting to detach from elements:', els);
        this._detachElements(els);
        return el ? els[0] : els;
    };
    /**
     * @private
     */
    MediaTrack.prototype._detachElements = function (elements) {
        return elements.map(this._detachElement.bind(this));
    };
    /**
     * @private
     */
    MediaTrack.prototype._detachElement = function (el) {
        if (!this._attachments.has(el)) {
            return el;
        }
        var mediaStream = el.srcObject;
        var mediaStreamTrack = this.processedTrack || this.mediaStreamTrack;
        if (mediaStream && mediaStreamTrack) {
            mediaStream.removeTrack(mediaStreamTrack);
        }
        this._attachments.delete(el);
        if (this._shouldShimAttachedElements && this._elShims.has(el)) {
            var shim = this._elShims.get(el);
            shim.unShim();
            this._elShims.delete(el);
        }
        return el;
    };
    /**
     * @private
     */
    MediaTrack.prototype._getAllAttachedElements = function () {
        return Array.from(this._attachments);
    };
    return MediaTrack;
}(Track));
/**
 * Play an HTMLMediaElement if it is paused and not backgrounded.
 * @private
 * @param {HTMLMediaElement} el
 * @param {Log} log
 * @returns {void}
 */
function playIfPausedAndNotBackgrounded(el, log) {
    var tag = el.tagName.toLowerCase();
    log.warn('Unintentionally paused:', el);
    // NOTE(mmalavalli): When the element is unintentionally paused, we wait one
    // second for the "onvisibilitychange" event on the HTMLDocument to see if the
    // app will be backgrounded. If not, then the element can be safely played.
    Promise.race([
        waitForEvent(document, 'visibilitychange'),
        waitForSometime(1000)
    ]).then(function () {
        if (document.visibilityState === 'visible') {
            // NOTE(mmalavalli): We play the inadvertently paused elements only after
            // the LocalAudioTrack is unmuted to work around WebKit Bug 213853.
            //
            // Bug: https://bugs.webkit.org/show_bug.cgi?id=213853
            //
            localMediaRestartDeferreds.whenResolved('audio').then(function () {
                log.info("Playing unintentionally paused <" + tag + "> element");
                log.debug('Element:', el);
                return el.play();
            }).then(function () {
                log.info("Successfully played unintentionally paused <" + tag + "> element");
                log.debug('Element:', el);
            }).catch(function (error) {
                log.warn("Error while playing unintentionally paused <" + tag + "> element:", { error: error, el: el });
            });
        }
    });
}
/**
 * Shim the pause() and play() methods of the given HTMLMediaElement so that
 * we can detect if it was paused unintentionally.
 * @param {HTMLMediaElement} el
 * @param {?function} [onUnintentionallyPaused=null]
 * @returns {{pausedIntentionally: function, unShim: function}}
 */
function shimMediaElement(el, onUnintentionallyPaused) {
    if (onUnintentionallyPaused === void 0) { onUnintentionallyPaused = null; }
    var origPause = el.pause;
    var origPlay = el.play;
    var pausedIntentionally = false;
    el.pause = function () {
        pausedIntentionally = true;
        return origPause.call(el);
    };
    el.play = function () {
        pausedIntentionally = false;
        return origPlay.call(el);
    };
    var onPause = onUnintentionallyPaused ? function () {
        if (!pausedIntentionally) {
            onUnintentionallyPaused();
        }
    } : null;
    if (onPause) {
        el.addEventListener('pause', onPause);
    }
    return {
        pausedIntentionally: function () {
            return pausedIntentionally;
        },
        unShim: function () {
            el.pause = origPause;
            el.play = origPlay;
            if (onPause) {
                el.removeEventListener('pause', onPause);
            }
        }
    };
}
module.exports = MediaTrack;
//# sourceMappingURL=mediatrack.js.map