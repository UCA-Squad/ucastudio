class DeviceManager extends EventEmitter {

  constructor() {
    super();
    this.video = {};
    this.audio = {};
    this.desktop = new Device({
      deviceId: 'desktop',
      groupId: '',
      kind: 'desktopinput',
      deviceType: 'desktop',
      label: 'Desktop'
    });

    this.desktop.on('stream', stream => {
      this.emit('stream', {id: 'desktop', stream: stream});
      if (this.isRecording) {
        this.desktop.record();
      }
    });

    Object.defineProperty(this, 'devices', {
      get: function() {
        let devices = {desktop: this.desktop};
        for (let key in this.video) {
          if (key !== 'default') {
            devices[key] = this.video[key];
          }
        }
        for (let key in this.audio) {
          if (key !== 'default') {
            devices[key] = this.audio[key];
          }
        }
        return devices;
      }
    });

    let _isRecording = false;

    Object.defineProperty(this, 'isRecording', {
      get: function() {
        return _isRecording;
      },
      set: function(bool) {
        if (typeof bool == 'boolean') {
          _isRecording = bool;
        }
        else {
          throw new Error('Please provide of a boolean value for assignment instead of this ' + (typeof bool));
        }
      }
    });

    navigator.mediaDevices.enumerateDevices()
      .then(devices => {
        ['audio', 'video'].forEach(deviceType => {
          this[deviceType] = devices.filter(device => device.kind === `${deviceType}input`)
                               .reduce((result, info) => {
                                 result[info.deviceId] = new Device(info);
                                 result[info.deviceId].on('stream', stream => {
                                   this.emit('stream', {id: info.deviceId, stream: stream});
                                   if (this.isRecording) {
                                     result[info.deviceId].record();
                                   }

                                   if (stream.getAudioTracks().length > 0) {
                                     this.desktop.attachAudioTrack(stream);
                                   }
                                 });
                                 return result;
                               }, {});
        });

        this.emit('enumerated', this.devices);

        for (let dev in this.devices) {
          this.devices[dev].on('record.prepare', label =>
            this.emit('record.prepare', {
               label: label,
                  id: dev,
              flavor: dev === 'desktop' ? 'Écran' : 'Orateur'
            })
          );
          this.devices[dev].on('record.complete', obj =>
            this.emit('record.complete', {
               media: obj.media,
                 url: obj.url,
                  id: dev,
            })
          );
          this.devices[dev].on('stream.mute', () => this.emit('stream.mute', dev));
        }
      });
  }

  connect(id, opts, idAudio=null) {
    if (id == 'desktop') {
      return this.desktop.connect();
    }

    if (this.video.hasOwnProperty(id)) {
      return this.video[id].connect(opts, idAudio);
    }

    if (this.audio.hasOwnProperty(id)) {
      return this.audio[id].connect(opts);
    }

    return new Promise((resolve, reject) => reject("no such device"));
  }

  record() {
    for (var dev in this.devices) {
      if (this.devices[dev].stream) {
        this.devices[dev].record();
      }
    }
    this.isRecording = true;
  }

  pauseRecording() {
    for (var dev in this.devices) {
      if (this.devices[dev].stream) {
        this.devices[dev].pauseRecording();
      }
    }
  }

  stopRecording() {
    for (var dev in this.devices) {
      if (this.devices[dev].stream) {
        this.devices[dev].stopRecording();
        let tracks = this.devices[dev].stream.getTracks();
        tracks.forEach(function(track) {
          track.stop();
        });
      }
    }
    this.isRecording = false;
  }

  changeResolution(id, res) {
    return new Promise((resolve, reject) => {
      if (this.devices.hasOwnProperty(id)) {
        this.devices[id].changeResolution(res)
          .then(stream => resolve({id: id, stream: stream}))
          .catch(err => reject(err));
      }
      else {
        reject("no such device");
      }
    });
  }
}

class Device extends EventEmitter {

  constructor(device) {
    super();

    let _stream = null;
    this.recorder = null;
    this.cachedAudioTracks = [];

    let _candidates = [
      {
        "id" : "vga",
        "label": "VGA",
        "width": 640,
        "height": 480,
        "ratio": "4:3"
      },
      {
        "id" : "fullhd",
        "label": "1080p(FHD)",
        "width": 1920,
        "height": 1080,
        "ratio": "16:9"
      },
      {
        "id" : "hd",
        "label": "720p(HD)",
        "width": 1280,
        "height": 720,
        "ratio": "16:9"
      },
      {
        "id" : "svga",
        "label": "SVGA",
        "width": 800,
        "height": 600,
        "ratio": "4:3"
      },
      {
        "id" : "nhd",
        "label": "360p(nHD)",
        "width": 640,
        "height": 360,
        "ratio": "16:9"
      },
      {
        "id" : "qvga",
        "label": "QVGA",
        "width": 320,
        "height": 240,
        "ratio": "4:3"
      }

    ];

    Object.defineProperty(this, 'candidates', {
      get: function() {
        return _candidates;
      },
      configurable: false,
      enumerable: false,
    });

    Object.defineProperty(this, 'stream', {
      get: function() {
        return _stream;
      },
      set: function(stream) {
        if (stream instanceof MediaStream) {
          _stream = stream;
          this.emit('stream', _stream);
        }
      }
    });

    let _info = device;
    Object.defineProperty(this, 'info', {
      get: function() {
        return _info;
      },
      configurable: false,
      enumerable: false,
    });

    this.deviceType = device.deviceType || (device.kind === 'audioinput' ? 'audio' : 'video');

    let _audConstraints = {audio: {exact: device.deviceId}};
    let _vidConstraints = {audio: true, video: {exact: device.deviceId, width: {exact: 640}, height: {exact: 480}, facingMode: "user"}};
    let _desktop = {
      firefox: {
        video: {mediaSource: 'screen', frameRate: {min: 15, ideal: 25, max: 30}}
      },
      chrome: {
        audio: false,
        video: { mandatory: {
                   chromeMediaSource: 'desktop',
                   chromeMediaSourceId: null,
                   maxWidth: window.screen.width,
                   maxHeight: window.screen.height
                 }
               }
      },
      other: null
    }
    let _browser = window.hasOwnProperty('InstallTrigger') ? 'firefox' : (
                     window.hasOwnProperty('chrome') && chrome.app ? 'chrome' : 'other'
                   );

    this.isChrome = _browser === 'chrome';

    Object.defineProperty(this, 'browser', {
      get: function() {
        return _browser;
      }
    });

    Object.defineProperty(this, 'constraints', {
      get: function() {
        switch(this.deviceType) {
          case 'audio':
            return _audConstraints;

          case 'video':
            return _vidConstraints;

          case 'desktop':
            return _desktop[_browser];
        }
      },
      enumerable: false
    });

    //PAS DE ON DERRIERE SERT A QUELQUE CHOSE ????
    if (this.deviceType === 'desktop' && _browser === 'chrome') {
      window.addEventListener('message', e => {
        if (e.data.type && e.data.type == 'SS_DIALOG_SUCCESS') {
          this.emit('streamId', e.data.streamId);
        }
      });
    }
  }

  connect(opts, idAudio) {

    if (this.deviceType === 'desktop' && 'getDisplayMedia' in navigator.mediaDevices) {
      return this.connectDisplayMedia(opts);
    }
    else if (this.deviceType === 'desktop' && this.isChrome) {
      return this.connectChromeDesktop(opts);
    }

    // if((opts == 'isSwitch' && $(".videoDevice").hasClass('active')) || opts == 'isOnlyChangeMic') {
    if($(".videoDevice").hasClass('active'))
      $('.audioDevice').removeClass('active');

    if (this.stream != null) {
      this.stream.getTracks().forEach((track) => {
        track.stop();
      });
    }

    return new Promise((resolve, reject) => {
      opts = opts || {};

      if(opts == 'isSwitch' || opts == 'isOnlyChangeMic')
      {
        var audio = document.querySelector('#audio');
        var video = document.querySelector('#video');

        if ( $(".videoDevice").hasClass('active'))
        {
          let constraintAudioTest = true;
          if(idAudio != null)
            constraintAudioTest = { deviceId: {exact: idAudio} }
          // else
          //   if($('#audio').data('id') != null)
          //     constraintAudioTest = {deviceId: {exact: $('#audio').data('id')}}

          navigator.mediaDevices.getUserMedia({audio: constraintAudioTest, video: { deviceId: { exact: this.constraints.video.exact, facingMode: "user"} } })
              .then(stream => {

                if(opts != 'isOnlyChangeMic')
                  $('.labelWebcam').trigger('click');

                if(opts == 'isOnlyChangeMic') {
                  $('.labelAudio').trigger('click');

                  var tracks = stream.getTracks();
                  for(var i = 0; i < tracks.length; i++){
                    if(tracks[i].kind == 'audio')
                      this.getDevice(tracks[i].getSettings().deviceId)
                  }
                }
                else
                {
                  var tracks = stream.getTracks();
                  for(var i = 0; i < tracks.length; i++){
                    this.getDevice(tracks[i].getSettings().deviceId)
                  }
                }

                this.stream = stream;
                video.srcObject = stream;

                //manque foreac
                navigator.mediaDevices.enumerateDevices().then(devices => {
                  for (var key in devices) {
                    if (this.deviceType == 'video' && devices[key].kind == 'videoinput' && this.constraints.video.exact == devices[key].deviceId) {
                      let camera = {};
                      camera.id = devices[key].deviceId;
                      camera.label = devices[key].label;

                      this.gum(this.candidates[0], camera);
                    }
                  }
                });

                if(idAudio != null) {
                   // $('#audio').attr('data-id', idAudio);
                  $('#audiostream').val(this.constraints.video.exact);
                }

                $('#video').attr('data-id', this.constraints.video.exact);
                $('#webcamstream').val(this.constraints.video.exact);

                resolve(stream);

                document.querySelector('label.labelVideoResolution:first-of-type span').textContent = 'VGA (480p,4:3)';
                $('.videoDevice').removeClass('seizeneuvieme').addClass('quartretiers');

              })
              .catch(function (e) {console.log(e); });
        }
        else if($(".audioDevice").hasClass('active'))
        {
          navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: this.constraints.audio.exact } }})
              .then(stream => {

                this.stream = stream;

                audio.srcObject = stream;

                $('.labelAudio').trigger('click');

                var tracks = stream.getTracks();
                for(var i = 0; i < tracks.length; i++){
                  this.getDevice(tracks[i].getSettings().deviceId)
                }

                $('#audio').attr('data-id', this.constraints.audio.exact);

                $('#audiostream').val(this.constraints.audio.exact);

                resolve(stream);
              })
              .catch(err => reject(err));
        }
      }
      else
      {
        for (var key in opts) {
          if (this.deviceType === 'desktop') {
            this.constraints.video[key] = opts[key];
          }
          else if(opts != 'mustListReso') {
            this.constraints[this.deviceType][key] = opts[key];
          }
        }

        // let constraintAudioTest = true;
        //
        //if(opts != "mustListReso") {
        //   if ($("#audio").data('id') != "") {
        //     this.constraints.audio = {deviceId: {exact: $("#audio").data('id')}}
        //   }
       // }
          //on doit check si switch reson si c'est le cas on force le device

        // if(opts == "mustListReso")
        //   navigator.mediaDevices.getUserMedia({audio: true, video: { deviceId: { exact: $('#video').data('id'), facingMode: "user"} } })
        // else
        //   navigator.mediaDevices.getUserMedia({audio: true, video: { deviceId: { exact: $('#video').data('id'), facingMode: "user"} } })
        navigator.mediaDevices.getUserMedia(this.constraints)
            .then(stream => {
              if (!this.isChrome && this.deviceType === 'desktop') {
                this.cachedAudioTracks.forEach(track =>
                    stream = new MediaStream([track, ...stream.getVideoTracks(), ...stream.getAudioTracks()])
                );
              }

              this.stream = stream;

              var tracks = stream.getTracks();
              for(var i = 0; i < tracks.length; i++)
                this.getDevice(tracks[i].getSettings().deviceId)

              resolve(stream);

              navigator.mediaDevices.enumerateDevices().then(devices => {
                for (var key in devices) {
                  if ($('.labelWebcam').find('li[data-id="' + devices[key].deviceId + '"]').length != 0) {
                    $('.labelWebcam').find('li[data-id="' + devices[key].deviceId + '"]').find('button').attr('data-label', devices[key].label);
                    $('.labelWebcam').find('li[data-id="' + devices[key].deviceId + '"]').find('button').html(devices[key].label);
                  }
                  if ($('.labelAudio').find('li[data-id="' + devices[key].deviceId + '"]').length != 0) {
                    $('.labelAudio').find('li[data-id="' + devices[key].deviceId + '"]').find('button').attr('data-label', devices[key].label);
                    $('.labelAudio').find('li[data-id="' + devices[key].deviceId + '"]').find('button').html(devices[key].label);
                  }

                  if(opts == "mustListReso" && this.deviceType == 'video' && devices[key].kind == 'videoinput' && this.constraints.video.exact ==  devices[key].deviceId) {
                    let camera = {};
                    camera.id = devices[key].deviceId;
                    camera.label = devices[key].label;

                    this.gum(this.candidates[0], camera);
                  }
                }
              })
                  .catch(err => { throw err })
            }).catch(err => reject(err));
      }
    });
  }

  connectDisplayMedia(opts) {
    return new Promise((resolve, reject) => {
      var constraints = {};
      if(typeof opts != 'undefined') {
        var constraints = {  video: { width: opts.width, height: opts.height } };
      }
      return navigator.mediaDevices.getDisplayMedia(constraints)
               .then(stream => {
                 this.stream = stream;
                 this.cachedAudioTracks.forEach(track => this.stream.addTrack(track));
                 resolve(stream);
               })
               .catch(err => reject(err));
    });
  }

  connectChromeDesktop(opts) {
    return new Promise((resolve, reject) => {
      this.once('streamId', {
        fn: function(id) {
          this.constraints.video.mandatory.chromeMediaSourceId = id;
          opts = opts || {};
          for (var key in opts) {
            this.constraints.video.mandatory['max' + key.charAt(0).toUpperCase() + key.substring(1)] = opts[key];
          }
          navigator.mediaDevices.getUserMedia(this.constraints)
            .then(stream => {
              this.stream = stream;
              this.cachedAudioTracks.forEach(track => this.stream.addTrack(track));
              resolve(stream);
            })
            .catch(err => reject(err));
        },
        scope: this
      });
      window.postMessage({
        type: 'SS_UI_REQUEST',
        text: 'start',
         url: location.origin
      }, '*');
    });
  }

  attachAudioTrack(streamOrTrack) {
    if (!(streamOrTrack instanceof MediaStream) &&
        !(streamOrTrack instanceof MediaStreamTrack)) {
      return;
    }

    try {
      let audioTrack = streamOrTrack instanceof MediaStreamTrack ?
                         streamOrTrack :
                         streamOrTrack.getAudioTracks()[0];

      if (!this.stream) {
        this.cachedAudioTracks.push(audioTrack);
      }
      else {
        if (this.isChrome) {
          this.stream.addTrack(audioTrack);
        }
        else {
          this.stream = new MediaStream([audioTrack, ...this.stream.getVideoTracks(), ...this.stream.getAudioTracks()])
        }
        this.emit('stream.mute');
      }
    } catch(e) {
      //MediaStream has no audio tracks
    }
  }
  gum(candidate, device, cmpt = 1 ) {

    let constraints = {
      audio: false,
      video: {
        deviceId: device.id ? {exact: device.id} : undefined,
        width: {exact: candidate.width},    //new syntax
        height: {exact: candidate.height}   //new syntax
      }
    };

    setTimeout(() => {
      navigator.mediaDevices.getUserMedia(constraints)
          .then(stream => {
            if(candidate.id)
              $('.' + candidate.id).show();

            if (cmpt < this.candidates.length)
              this.gum(this.candidates[cmpt++], device, cmpt);
          })
          .catch((error) => {
            if(candidate.id)
              $('.' + candidate.id).hide();
            if (cmpt < this.candidates.length)
              this.gum(this.candidates[cmpt++], device, cmpt);
          });
    }, (this.stream ? 200 : 0));  //official examples had this at 200

  }

  changeResolution(res) {
    if (typeof res === 'string' && this.deviceType == 'desktop') {
      res = {width: parseInt(res) * 4 / 3, height: parseInt(res)};
    }
    else {
      for(var i = 0; i < this.candidates.length; i++) {
        if(this.candidates[i].id == res) {

          if (res == 'nhd' || res == 'hd' || res == 'fullhd')
            $('.videoDevice').removeClass('quartretiers').addClass('seizeneuvieme');
          else
            $('.videoDevice').removeClass('seizeneuvieme').addClass('quartretiers');

          res = {width: {exact: this.candidates[i].width }, height: {exact: this.candidates[i].height }};
          break;
        }
      }
    }

    this.stream.getVideoTracks().forEach(track => track.stop());
    this.stream = null;
    return this.connect(res);
  }

  record() {
    if (!this.recorder) {
      if (!this.stream) {
        throw new Error("Can't record as stream is not active");
      }

      this.recorder = new Recorder(this.stream, this.deviceType);
      this.recorder.on('record.complete', media => {
        this.emit('record.complete', media);
        this.recorder = null;
      });
      this.recorder.start(500);
    }
    else {
      this.recorder.resume();
    }
  }

  stopRecording() {
    if (this.recorder) {
      this.recorder.stop();
      this.emit('record.prepare', this.info.label);
    }
  }

  pauseRecording() {
    this.recorder.pause();
  }

  getDevice(id)  {
    navigator.mediaDevices.enumerateDevices()
        .then(function(devices) {
          devices.forEach(function(device) {
              if (device.deviceId == id) {
                if (device.kind == 'audioinput')
                  $('.labelMicSelect').html(trimLabelDevice(device.label), 'audio');
                if (device.kind == 'videoinput')
                  $('.labelCamSelect').html(trimLabelDevice(device.label), 'video');
              }
          });
        })
        .catch(function(err) {
          console.log(err.name + ": " + err.message);
        });
    }
}

/**
 *
 * @param deviceLabelTmp
 * @param type
 */
function trimLabelDevice(deviceLabelTmp, type)
{
  var length = 50;

  let deviceLabel = type == 'video' ?
      deviceLabelTmp.replace('Webcam','') :
      deviceLabelTmp.replace('Microphone','');

  var trimmedString = deviceLabel.length > length ?
      deviceLabel.substring(0, length - 3) + "..." :
      deviceLabel;

  return deviceLabel;
}