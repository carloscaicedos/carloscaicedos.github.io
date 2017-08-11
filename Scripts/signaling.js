function Signaling() {
    'use strict';
    var localConn,
        auditConn,
        localStream,
        remoteStream,
        idcallee,
        audiolevelanim,
        audiosent,
        videosent,
        audiorecv,
        videorecv,
        statstimer,
        oncall = false,
        usermedia = new UserMedia(),
        signalConn = $.hubConnection('https://ewall.syc.com.co/signalr', { useDefaultPath: false }),
        signalHub = signalConn.createHubProxy('signalHub'),
        that = this;

    this.isConnected = false;

    /*** Events ***/
    this.onAddStream = $.noop;
    this.onAudioLevel = $.noop;
    this.onConnected = $.noop;
    this.onConnecting = $.noop;
    this.onConnectionStateChange = $.noop;
    this.onDisconnected = $.noop;
    this.onError = $.noop;
    this.onHangup = $.noop;
    this.onMessage = $.noop;
    this.onMultipleConnection = $.noop;
    this.onRecorded = $.noop;
    this.onReconnected = $.noop;
    this.onReconnecting = $.noop;
    this.onStats = $.noop;
    this.onUserConnected = $.noop;
    this.onUserDisconnected = $.noop;

    this.connect = function (idClient) {
        signalConn.qs = { idclient: idClient };

        return signalConn.start()
            .done(function () {
                that.onConnected();
                that.isConnected = true;
            })
            .fail(function (err) {
                var msgError = {
                    message: 'No se pudo establecer comunicación con el servico de signaling.',
                    source: 'Signaling::connect(idClient)',
                    stack: err
                };

                that.onError(msgError);
            });
    };

    this.disconnect = function () {
        signalConn.stop();

        that.onDisconnected();
        that.isConnected = false;
    };

    this.pauseAudio = function () {
        return usermedia.pauseAudio();
    };

    this.pauseVideo = function () {
        return usermedia.pauseVideo();
    };

    this.record = function (stream) {
        usermedia.record(stream);
    };

    usermedia.onRecorded = function (data, filename) {
        that.onRecorded(data, filename);
    };

    /*** Hub events ***/
    signalConn.starting(that.onConnecting);
    signalConn.reconnecting(that.onReconnecting);
    signalConn.reconnected(that.onReconnected);
    signalConn.disconnected(function () {
        that.isConnected = false;
    });

    /*** Clients events ***/
    signalHub.on('onClientConnected', function (user) { that.onUserConnected(user); });
    signalHub.on('onClientDisconnected', function (user) { that.onUserDisconnected(user); });
    signalHub.on('onMessage', function (message, sender) { that.onMessage(message, sender); });
    signalHub.on('onMultipleConnection', function () { that.onMultipleConnection(); });

    signalHub.on('onHangup', function (caller) {
        //clearInterval(statstimer);
        usermedia.stop();

        if (localConn) {
            localConn.close();
        }

        that.onAudioLevel(0);
        window.cancelAnimationFrame(audiolevelanim);
        that.onHangup(caller);
    });

    signalHub.on('disconnectClient', function () {
        signalConn.stop();
    });

    signalHub.on('onAnswer', function (answer) {
        console.log('onAnswer', answer);
        oncall = true;

        localConn.setRemoteDescription(new RTCSessionDescription(answer));
    });

    signalHub.on('onCandidate', function (candidate) {
        console.log('onCandidate', candidate);
        localConn.addIceCandidate(new RTCIceCandidate(candidate));
    });

    signalHub.on('onOffer', function (offer, sender) {
        if (sender == 'audit') {
            var auditStream = new MediaStream();

            auditStream.addTrack(remoteStream.getVideoTracks()[0]);
            auditStream.addTrack(localStream.getAudioTracks()[0]);
            auditStream.addTrack(remoteStream.getAudioTracks()[0]);

            auditConn.addStream(auditStream);

            auditConn.setRemoteDescription(new RTCSessionDescription(offer));

            auditConn.createAnswer()
                .then(function (answer) {
                    auditConn.setLocalDescription(answer);

                    signalHub.invoke('sendAnswer', sender, answer)
                        .fail(function (err) {
                            var msgError = {
                                message: 'Error enviando respuesta a ' + sender,
                                source: 'Signaling::sendAnswer(sender, answer)',
                                stack: err
                            };

                            that.onError(msgError);
                        });;
                })
                .catch(function (err) {
                    console.log('Error creando la respuesta:', err);
                });

            return;
        }

        idcallee = sender;

        oncall = true;

        localConn.setRemoteDescription(new RTCSessionDescription(offer));

        localConn.createAnswer()
            .then(function (answer) {
                localConn.setLocalDescription(answer);

                signalHub.invoke('sendAnswer', sender, answer)
                    .fail(function (err) {
                        var msgError = {
                            message: 'Error enviando respuesta a ' + sender,
                            source: 'Signaling::sendAnswer(sender, answer)',
                            stack: err
                        };

                        that.onError(msgError);
                    });;
            })
            .catch(function (err) {
                console.log('Error creando la respuesta:', err);
            });
    });

    /*** Server methods ***/
    this.getUserList = function () {
        return signalHub.invoke('getUserList')
            .fail(function (err) {
                var msgError = {
                    message: 'No se pudo obtener la lista de usuarios',
                    source: 'Signaling::getUserList()',
                    stack: err
                };

                that.onError(msgError);
            });
    };

    this.initMediaDevices = function (audioOpts, videoOpts) {
        return usermedia.connectDevices(audioOpts, videoOpts)
            .then(function (stream) {
                setupPeerConnection(stream);
                onAudioLevel();
                return stream;
            });
    };

    this.callTo = function (callee) {
        idcallee = callee;

        localConn.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
            .then(function (offer) {
                localConn.setLocalDescription(offer);

                signalHub.invoke('sendOffer', callee, offer)
                    .fail(function (err) {
                        var msgError = {
                            message: 'Error enviando oferta a ' + callee,
                            source: 'Signaling::sendOffer(callee, answer)',
                            stack: err
                        };

                        that.onError(msgError);
                    });
            })
            .catch(function (err) {
                console.log('Error creando la oferta', err);
            });
    };

    this.responseTo = function (caller, response) {
        var msg = {
            type: 'response',
            response: response,
        };

        that.sendMessage(caller, msg);
    };

    this.hangup = function () {
        //clearInterval(statstimer);
        if (oncall) {
            oncall = false;
            usermedia.stop();
            localConn.close();
            that.onAudioLevel(0);
            window.cancelAnimationFrame(audiolevelanim);
            that.onHangup(idcallee);

            return signalHub.invoke('hangup', idcallee)
                .fail(function (err) {
                    var msgError = {
                        message: 'No se pudo terminar la llamada con ' + idcallee,
                        source: 'Signaling::hangup(callee)',
                        stack: err
                    };

                    that.onError(msgError);
                });
        }
    };

    this.sendMessage = function (receiver, message) {
        return signalHub.invoke('sendMessage', receiver, message)
            .fail(function (err) {
                var msgError = {
                    message: 'No se pudo enviar el mensaje a ' + receiver,
                    source: 'Signaling::sendMessage(receiver, message)',
                    stack: err
                };

                that.onError(msgError);
            });
    };

    /***/
    function printStats() {
        localConn.getStats()
            .then(function (report) {
                report.forEach(function (stat) {
                    var kilobytes = 0;

                    if (stat.type == 'outbound-rtp' && stat.isRemote == false) {
                        if (stat.mediaType == 'video') {
                            kilobytes = (stat.bytesSent - videosent) / 1024;
                            $('#videosend').html(kilobytes.toFixed(1));
                            videosent = stat.bytesSent;
                        }

                        if (stat.mediaType == 'audio') {
                            kilobytes = (stat.bytesSent - audiosent) / 1024;
                            $('#audiosend').html(kilobytes.toFixed(1));
                            audiosent = stat.bytesSent;
                        }
                    }

                    if (stat.type == 'inbound-rtp' && stat.isRemote == false) {
                        if (stat.mediaType == 'video') {
                            kilobytes = (stat.bytesReceived - videorecv) / 1024;
                            $('#videorecv').html(kilobytes.toFixed(1));
                            videorecv = stat.bytesReceived;
                        }

                        if (stat.mediaType == 'audio') {
                            kilobytes = (stat.bytesReceived - audiorecv) / 1024;
                            $('#audiorecv').html(kilobytes.toFixed(1));
                            audiorecv = stat.bytesReceived;
                        }
                    }
                });
            })
            .catch(function (err) {
                console.log(err);
            });
    }
    /***/

    function setupPeerConnection(stream, callee) {
        var configuration = {
            "iceServers": [{
                "urls": ["stun:turn.syc.com.co"]
            }, {
                "urls": ["turn:turn.syc.com.co:80?transport=tcp"],
                "username": "3b9f5824",
                "credential": "9c36a9958a68",
            }]
        };

        localConn = new RTCPeerConnection(configuration);
        //auditConn = new RTCPeerConnection(configuration);

        localConn.onaddstream = function (evt) {
            remoteStream = evt.stream;
            that.onAddStream(evt.stream);

            statstimer = 0;
            videosent = 0;
            audiosent = 0;
            videorecv = 0;
            audiorecv = 0;

            //statstimer = setInterval(printStats, 1000);
        };

        localConn.onicecandidate = function (evt) {
            if (evt.candidate) {
                signalHub.invoke('sendCandidate', idcallee, evt.candidate)
                    .fail(function (err) {
                        var msgError = {
                            message: 'Error enviando IceCandidate ' + callee,
                            source: 'Signaling::sendCandidate(receiver, candidate)',
                            stack: err
                        };

                        that.onError(msgError);
                    });
            }
        };

        //auditConn.onicecandidate = function (evt) {
        //    if (evt.candidate) {
        //        signalHub.invoke('sendCandidate', 'audit', evt.candidate)
        //            .fail(function (err) {
        //                var msgError = {
        //                    message: 'Error enviando IceCandidate ' + callee,
        //                    source: 'Signaling::sendCandidate(receiver, candidate)',
        //                    stack: err
        //                };

        //                that.onError(msgError);
        //            });
        //    }
        //};

        localConn.oniceconnectionstatechange = function (evt) {
            that.onConnectionStateChange(localConn.iceConnectionState);
        };

        localStream = stream;
        localConn.addStream(stream);
    }

    function onAudioLevel() {
        audiolevelanim = requestAnimationFrame(onAudioLevel);

        that.onAudioLevel(usermedia.getAudioLevel());
    }
}
