const ts = new TranslationService();
const deviceMgr = new DeviceManager();
const compositor = new Compositor();
const rafLoop = new RAFLoop();
const audAnalyser = new AudioAnalyser();
const peers = {};

function App() {
  let deviceEls = document.querySelectorAll('.mediadevice[data-target]');
  this.mediaElements = [...deviceEls]
                         .reduce((result, current) => {
                           result[current.getAttribute('data-target')] = current.querySelector(':first-child');
                           return result;
                         }, {});

  this.mediaToggles = [...document.querySelectorAll('.streamToggle')]
                        .reduce((result, current) => {
                           result[current.name] = current;
                           return result;
                        }, {});

  this.addDeviceToggle = document.getElementById('addDevice');
  this.cover = document.getElementById('cover');

  this.audioCanvas = document.querySelector('#audio ~ canvas');

  this.recordButton = document.getElementById('startRecord');
  this.pauseButton = document.getElementById('pauseRecord');
  this.stopButton = document.getElementById('startRecord');

  this.timeEl = document.getElementById('recordingTime');
  this.recTime = [];
  this.logNextTick = true;
  this.recTimeToken = null;

  let _isRecording = false;
  let _isPaused = false;

  Object.defineProperty(this, 'isRecording', {
    get: function() {
      return _isRecording;
    },
    set: function(bool) {
      if (typeof bool == 'boolean') {
        _isRecording = bool;

        if (bool) {
          document.body.classList.add('recording');
        }
        else {
          document.body.classList.remove('recording');
        }

        if (!this.recTimeToken) {
          this.recTimeToken = rafLoop.subscribe({
               fn: this.logRecordingTime,
            scope: this
          });
        }
      }
    }
  });

  Object.defineProperty(this, 'isPaused', {
    get: function() {
      return _isPaused;
    },
    set: function(bool) {
      if (typeof bool == 'boolean') {
        _isPaused = bool;
        this.logNextTick = true;

        if (bool) {
          $("#recordingTime").css("left", "45%");
          document.body.classList.add('paused');
          $("#pauseTitle").html("Reprendre");
          $("#pauseTitle").css("margin-left","-1.5em");
        }
        else {
          $("#recordingTime").css("left", "44%");
          document.body.classList.remove('paused');
          $("#pauseTitle").html("Pause");
          $("#pauseTitle").css("margin-left","-0.16em");
        }
      }
    }
  });

  let _needsExtension = false;

  Object.defineProperty(this, 'needsExtension', {
    get: function() {
      return _needsExtension;
    },
    set: function(bool) {
      if (typeof bool == 'boolean') {
        _needsExtension = bool;
        if (bool) {
          document.body.classList.add('extensionRequired');
        }
      }
    }
  });

  this.title = '';
  this.presenter = '';
  this.location = '';

  this.titleEl = document.querySelector('input[name=title]');
  this.presenterEl = document.querySelector('input[name=presenter]');
  this.locationEl = document.querySelector('input[name=location]');

  this.saveRecordings = document.getElementById('saveRecordings');
  this.saveRecordingsFusion = document.getElementById('saveRecordingsFusion');
  this.nextBtn = document.getElementById('nextBtn');

  this.attachEvents();

}

App.prototype = {
  constructor: App,
  attachEvents: function() {
    deviceMgr.on('enumerated', () => {
      for (let deviceType in deviceMgr) {
        this.mediaToggles[deviceType].value = (deviceMgr[deviceType].info || {}).deviceId ||
            Object.keys(deviceMgr[deviceType])
                .filter(device => device !== 'default')
                .reduce((id, current) => id = id || current, null);
      }
    });



    for (let key in this.mediaToggles) {
      this.mediaToggles[key].checked = false;
      this.mediaToggles[key].addEventListener('change', this.toggleStream.bind(this), false);
    }

    audAnalyser.attachCanvas(this.audioCanvas);
    audAnalyser.ondelegation('subscribe.raf', function() {
      let delFns = Array.prototype.slice.call(arguments);
      let token = rafLoop.subscribe({fn: delFns[0], scope: audAnalyser});
      if (delFns[1]) {
        delFns[1](token);
      }
    });
    audAnalyser.ondelegation('pause.raf', token => {
      rafLoop.pauseExecution(token);
    });
    audAnalyser.ondelegation('resume.raf', token => {
      rafLoop.resumeExecution(token);
    });

    document.body.addEventListener('keyup', this.handleKeys.bind(this), false);

    this.recordButton.addEventListener('click', this.startRecord.bind(this), false);
    this.pauseButton.addEventListener('click', this.pauseRecord.bind(this), false);
    this.stopButton.addEventListener('click', this.stopRecord.bind(this), false);

    this.titleEl.addEventListener('keyup', this.setTitle.bind(this), false);
    this.presenterEl.addEventListener('keyup', this.setPresenter.bind(this), false);
    this.locationEl.addEventListener('keyup', this.setLocation.bind(this), false);

    document.getElementById('nextBtn').addEventListener('click', this.setDetails.bind(this), false);

    this.saveRecordings.addEventListener('click', this.saveMedia.bind(this), false);
    this.saveRecordingsFusion.addEventListener('click', this.saveMediaFusion.bind(this), false);
    this.nextBtn.addEventListener('click', this.uploadMedia.bind(this), false);

    document.getElementById('minimiseStreams').addEventListener('change', this.minimiseStreamView.bind(this), false);

    [...document.querySelectorAll('.streamControls label:nth-of-type(1) button')].forEach(btn => {
      btn.addEventListener('click', this.chooseResolution.bind(this), false);
    });

    document.querySelector('label.pull-left.inputSource.labelDesktop').addEventListener('click',this.chooseResolution.bind(this), false);

  },
  toggleStream: function(e) {

    if(this.isRecording)
      return;

    if (!e.target.checked) {
      return;
    }

   if(e.target.id === 'audiostream' && !$('.videoDevice').hasClass('active'))
   {
     deviceMgr.connect(e.target.value)
     .catch(function(err){
       console.log(err);
       if(e.target.value !== 'desktop')
         $('#alertNoWebcam').show();
     }).then(function () {
       if(!$('#alertNoWebcam').is(':visible'))
        $("#startRecord").addClass('canRecord');
       if(!$('#startStopTitle').is(':visible'))
         $('#startStopTitle').show();
     });
   }
   else {

     if(e.target.id !== 'desktopstream' && typeof deviceMgr.audio[audio.getAttribute('data-id')] !== 'undefined' && deviceMgr.audio[audio.getAttribute('data-id')].stream)
       deviceMgr.audio[audio.getAttribute('data-id')].stream.getTracks().forEach(track => track.stop());

     deviceMgr.connect(e.target.value, 'mustListReso')
         .catch(function (err) {
           console.log(err);
           if (e.target.value !== 'desktop')
             $('#alertNoWebcam').show();
         }).then(function () {
           if(!$('#alertNoWebcam').is(':visible'))
            $("#startRecord").addClass('canRecord');
           if(!$('#startStopTitle').is(':visible'))
             $('#startStopTitle').show();
         });
   }
  },
  getTypeOfRec: function(mediaStream) {

    const isFirefox = typeof InstallTrigger !== 'undefined';
    const isChrome = !!window.chrome && (!!window.chrome.webstore || !!window.chrome.runtime);
    const videoTrack = mediaStream.getVideoTracks()[0];

    if (isFirefox) {
      const isNotWindow = (-1 !== videoTrack.label.indexOf('Screen') || -1 !== videoTrack.label.indexOf('Monitor'));
      if(!isNotWindow) //on test si le label est vide ou non bug FF 98, label no set si Ecran
      {
        //bug linux label
        if(videoTrack.label.startsWith('DP-') || videoTrack.label.startsWith('eDP-') || videoTrack.label.startsWith('HDMI-'))
          return true;
        else
          return ("" === videoTrack.label);
      }

      return isNotWindow;
    }
    else if (isChrome) {
      const videoSetting = videoTrack.getSettings();
      return !(videoSetting && videoSetting.displaySurface !== "monitor");
    }
  },
  displayStream: function(stream, value, resSelect = null) {
    audAnalyser.resume();
    let mediaContainer = null;
    [...document.querySelectorAll(`video[data-id="${value}"],audio[data-id="${value}"]`)]
      .forEach(vid => {
        vid.srcObject = stream;
        vid.muted = true;
        vid.parentNode.classList.add('active');
        if (vid.parentNode.querySelector('.streamControls')) {
          mediaContainer = vid.parentNode;
        }
        if (vid.parentNode.classList.contains('front')) {
          vid.parentNode.parentNode.parentNode.classList.add('active');
        }
      });

    let audioContainer = this.mediaElements.audio.parentNode;
    if (stream.getAudioTracks().length > 0){
      // (!audioContainer.classList.contains('active') || stream.getVideoTracks().length === 0) ) {
      audioContainer.classList.add('active');
      audAnalyser.analyse(stream);
    }

    if (stream.getVideoTracks().length > 0 && mediaContainer && mediaContainer.parentNode.id === 'videoView') {

      let videoControls = mediaContainer.querySelector('.streamControls');

      if(value === 'desktop')
      {
        //calcul resolutio

        let typeRec = this.getTypeOfRec(stream);
        if(!typeRec)
          $("#alertTypeDesktopShare").show();
        else
          $("#alertTypeDesktopShare").hide();

        comms.emit('isMonitor', typeRec);

        // let resolution = stream.getVideoTracks()[0].getSettings().height + 'p';
        let resolution = $("#resoDesktopChoose").val();
        if(resSelect != null)
          videoControls.querySelector('label:first-of-type span').textContent = $('#listResoDesktop').find('button[value="'+resSelect+'"]').html();
        else
        {
          if($('#listResoDesktop').find('button[value="'+resolution+'"]').length != 0)
            videoControls.querySelector('label:first-of-type span').textContent =  $('#listResoDesktop').find('button[value="'+resolution+'"]').html();
          else
            videoControls.querySelector('label:first-of-type span').textContent = resolution;
        }
        let resolutionOptions = [...videoControls.querySelectorAll('label:first-of-type button')]
        let doListRes = true;
        resolutionOptions.some(button => {
          if (button.value === resolution) {
            doListRes = false;
            return;
          }
        });

        // if (doListRes) {
        //   resolutionOptions.some((button, i) => {
        //     if (parseInt(resolution) < parseInt(button.value) ||
        //         i === resolutionOptions.length - 1) {
        //       let resButton = document.createElement('button');
        //       button.type = 'button';
        //       button.textContent = button.value = resolution;
        //
        //       if (parseInt(resolution) < parseInt(button.value)) {
        //         button.parentNode.insertBefore(resButton, button);
        //       }
        //       else {
        //         button.parentNode.appendChild(resButton);
        //       }
        //
        //       resButton.addEventListener('click', this.chooseResolution.bind(this), false);
        //       return;
        //     }
        //   });
        // }
      }
      else {

        let resolution = null;
        switch (stream.getVideoTracks()[0].getSettings().height) {
          case 360:
            resolution = 'nHD (360p,16:9)';
            break;
          case 480:
            resolution = 'VGA (480p,4:3)';
            break;
          case 540:
            resolution = 'qHD (540p,16:9)';
            break;
          case 600:
            resolution = 'SVGA (600p,4:3)';
            break;
          case 720:
            resolution = 'HD (720p,16:9)';
            break;
          case 768:
            resolution = 'XGA (768p,4:3)';
            break;
          case 900:
            resolution = 'HD+ (900p,16:9)';
            break;
          case 1080:
            resolution = 'Full HD (1080p, 16:9)';
            break;
          default:
            resolution = 'VGA (480p,4:3)';
        }

        videoControls.querySelector('label:first-of-type span').textContent = resolution;
      }
    }
  },
  switchStream: function(e) { //!!!!!!!!!!!!CHECKER BUG AUDIO RESUME (audiostream et audio value sont bien change quand select)

    if($('#gumRunning').length != 0)
        return;

    let id = e.target.value; //la webcam vers laquelle on veut switch
    let parent = e.target.parentNode;

    //switch de mic uniquement
    if(parent.parentNode.parentNode.classList.contains('labelAudio') && !$(".videoDevice").hasClass('active'))
    {
      let audio = document.querySelector('audio');
      if (audio.getAttribute('data-id') === id) {
        return;
      }

      deviceMgr.audio[audio.getAttribute('data-id')].stream.getTracks().forEach(track => track.stop());
      // deviceMgr.connect(id, 'isSwitch'); //POURQUOI
      deviceMgr.connect(id, 'isSwitch', id);
    }
    else //swich de mic ou de video, les deux run
    {
      //on vérifie si c'est just un switch de mic
      var isOnlyChangeMic = false;
      if(parent.parentNode.parentNode.classList.contains('labelAudio'))
        isOnlyChangeMic = true;

      while (parent && !parent.querySelector('video')) {
        parent = parent.parentNode;
      }

      if (!parent) {
        return console.log('no vid elements');
      }
      let vid = parent.querySelector('#video'); //la video en cours de capture
      if (vid.getAttribute('data-id') === id){
        return;
      }

      let audio = document.querySelector('audio');
      if (audio.getAttribute('data-id') === id) {
            return;
      }

        if(deviceMgr.video[vid.getAttribute('data-id')].stream != null) {
            let vid = document.querySelector('#video'); //la video en cours de capture
            const tracksVideo = vid.srcObject.getTracks();
            tracksVideo.forEach(function (track) {
                track.stop();
                track.enabled = false;
            });
            compositor.removeStream(vid.getAttribute('data-id'));
        }

        if(deviceMgr.audio[audio.getAttribute('data-id')].stream != null){
            let audio = document.querySelector('#audio'); //la video en cours de capture
            const tracksAudio = audio.srcObject.getTracks();
            tracksAudio.forEach(function (track) {
                track.stop();
                track.enabled = false;
            });
            // compositor.removeStream(audio.getAttribute('data-id'));
        }

      if(!isOnlyChangeMic)
        deviceMgr.connect(id, 'isSwitch');
      else
        deviceMgr.connect( $('#webcamstream').val(), 'isOnlyChangeMic', id);
    }
  },
  chooseResolution: function(e) {
    let res = e.target.value;
    let parent = e.target.parentNode;
    while (parent && !parent.classList.contains('mediadevice')) {
      parent = parent.parentNode;
    }

    if (this.isRecording) {
      console.log(parent.querySelector('video').videoHeight);
      return;
    }

    let id = parent.getAttribute('for');
    let streamId = document.getElementById(id).value;
    parent.querySelector('.streamControls input:nth-of-type(1)').checked = false;
    let change = this.changeResolution(streamId, res);
    change.then(streamObj => this.displayStream(streamObj.stream, streamId === 'desktop' ? 'desktop' : 'video', res));

    if(e.target.className === 'desktopReso' && !$(".videoDevice").hasClass('active') && $(".audioDevice ").hasClass('active')
        && deviceMgr.desktop.cachedAudioTracks && deviceMgr.desktop.cachedAudioTracks.length === 0)
    {
      deviceMgr.connect(audio.getAttribute('data-id'))
          .catch(function(err){
            console.log(err);
          }).then(function () {});
    }
  },
  changeResolution: function(id, res) {
    if (peers.hasOwnProperty(id)) {
      return peers[id].changeResolution(res);
    }

    switch(id) {
      case 'composite':
        return compositor.changeResolution(res);
        break;
      default:
        compositor.removeStream(id);
        return deviceMgr.changeResolution(id, res);
    }
  },
  removeStream: function(name) {
    let mediaEl = document.getElementById(name);
    if (name) {
      mediaEl.srcObject = null;
      mediaEl.parentNode.classList.remove('active');
    }
  },
  muteStream: function(id) {
    let vid = document.querySelector(`video[data-id="${id}"]`);
    let aud = document.querySelector(`aud[data-id="${id}"]`);

    if (vid) {
      vid.muted = true;
    }
    if (aud) {
      aud.muted = true;
    }
  },
  listDevices: function(devices) {
    for (let key in devices) {
      let item = utils.createElement('li', {
                   class: `${devices[key].deviceType} ${devices[key].deviceType}Device`,
                   data: {
                        id: key,
                        title: (devices[key].info.label.split(' '))[0]
                   }
                 });

      let deviceType = devices[key].deviceType;
      deviceType = deviceType === 'desktop' ? 'video' : deviceType;

      let placeholder = utils.createElement('span', {
                          class: 'placeholder'
                        });
      let shadow = utils.createElement('span', {
                     class: 'shadow'
                   });

      let mediaEl = utils.createElement(deviceType, {
                      data: {
                        id: key
                      }
                    });

      let mediaElContainer = utils.createElement('span', {
                               class: 'mediaContainer'
                             });

      let mediaFront = utils.createElement('span', {
                         class: 'front'
                       });

      let mediaBack = utils.createElement('ul', {
                         class: 'back'
                       });

      let removeItem = utils.createElement('li');
      let mediaRemoveBtn = utils.createElement('button', {
                             text: 'Deactivate'
                           });
      removeItem.appendChild(mediaRemoveBtn);

      let compositeItem = utils.createElement('li');
      let mediaCompositeBtn = utils.createElement('button', {
                             text: 'Add to composite'
                           });
      compositeItem.appendChild(mediaCompositeBtn);

      let cancelItem = utils.createElement('li', { text: 'Cancel' });

      mediaBack.appendChild(removeItem);
      mediaBack.appendChild(compositeItem);
      mediaBack.appendChild(cancelItem);

      mediaFront.appendChild(mediaEl);
      mediaElContainer.appendChild(mediaFront);
      mediaElContainer.appendChild(mediaBack);
      item.appendChild(mediaElContainer);
      item.appendChild(placeholder);
      item.appendChild(shadow);

      if (!this.mediaElements[devices[key].deviceType].getAttribute('data-id')) {
        this.mediaElements[devices[key].deviceType].setAttribute('data-id', deviceType === 'desktop' ? 'desktop' : key);
      }
    }
  },
  listAsSource: function(details) {
    let inputSources = document.querySelectorAll('.inputSource.labelWebcam ul');

    Object.keys(details)
      .filter(key => details[key].deviceType === 'video')
      .forEach(key => {
        if (!inputSources[0].querySelector(`li[data-id="${key}"]`)) {
          let item = utils.createElement('li', {
                       data: {
                         id: key
                       }
                     });
          let deviceBtn = utils.createElement('button', {
                            text: details[key].info.label,
                            value: key,
                            data: {
                              label: details[key].info.label
                            }
                          });

          if (details[key].source === 'peer') {
            let streamType = details[key].info.type;
            deviceBtn.setAttribute('data-peer', streamType);
          }

          item.appendChild(deviceBtn);

          inputSources.forEach(input => {
            let cloned = item.cloneNode(true);
            input.appendChild(cloned);
            cloned.addEventListener('click', this.switchStream.bind(this), false);
          });
        }
      })

    inputSources.forEach(input => {
      input.style.maxHeight = (([...input.querySelectorAll('li')].length + 1) * 2) + 'rem';
    });


    //on ajoute un event click sur le switch de l'audio et on créer la liste
    let inputSourcesAudio = document.querySelectorAll('.inputSourceAudio ul');
    Object.keys(details)
        .filter(key => details[key].deviceType === 'audio')
        .forEach(key => {
          if (!inputSourcesAudio[0].querySelector(`li[data-id="${key}"]`) && key != "") {
            let item = utils.createElement('li', {
              data: {
                id: key
              }
            });
            let deviceBtn = utils.createElement('button', {
              text: details[key].info.label,
              value: key,
              data: {
                label: details[key].info.label
              }
            });

            item.appendChild(deviceBtn);

            inputSourcesAudio.forEach(input => {
              let cloned = item.cloneNode(true);
              input.appendChild(cloned);
              cloned.addEventListener('click', this.switchStream.bind(this), false);
            });
          }
        })

    inputSourcesAudio.forEach(input => {
      input.style.maxHeight = (([...input.querySelectorAll('li')].length + 1) * 2) + 'rem';
    });
  },

  minimiseStreamView: function(e) {
    let title = e.target.checked ? 'Maximise' : 'Minimise';
    document.querySelector('label[for=minimiseStreams]').setAttribute('title', title);

    if (e.target.checked) {
      this.addDeviceToggle.setAttribute('title', ts.translate('ADD_DEVICE'));
    }
    else {
      this.addDeviceToggle.removeAttribute('title');
    }
  },
  handleKeys: function(e) {
    let keyCode = e.keyCode || e.which;

    switch (keyCode) {
      case 27:
        [...document.querySelectorAll('.toggleCover:checked')]
          .forEach(input => input.checked = false);
    }
  },
  chromeInstall: function() {
    if (chrome && chrome.app) {
      chrome.webstore.install(
        this.chromeStoreLink,
        function() {
          location.reload();
        },
        function(e) {
          console.log('error installing', e);
        }
      );
    }
  },
  startRecord: function() {

    if($(".desktopDevice").hasClass('active'))
    {
      if(!this.getTypeOfRec(deviceMgr.devices['desktop'].stream))
      {
        alert('Attention, l\'enregistrement d\'une fenêtre n\'est pas autorisé, merci de selectionner l\'intégralité de votre écran (cliquez sur "Écran" pour changer)');
        return false;
      }
    }

    let numStreams = Object.keys(deviceMgr.devices)
                       .map(key => deviceMgr.devices[key].stream)
                       .filter(stream => stream).length;
    if (numStreams == 0 || this.isRecording == true) {
      return;
    }

    this.isRecording = true;
    deviceMgr.record();
    compositor.record();
    for (let peer in peers) {
      try {
        peers[peer].record();
      } catch(e) {
      }
    }

    $('#startRecord').addClass('recording');

    setTimeout(function(){
      $('#pauseRecord').show();
    }, 4000);

    $('#startStopTitle').html("Arrêter");
    $('#startRecord').attr("title", "Arrêter l'enregistrement");
    $('#pauseTitle').show();

    var resDesktop = $('#resoDesktopChoose').val();
    var resWebCam = $('#resoWebCamChoose').val();

    if ($(".videoDevice").hasClass('active') && $(".desktopDevice").hasClass('active'))
      comms.emit('start', 'video-and-desktop', resDesktop, resWebCam);

    if($(".audioDevice").hasClass('active') && !$(".videoDevice").hasClass('active') && !$(".desktopDevice").hasClass('active'))
      comms.emit('start', 'onlyaudio');

    if($(".desktopDevice").hasClass('active') && $(".audioDevice").hasClass('active') && !$(".videoDevice").hasClass('active'))
      comms.emit('start', 'audio-and-desktop', resDesktop);

    if($(".desktopDevice").hasClass('active') && !$(".audioDevice").hasClass('active') && !$(".videoDevice").hasClass('active')) {
      comms.emit('start', 'onlydesktop', resDesktop);
      document.getElementById("alertMicNotEnable").style.display = "block";
    }

    if($(".audioDevice").hasClass('active') && $(".videoDevice").hasClass('active') && !$(".desktopDevice").hasClass('active'))
      comms.emit('start', 'onlyvideo', null, resWebCam);

    [...document.querySelectorAll('#recordingList a')].forEach(anchor => anchor.parentNode.removeChild(anchor));

    document.querySelector('#listWebCamAvailable').style.display = 'none';

  },
  pauseRecord: function() {
    if (!this.isRecording || this.timeEl.textContent < '00:00:04.000') {
      return;
    }

    deviceMgr.pauseRecording();
    compositor.pauseRecording();
    for (let peer in peers) {
      peers[peer].pauseRecording();
    }
    this.isPaused = !this.isPaused;
  },
  stopRecord: function() {
    if (!this.isRecording || this.timeEl.textContent < '00:00:03.000') {
      return;
    }

    this.isRecording = false;
    this.isPaused = false;
    deviceMgr.stopRecording();
    compositor.stopRecording();
    for (let peer in peers) {
      peers[peer].stopRecording();
    }

    $('#pauseRecord').hide();
    $('#recordingTime').hide()
    $('#startRecord').removeClass('recording');
    $(".statutLoading").show();
    $('#pauseTitle').hide();
    $('#startStopTitle').hide();


    //on check si on a select l'upload ou qu'on est dans moodle
    // if(document.getElementById('uploadMedia').checked || !$('#dropdownlistserie').is(':visible')) {
      $('#uploadProgress').show();
      if(document.getElementById('uploadMedia').checked)
        this.addLoader(document.getElementById('uploadProgress'), 'Transfert en cours...', {fontSize: '1.5rem'});
      else
        this.addLoader(document.getElementById('uploadProgress'), 'Traitement en cours...', {fontSize: '1.5rem'});
    // }

    document.getElementById('toggleSaveCreationModal').checked = true;
    rafLoop.unsubscribe(this.recTimeToken);
    this.recTimeToken = null;
    this.recTime = [];

    setTimeout(function () {
      if ($(".videoDevice").hasClass('active') && $(".desktopDevice").hasClass('active'))
        comms.emit('stop', 'video-and-desktop');

      if($(".audioDevice").hasClass('active') && !$(".videoDevice").hasClass('active') && !$(".desktopDevice").hasClass('active'))
        comms.emit('stop', 'onlyaudio');

      if($(".desktopDevice").hasClass('active') && $(".audioDevice").hasClass('active') && !$(".videoDevice").hasClass('active'))
        comms.emit('stop', 'audio-and-desktop');

      if($(".desktopDevice").hasClass('active') && !$(".audioDevice").hasClass('active') && !$(".videoDevice").hasClass('active'))
        comms.emit('stop', 'onlydesktop');

      if($(".audioDevice").hasClass('active') && $(".videoDevice").hasClass('active') && !$(".desktopDevice").hasClass('active'))
        comms.emit('stop', 'onlyvideo');
    }, 5000);
  },
  logRecordingTime: function(timestamp) {
    if (this.logNextTick) {
      this.recTime.push(timestamp);
      this.logNextTick = false;
    }

    if (this.isPaused) {
      return;
    }

    let timeslices = this.recTime.reduce((collect, current, i) => collect += current * (i % 2 ? -1 : 1), 0);
    let duration = timestamp - timeslices;
    // let timeArr = [duration / 3600000 >> 0, (duration / 60000 >> 0) % 60, ((duration / 1000.0) % 60).toFixed(3)]
    //                 .map((unit, i) => (unit < 10 ? '0' : '') + unit);
    let timeArr = [duration / 3600000 >> 0, (duration / 60000 >> 0) % 60, ((duration / 1000.0) % 60).toFixed(0)]
                    .map((unit, i) => (unit < 10 ? '0' : '') + unit);
    this.timeEl.textContent = timeArr.join(':');
  },
  listRecording: function() {
      if ($(".videoDevice").hasClass('active') && !$(".desktopDevice").hasClass('active'))
          $('#screenPreview').hide();
      else if ((!$(".videoDevice").hasClass('active') && $(".desktopDevice").hasClass('active')) ||
          (!$(".videoDevice").hasClass('active') && !$(".desktopDevice").hasClass('active') && $(".audioDevice ").hasClass('active')))
        $('#videoPreview').hide();
  },
  setMediaLink: function(details) {
    let anchor = document.querySelector(`a[data-id="${details.id}"]`);
    if (anchor) {
      anchor.href = details.url;
      if (details.media.type.indexOf('video') > -1) {
        anchor.setAttribute('data-type', 'video');
        anchor.download = anchor.getAttribute('data-flavor') + ' video - ' + this.title + '.webm';

        if (anchor.querySelector('video')) {
          anchor.removeChild(anchor.querySelector('video'));
        }

        let vid = document.createElement('video');
        vid.src = details.url;
        vid.muted = true;
        vid.addEventListener('mouseover', e => vid.play(), false);
        vid.addEventListener('mouseout', e => vid.pause(), false);
        vid.addEventListener('ended', e => vid.currentTime = 0, false);

        if($(".audioDevice").hasClass('active') && !$(".videoDevice").hasClass('active') && !$(".desktopDevice").hasClass('active'))
          vid.classList.add('onlyAudio');

        anchor.appendChild(vid);
        anchor.insertAdjacentHTML('beforeend', '<i class="fas fa-download fa-2x downloadVideo" title="Télécharger"></i>');
      }
      else {
        anchor.download = anchor.getAttribute('data-flavor') + ' audio - ' + this.title + '.webm';
        anchor.setAttribute('data-type', 'audio');
      }
    }
  },
  setTitle: function(e) {
    this.title = e.target.value || 'Enregistrement';
    [...document.querySelectorAll('#recordingList a')].forEach(anchor => {
      anchor.download = anchor.getAttribute('data-flavor') + ' ' + anchor.getAttribute('data-type') + ' - ' + this.title + '.webm';
    });
  },
  setPresenter: function(e) {
    this.presenter = e.target.value;
  },
  setLocation: function(e) {
    this.location = e.target.value;
  },
  saveMedia: function() {
    $('#uploadProgress').html('');
    $('#uploadProgress').show();
    this.addLoader(document.getElementById('uploadProgress'), 'Création en cours...', {fontSize: '1.5rem'});
    comms.emit('zipfiles', false);
  },
  saveMediaFusion: function() {
    $('#uploadProgress').html('');
    $('#uploadProgress').show();
    this.addLoader(document.getElementById('uploadProgress'), 'Création en cours...', {fontSize: '1.5rem'});
    comms.emit('zipfiles', true);
  },
  setDetails: function() {
    let keyupEvent = new Event('keyup');
    this.titleEl.dispatchEvent(keyupEvent)
    this.presenterEl.dispatchEvent(keyupEvent)
    this.locationEl.dispatchEvent(keyupEvent)
  },
  uploadMedia: function() {
      var infos = {};
      infos['titleUpload'] = document.getElementById('titleUpload').value;
      infos['presenterUpload'] = document.getElementById('presenterUpload').value;
      infos['locationUpload'] = document.getElementById('locationUpload').value;
      infos['descUpload'] = document.getElementById('descUpload').value;
      infos['mustBeUpload'] = document.getElementById('uploadMedia').checked;
      var select = document.getElementById('listseries');
      infos['idSerie'] = select.options[select.selectedIndex].value;
      comms.emit('infos', JSON.stringify(infos));
  },
  changeLanguage: function(e) {
    let btn = e.target.parentNode.querySelector('button');
    let lang = btn.value;
    ts.setLanguage(lang);
  },
  addLoader: function(container, text, opts) {
    let currentLoader = document.querySelector('#introCover .loader');
    let loader = currentLoader.cloneNode(true);
    loader.querySelector('.loaderText').textContent = text || "";
    let containerWidth = Math.min(container.clientWidth, container.clientHeight);
    let loaderWidth = Math.min(containerWidth * 0.8, currentLoader.clientWidth);
    loader.style.transform = `translate(-50%, -50%) scale(${loaderWidth/currentLoader.clientWidth})`;
    container.appendChild(loader);
    if (opts) {
      if (opts.fill) {
        loader.querySelector('circle:nth-of-type(2)').setAttribute('stroke', opts.fill);
      }
      if (opts.fontSize) {
        loader.querySelector('.loaderText').style.fontSize = opts.fontSize;
      }
    }
  },
  setLanguage: function(langObj) {
    document.documentElement.lang = langObj.language;
    document.body.classList.add('translating');
    if (!document.head.querySelector(`link[data-lang=${langObj.language}]`)) {
      let link = document.createElement('link');
      link.rel = "stylesheet";
      link.href = `css/translations_${langObj.short}.css`;
      document.head.appendChild(link);
    }

    let langDisplay = document.getElementById('chosenLanguage');
    langDisplay.querySelector('span').textContent = langObj.short.toUpperCase();
    langDisplay.querySelector('img').src = langObj.img;

    [...document.querySelectorAll('[data-translate]')].forEach(el => {
      let translate = el.getAttribute('data-translate');
      if (langObj.translation && langObj.translation[translate]) {
        el.textContent = langObj.translation[translate];
      }
    });

    [...document.querySelectorAll('[data-pseudotext]')].forEach(el => {
      let translate = el.getAttribute('data-pseudotext');
      if (langObj.translation && langObj.translation[translate]) {
        el.setAttribute('data-title', langObj.translation[translate]);
      }
    });

    [...document.querySelectorAll('[data-translatetitle]')].forEach(el => {
      let translate = el.getAttribute('data-translatetitle');
      if (langObj.translation && langObj.translation[translate]) {
        el.title = langObj.translation[translate];
      }
    });

    document.body.classList.remove('translating');
  },
  cacheApp: function() {
    navigator.serviceWorker.register('/sw.js')
      .catch(err => console.log('failed to register sw', err));
  }


};

const app = new App();

ts.on('translations.languages', languages => {
  let langList = document.querySelector('#language ul');
  langList.innerHTML = '';
  languages.forEach(lang => {
    let item = document.createElement('li');
    let btn = utils.createElement('button', {
                type: 'button',
                value: lang.short,
                text: lang.language
              });
    let img = utils.createElement('img', {
                prop: {
                  alt: lang.language,
                  src: lang.img
                },
                data: {
                  attribution: "Icon made by Freepik from www.flaticon.com"
                }
              });

    item.appendChild(btn);
    item.appendChild(img);
    item.addEventListener('click', app.changeLanguage.bind(app), true);
    langList.appendChild(item);
  });
});

ts.on('translations.set', langObj => app.setLanguage(langObj));

deviceMgr.once('enumerated', {
    fn: devices => {
      app.listDevices(devices);
      app.listAsSource(devices);
    }
});

deviceMgr.once('hasNotAlreadyAllowShare', {
    fn: () => {
      document.getElementById('infoNotAlreadyAllowShare').style.display = 'block';
      $('.bigButton').hide();
    }
});

[deviceMgr, compositor].forEach(recorder => {
  recorder.on('record.prepare', () => {
    app.listRecording();
  });
  recorder.on('record.complete', details => {
    app.setMediaLink(details);
  });
});

[deviceMgr, compositor].forEach(stream => {
  stream.on('stream.mute', id => {
    app.muteStream(id);
  });
  stream.on('stream', streamObj => {
    app.displayStream(streamObj.stream, streamObj.id);
    if (app.isRecording) {
      stream.record(streamObj.id);
    }

    if (streamObj.id === 'composite') {
      return;
    }

    if (streamObj.stream.getVideoTracks().length > 0) {
      compositor.addStream(streamObj);
    }
    else if (streamObj.stream.getVideoTracks().length > 0) {
      compositor.addAudioTrack(streamObj.stream.getAudioTracks()[0]);
    }
  });
});

compositor.on('subscribe.raf', function() {
  let args = Array.prototype.slice.call(arguments, 0, 2);
  rafLoop.subscribe({
    fn: args[0],
    scope: compositor
  }, args[1]);
});

compositor.on('unsubscribe.raf', token => {
  rafLoop.unsubscribe(token);
});

compositor.on('stream.remove', () => {
  app.removeStream('composite');
});

if (window.chrome && chrome.app) {
  if (!navigator.mediaDevices || !('getDisplayMedia' in navigator.mediaDevices)) {
    //on active l'alert navigateur pas compatible
    $("#alertBrowserVersion").show();
  }
}

if ('serviceWorker' in navigator && 'caches' in window) {
  app.cacheApp();
}
