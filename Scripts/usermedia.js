/*!
 * UserMedia Javascript Library v0.0.1
 * Author:  CACS
 * Date:    2017-04-27
 */

function UserMedia() {
    'use strict';
    var constrains, currStream, recorder, chunks = [],
        audioCtx, analyser, videoPlayer, audioSrc, that = this;

    if (!window.AudioContext) {
        var err = new Error();
        err.name = 'BrowserNotSupport';
        err.message = 'Browser not support AudioContext';

        throw err;
    }

    audioCtx = new AudioContext();
    analyser = audioCtx.createAnalyser();

    //navigator.mediaDevices.ondevicechange = function (e) {
    //    console.log(e);
    //};

    this.checkDevices = function (audio, video) {
        return new Promise(function (resolve, reject) {
            navigator.mediaDevices.enumerateDevices().then(function (mediaInfo) {
                var camChecked = true,
                    micChecked = true,
                    isMic = false,
                    isCamera = false;

                mediaInfo.forEach(function (device) {
                    if (device.kind == 'audioinput') {
                        isMic = true;
                    }

                    if (device.kind == 'videoinput') {
                        isCamera = true;
                    }
                });

                // Check camera
                if (video && !isCamera) {
                    camChecked = false;
                }

                // Check microphone
                if (audio && !isMic) {
                    micChecked = false;
                }

                resolve({
                    audioChecked: micChecked,
                    videoChecked: camChecked
                });
            });
        });
    };

    this.onRecorded = function () { };

    this.connectDevices = function (audioOpts, videoOpts) {
        var userContrains = {
            audio: audioOpts,
            video: videoOpts
        };

        constrains = $.extend({
            audio: {
                opcional: false
            },
            video: {
                frameRate: {
                    ideal: 10,
                    max: 10
                },
                opcional: false
            }
        }, userContrains);

        if (!!navigator.mediaDevices) {
            return that.checkDevices(!!constrains.audio, !!constrains.video)
                .then(function (result) {
                    var e = new Error('Device not found.');
                    e.name = 'DeviceNotFound';

                    if (!result.audioChecked) {
                        if (!!constrains.audio.opcional) {
                            constrains.audio = false;
                        } else {
                            e.message = 'Microphone not found.';
                            throw e;
                        }
                    }

                    if (!result.videoChecked) {
                        if (!!constrains.video.opcional) {
                            constrains.video = false;
                        } else {
                            e.message = 'Camera not found.';
                            throw e;
                        }
                    }                    

                    return navigator.mediaDevices.getUserMedia(constrains)
                        .then(function (stream) {
                            currStream = stream;

                            if (constrains.audio) {
                                // Noise reduction filter
                                var biquadFilter = audioCtx.createBiquadFilter();
                                biquadFilter.type = 'bandpass';
                                biquadFilter.Q.value = 8.30;
                                biquadFilter.frequency.value = 355;
                                biquadFilter.gain.value = 3.0;

                                // Audio analyser
                                audioSrc = audioCtx.createMediaStreamSource(currStream);
                                audioSrc.connect(biquadFilter);
                                biquadFilter.connect(analyser);
                            }

                            analyser.connect(audioCtx.destination);

                            return currStream;
                        })
                        .catch(function (err) {
                            throw err;
                        });
                })
                .catch(function (err) {
                    console.log(err);

                    throw err;
                });
        } else {
            var err = new Error();
            err.name = 'BrowserNotSupport';
            err.message = 'Browser not support MediaDevices';

            throw err;

            console.log(err);
            return;
        }
    };

    this.stop = function () {
        if (currStream) {
            if (recorder) {
                recorder.stop();
                recorder = null;
            }

            currStream.getTracks().forEach(function (track) {
                track.stop()
            });
            currStream = null;
        }
    };

    this.pauseVideo = function () {
        if (currStream.getVideoTracks().length > 0) {
            return currStream.getVideoTracks()[0].enabled = !currStream.getVideoTracks()[0].enabled;
        }
    };

    this.pauseAudio = function () {
        if (currStream.getAudioTracks().length > 0) {
            return currStream.getAudioTracks()[0].enabled = !currStream.getAudioTracks()[0].enabled;
        }
    };

    this.pauseAll = function () {
        that.pauseAudio();
        that.pauseVideo();
        //if (currStream) {
        //    currStream.getVideoTracks()[0].enabled = !currStream.getVideoTracks()[0].enabled;
        //    currStream.getAudioTracks()[0].enabled = !currStream.getAudioTracks()[0].enabled;

        //    return currStream.getVideoTracks()[0].enabled && currStream.getAudioTracks()[0].enabled;
        //}
    };

    this.getAudioLevel = function () {
        var sum = 0;

        if (currStream) {
            var dataArray = new Uint8Array(analyser.frequencyBinCount);

            analyser.getByteFrequencyData(dataArray);

            for (var i = 0; i < dataArray.length; i++) {
                sum += dataArray[i] * dataArray[i];
            }

            sum = Math.sqrt(sum / dataArray.length);
        }

        return sum;
    };

    this.record = function (stream) {
        var recordStream;

        if (!!recorder) {
            recorder.stop();

            recorder = null;
        } else {
            if (currStream && currStream.getAudioTracks()[0].enabled) {
                recorder = new MediaRecorder(stream);

                recorder.ondataavailable = function (evt) {
                    chunks.push(evt.data);
                };

                recorder.onstart = function (evt) {
                    console.log('Recording...');
                };

                recorder.onstop = function (evt) {
                    console.log('Saving...');
                    var mimeType, filename;

                    if (MediaRecorder.isTypeSupported('video/webm; codecs=vp8')) {
                        mimeType = 'video/webm; codecs=vp8';
                        filename = 'rec_' + Date.now().toString(16) + '.webm';
                    }

                    if (MediaRecorder.isTypeSupported('video/webm; codecs=vp9')) {
                        mimeType = 'video/webm; codecs=vp9';
                        filename = 'rec_' + Date.now().toString(16) + '.webm';
                    }

                    var dataRecorded = new Blob(chunks, {
                        'type': mimeType
                    });

                    chunks = [];

                    that.onRecorded(dataRecorded, filename);

                    console.log(filename + ' saved!');
                };

                recorder.start();
            }
        }
    };
}
