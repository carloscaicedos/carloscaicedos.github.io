var signaling, username, remoteStream, msgHistory = {}, gotFocus = true;

function login() {
    username = prompt('Ingrese un nombre de usuario');

    if (username != null && username.trim() != '') {
        signaling.connect(username);
    } else {
        alert('Debe ingresar un nombre de usuario.\n\nIntente de nuevo.');
    }
}

function logout() {
    if (confirm('¿Desea salir?')) {
        signaling.disconnect();
    }
}

function requestNotificationPermission() {
    if ('Notification' in window) {
        Notification.requestPermission().then(function (result) {
            if (result != 'granted') {
                alert('La aplicación requiere que acepte recibir notificaciones en el navegador.');
            }
        });
    } else {
        alert('Este navegador no soporta notificaciones, por lo tanto no se podrá informar en el momento en que se haya asignado una nueva tarea.');
    }
}

function notify(title, message) {
    if (gotFocus) {
        console.log('No se notifica.');
        return;
    }

    var options = {
        body: message,
        icon: './images/connect2.png'
    };

    var noti = new Notification(title, options);
}

function clearPanels() {
    $('#remoteVideo')[0].srcObject = null;
    $('#localVideo')[0].srcObject = null;
    $('.contactList').empty();
    $('#logMessages').empty();
    $('#txtMessage').empty();
}

function addMessage(message, sender, datetime) {
    var now = datetime.getFullYear() + '-' + (datetime.getMonth() + 1) + '-' + datetime.getDate()
        + ' ' + datetime.getHours() + ':' + datetime.getMinutes() + ':' + datetime.getSeconds();

    var messageDiv = document.createElement('div');
    messageDiv.className = 'message';

    var senderSpan = document.createElement('span');
    senderSpan.className = 'sender';
    senderSpan.innerHTML = sender;
    messageDiv.appendChild(senderSpan);

    var datetimeSpan = document.createElement('span');
    datetimeSpan.className = 'datetime';
    datetimeSpan.innerHTML = now;
    messageDiv.appendChild(datetimeSpan);

    if (sender == username) {
        messageDiv.classList.add('ownmessage');
        senderSpan.innerHTML = 'Yo';
    }

    var textSpan = document.createElement('div');
    textSpan.className = 'text';
    textSpan.innerHTML = message;

    messageDiv.appendChild(textSpan);

    $('#logMessages').append(messageDiv);

    $('.msgPanel').scrollTop($('#logMessages').height());
}

function showMessages(contact) {
    $('#logMessages').empty();

    if (msgHistory[contact] != undefined) {
        for (var i = 0; i < msgHistory[contact].length; i++) {
            addMessage(msgHistory[contact][i].message, msgHistory[contact][i].sender, msgHistory[contact][i].datetime);
        }
    }
}

function selectContact(evt) {
    var contact = evt.target.innerText;
    $('.contact.selected').removeClass('selected');

    evt.target.classList.toggle('selected', true);

    showMessages(contact);
}

function clickCall(evt) {
    var audioOpts, videoOpts, message, callee = evt.target.parentElement.parentElement.innerText.trim();

    if (evt.target.type == 'hangup') {
        signaling.hangup();
    } else {
        audioOpts = false;

        if (evt.target.type == 'call') {
            audioOpts = true;

            videoOpts = {
                frameRate: {
                    ideal: 10,
                    max: 30
                }
            };
        } else if (evt.target.type == 'screen') {
            var isFirefox = /Firefox/.test(navigator.userAgent);

            if (isFirefox) {
                videoOpts = {
                    mediaSource: 'screen', // Para firefox                
                }
            } else {
                videoOpts = {
                    mandatory: {
                        chromeMediaSource: 'screen' // Para el nuevo Internet Explorer aka Chrome
                    }
                };
            }
        }

        message = {
            type: 'call',
            callType: evt.target.type
        };

        signaling.initMediaDevices(audioOpts, videoOpts)
            .then(function (stream) {
                if (evt.target.type == 'call') {
                    $('#localVideo')[0].srcObject = stream;
                }
                console.log('initMediaDevices', callee, message);
                signaling.sendMessage(callee, message);
            })
            .catch(function (err) {
                alert('No se pudo acceder al dispositivo de entrada.');

                console.log('No se pudo acceder al dispositivo de entrada.', err);
            });
    }

    evt.stopPropagation();
}

function addUser(user) {
    var contact = document.createElement('div');
    contact.className = 'contact';
    contact.id = user;
    contact.innerText = user;
    contact.onclick = selectContact;

    var imgScreen = document.createElement('img');
    imgScreen.src = './images/screen.png';
    imgScreen.type = 'screen';
    imgScreen.onclick = clickCall;

    var imgCall = document.createElement('img');
    imgCall.src = './images/call.png';
    imgCall.type = 'call';
    imgCall.onclick = clickCall;

    var imgHangup = document.createElement('img');
    imgHangup.src = './images/hangup.png';
    imgHangup.type = 'hangup';
    imgHangup.className = 'hangup';
    imgHangup.onclick = clickCall;

    var btnSpan = document.createElement('span');
    btnSpan.appendChild(imgScreen);
    btnSpan.appendChild(imgCall);
    btnSpan.appendChild(imgHangup);

    contact.appendChild(btnSpan);

    $('.contactList').append(contact);
}

function removeUser(user) {
    $('.contact').each(function () {
        if ($(this).text() == user) {
            $(this).remove();
        }
    });
}

function populateUserList(userList) {
    for (var i = 0; i < userList.length; i++) {
        if (userList[i] != username && userList[i] != 'audit') {
            addUser(userList[i]);
        }
    }
}

function sendMessage() {
    var message = $('#txtMessage').val();
    var receiver = $('.contact.selected').text();
    console.log(receiver);

    if (receiver != '' && signaling.isConnected) {
        signaling.sendMessage(receiver, message.trim())
            .done(function () {
                if (msgHistory[receiver] == undefined) {
                    msgHistory[receiver] = [];
                }

                msgHistory[receiver].push({
                    "sender": username,
                    "message": message.trim(),
                    "datetime": new Date()
                });

                addMessage(message.trim(), username, new Date());

                $('#txtMessage').val('');
            })
            .fail(function () {
                alert('No se pudo enviar el mensaje.');
            });
    } else {
        alert('Seleccione el usuario con el que desea establecer comunicación.');
    }
}

window.onfocus = function () {
    gotFocus = true;
};

window.onblur = function () {
    gotFocus = false;
};

$(function () {
    requestNotificationPermission();

    signaling = new Signaling();

    signaling.onConnected = function () {
        $('#username').removeClass('disconnected').html(username);
        $('#btnLogin').addClass('logout');

        signaling.getUserList()
            .done(function (list) {
                populateUserList(list);
            }).fail(function (err) {
                alert('No se pudo obtener la lista de usuarios conectados.');
            });

        console.log('Conectado...');
    };

    signaling.onDisconnected = function () {
        clearPanels();

        $('#username').addClass('disconnected').html('Desconectado');
        $('#btnLogin').removeClass('logout');

        console.log('Desconectado.');
    };

    signaling.onMessage = function (message, sender) {
        if (typeof message == 'object') {
            switch (message.type) {
                case 'call':
                    var msg, result, videoOpts;

                    notify('Demo Chat', 'Llamada entrante de ' + sender + '.');

                    result = confirm('¿Desea aceptar la llamada de ' + sender + '?');

                    if (result) {
                        videoOpts = {
                            frameRate: {
                                ideal: 10,
                                max: 30
                            }
                        };

                        signaling.initMediaDevices(true, videoOpts)
                            .then(function (stream) {
                                $('#localVideo')[0].srcObject = stream;

                                signaling.responseTo(sender, true);

                                $('.selected').removeClass('selected');
                                $('#' + sender).addClass('selected oncall');
                            })
                            .catch(function (err) {
                                signaling.responseTo(sender, false);
                            });
                    } else {
                        signaling.responseTo(sender, false);
                    }

                    break;
                case 'response':
                    if (message.response) {
                        signaling.callTo(sender);
                        $('#' + sender).addClass('oncall');
                    }
                    break;
            }
        } else if (typeof message == 'string') {
            notify('Demo Chat', sender + ' dice:\n' + message);

            if (msgHistory[sender] == undefined) {
                msgHistory[sender] = [];
            }

            msgHistory[sender].push({
                "sender": sender,
                "message": message,
                "datetime": new Date()
            });

            if ($('.selected').text() == sender) {
                addMessage(message, sender, new Date());
            }
        }

        console.log(sender + ':', message);
    };

    signaling.onUserConnected = function (user) {
        if (user != 'audit') {
            notify('Demo Chat', user + ' se ha conectado.');

            addUser(user);
            console.log(user + ' se ha conectado.');
        }
    };

    signaling.onUserDisconnected = function (user) {
        removeUser(user);
        console.log(user + ' se ha desconectado.');
    };

    signaling.onMultipleConnection = function () {
        alert('Se ha conectado desde otra ubicación.');
        logout();
    };

    signaling.onAddStream = function (stream) {
        $('#remoteVideo')[0].srcObject = stream;

        remoteStream = stream;

        console.log('onaddstream', stream);
    };

    signaling.onHangup = function () {
        $('#remoteVideo')[0].srcObject = null;
        $('#localVideo')[0].srcObject = null;

        $('.oncall').removeClass('oncall');

        remoteStream = null;
        console.log('hangup');
    };

    signaling.onAudioLevel = function (level) {
        $('#soundLevel').css('height', level + '%');
    };

    signaling.onRecorded = function (data, filename) {
        var videoURL = window.URL.createObjectURL(data);

        var saveLink = document.createElement('a');
        saveLink.href = videoURL;
        saveLink.target = '_blank';
        saveLink.download = filename;
        saveLink.innerHTML = filename;

        var evt = document.createEvent('MouseEvents');
        evt.initMouseEvent('click', true, true, window, 1, 0, 0, 0, 0, false, false, false, false, 0, null);

        saveLink.dispatchEvent(evt);
        window.URL.revokeObjectURL(saveLink);
    };

    signaling.onError = function (err) {
        console.log('Error', err);
    };

    /*** Controls events ***/
    $('#btnLogin').click(function (evt) {
        if ($('#btnLogin').hasClass('logout')) {
            logout();
        } else {
            login();
        }
    });

    $('#btnSend').click(function (evt) {
        sendMessage();
    });

    $('#txtMessage').keydown(function (evt) {
        if (evt.which == 13) {
            sendMessage();

            evt.preventDefault();
        }
    });

    $('#remVideo').click(function (evt) {
        if ($('#remoteVideo')[0].paused) {
            $('#remoteVideo')[0].play();
            $(this).css('background-image', 'url(../images/video_on.png)');
        } else {
            $('#remoteVideo')[0].pause();
            $(this).css('background-image', 'url(../images/video_off.png)');
        }
    });

    $('#remAudio').click(function (evt) {
        console.log('pause remAudio');
        if ($('#remoteVideo')[0].muted) {
            $('#remoteVideo')[0].muted = false;
            $(this).css('background-image', 'url(../images/volume_on.png)');
        } else {
            $('#remoteVideo')[0].muted = true;
            $(this).css('background-image', 'url(../images/volume_off.png)');
        }
    });

    $('#recVideo').click(function (evt) {
        if (!!remoteStream) {
            signaling.record(remoteStream);

            $(this).toggleClass('sonar');
        }
    });

    $('#locVideo').click(function (evt) {
        if (signaling.pauseVideo()) {
            $(this).css('background-image', 'url(../images/video_on.png)');
        } else {
            $(this).css('background-image', 'url(../images/video_off.png)');
        }
    });

    $('#locAudio').click(function (evt) {
        if (signaling.pauseAudio()) {
            $(this).css('background-image', 'url(../images/mic_on.png)');
        } else {
            $(this).css('background-image', 'url(../images/mic_off.png)');
        }
    });
});