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

  this.deviceList = document.querySelector('#streams .list');
  this.audioCanvas = document.querySelector('#audio ~ canvas');

  this.simpleUserView = document.getElementById('simpleUserView');
  this.advancedUserView = document.getElementById('advancedUserView');

  this.recordButton = document.getElementById('startRecord');
  this.pauseButton = document.getElementById('pauseRecord');
  this.stopButton = document.getElementById('stopRecord');

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
          document.body.classList.add('paused');
        }
        else {
          document.body.classList.remove('paused');
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
  this.nextBtn = document.getElementById('nextBtn');

  this.listingPeer = [];

  this.attachEvents();
  setTimeout(() => {
    document.body.classList.remove('loading');
  }, 500);
}

App.prototype = {
  constructor: App,
  attachEvents: function() {
    deviceMgr.on('enumerated', () => {
      for (let deviceType in deviceMgr) {
        let deviceId = (deviceMgr[deviceType].info || {}).deviceId || 
                         Object.keys(deviceMgr[deviceType])
                           .filter(device => device !== 'default')
                           .reduce((id, current) => id = id || current, null);

        this.mediaToggles[deviceType].value = deviceId;
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

    document.getElementById('installExtension').addEventListener('click', this.chromeInstall.bind(this), false);
    document.body.addEventListener('keyup', this.handleKeys.bind(this), false);

    this.recordButton.addEventListener('click', this.startRecord.bind(this), false);
    this.pauseButton.addEventListener('click', this.pauseRecord.bind(this), false);
    this.stopButton.addEventListener('click', this.stopRecord.bind(this), false);

    this.titleEl.addEventListener('keyup', this.setTitle.bind(this), false);
    this.presenterEl.addEventListener('keyup', this.setPresenter.bind(this), false);
    this.locationEl.addEventListener('keyup', this.setLocation.bind(this), false);

    this.saveRecordings.addEventListener('click', this.saveMedia.bind(this), false);
    this.nextBtn.addEventListener('click', this.uploadMedia.bind(this), false);

    document.getElementById('minimiseStreams').addEventListener('change', this.minimiseStreamView.bind(this), false);

    [...document.querySelectorAll('.streamControls label:nth-of-type(1) button')].forEach(btn => {
      btn.addEventListener('click', this.chooseResolution.bind(this), false);
    });

  },
  toggleStream: function(e) {

    if (!e.target.checked) {
      return;
    }

    if (e.target.value === 'desktop' && this.needsExtension) {
      document.getElementById('toggleExtensionModal').checked = true;
    }

    deviceMgr.connect(e.target.value)
      .catch(err => console.log(err));
  },
  displayStream: function(stream, value) {
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
    if (stream.getAudioTracks().length > 0 &&
      (!audioContainer.classList.contains('active') || stream.getVideoTracks().length === 0)) {
      audioContainer.classList.add('active');
      audAnalyser.analyse(stream);

      let audioDeviceId = this.mediaToggles.audio.value;
      let audioListItem = document.querySelector(`#streams li.audioDevice[data-id="${audioDeviceId}"]`);

      if (audioListItem) {
        audioListItem.classList.add('active');
      }
    }

    if (stream.getVideoTracks().length > 0 && mediaContainer && mediaContainer.parentNode.id === 'videoView') {
      let resolution = stream.getVideoTracks()[0].getSettings().height + 'p';
      let videoControls = mediaContainer.querySelector('.streamControls');
      videoControls.querySelector('label:first-of-type span').textContent = resolution;

      let resolutionOptions = [...videoControls.querySelectorAll('label:first-of-type button')]
      let doListRes = true;
      resolutionOptions.some(button => {
        if (button.value === resolution) {
          doListRes = false;
          return;
        }
      });

      if (doListRes) {
        resolutionOptions.some((button, i) => {
          if (parseInt(resolution) < parseInt(button.value) ||
              i === resolutionOptions.length - 1) {
            let resButton = document.createElement('button');
            button.type = 'button';
            button.textContent = button.value = resolution;

            if (parseInt(resolution) < parseInt(button.value)) {
              button.parentNode.insertBefore(resButton, button);
            }
            else {
              button.parentNode.appendChild(resButton);
            }

            resButton.addEventListener('click', this.chooseResolution.bind(this), false);
            return;
          }
        });
      }
    }
  },
  switchStream: function(e) {
    let id = e.target.value;
    let parent = e.target.parentNode;
    while (parent && !parent.querySelector('video')) {
      parent = parent.parentNode;
    }

    if (!parent) {
      return console.log('no vid elements');
    }
    let vid = parent.querySelector('video');
    if (vid.getAttribute('data-id') === id) {
      return;
    }

    let stream = this.getStreamSource(id, !!e.target.getAttribute('data-peer'));
    if (!stream) {
      return console.log('no such stream source for switching');
    }

    vid.srcObject = stream;
    vid.setAttribute('data-id', id);
    parent.querySelector('label[for^=inputSource] > span').textContent = e.target.getAttribute('data-label');
  },
  getStreamSource: function(id, isPeer) {
    if (isPeer) {
      if (peers[id] && peers[id].stream) {
        return peers[id].stream;
      }
    }
    else if (deviceMgr.video[id]) {
      return deviceMgr.video[id].stream;
    }
    return;
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
    change.then(streamObj => this.displayStream(streamObj.stream, streamId === 'desktop' ? 'desktop' : 'video', streamId));
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

      let optionsList = utils.createElement('span', {
                          class: 'options'
                        });

      let addCompositeBtn = utils.createElement('button', {
                              text: 'Add to composite',
                              data: {
                                action: 'composite'
                              }
                            });

      mediaFront.appendChild(mediaEl);
      mediaElContainer.appendChild(mediaFront);
      mediaElContainer.appendChild(mediaBack);
      item.appendChild(mediaElContainer);
      item.appendChild(placeholder);
      item.appendChild(shadow);

      this.deviceList.appendChild(item);

      if (!this.mediaElements[devices[key].deviceType].getAttribute('data-id')) {
        this.mediaElements[devices[key].deviceType].setAttribute('data-id', deviceType === 'desktop' ? 'desktop' : key);
      }
    }
  },
  listPeer: function(id) {
    if (this.listingPeer.indexOf(id) === -1) {
      this.listingPeer.push(id);
      let peerItem = utils.createElement('li', {
                       class: 'peerDevice connecting',
                        data: {
                             id: id
                        }
                      });

      this.deviceList.appendChild(peerItem);
      peerItem.addEventListener('click', this.togglePeerStream.bind(this), false);
      setTimeout(() => {
        this.addLoader(peerItem, 'Connecting', {fill: '#eee', fontSize: '1.75rem'});
      }, 500);
    }
  },
  listAsSource: function(details) {
    let inputSources = document.querySelectorAll('.inputSource ul');

    Object.keys(details)
      .filter(key => details[key].deviceType == 'video')
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

          if (details[key].source == 'peer') {
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
  },
  togglePeerStream: function(e) {
    console.log(e.target.getAttribute('data-id'));
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
  startRecord: function(e) {

    if (this.isRecording) {

      this.isPaused = false;
      deviceMgr.record();
      compositor.record();
      for (let peer in peers) {
        try {
          peers[peer].record();
        } catch (e) {
        }
      }
      return;
    }

    let numStreams = Object.keys(deviceMgr.devices)
                       .map(key => deviceMgr.devices[key].stream)
                       .filter(stream => stream).length;
    if (numStreams === 0) {
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

    if ($(".videoDevice").hasClass('active') && $(".desktopDevice").hasClass('active'))
      comms.emit('start', 'video-and-desktop');

    if($(".audioDevice").hasClass('active') && !$(".videoDevice").hasClass('active') && !$(".desktopDevice").hasClass('active'))
      comms.emit('start', 'onlyaudio');

    if($(".desktopDevice").hasClass('active') && !$(".videoDevice").hasClass('active'))
      comms.emit('start', 'onlydesktop');

    if($(".audioDevice").hasClass('active') && $(".videoDevice").hasClass('active') && !$(".desktopDevice").hasClass('active'))
      comms.emit('start', 'onlyvideo');

    [...document.querySelectorAll('#recordingList a')].forEach(anchor => anchor.parentNode.removeChild(anchor));
  },
  pauseRecord: function(e) {
    deviceMgr.pauseRecording();
    compositor.pauseRecording();
    for (let peer in peers) {
      peers[peer].pauseRecording();
    }
    this.isPaused = !this.isPaused;
  },
  stopRecord: function(e) {
    if (!this.isRecording) {
      return;
    }

    this.isRecording = false;
    this.isPaused = false;
    deviceMgr.stopRecording();
    compositor.stopRecording();
    for (let peer in peers) {
      peers[peer].stopRecording();
    }

    if ($(".videoDevice").hasClass('active') && $(".desktopDevice").hasClass('active'))
      comms.emit('stop', 'video-and-desktop');

    if($(".audioDevice").hasClass('active') && !$(".videoDevice").hasClass('active') && !$(".desktopDevice").hasClass('active'))
      comms.emit('stop', 'onlyaudio');

    //on check quel stream on share
    if($(".desktopDevice").hasClass('active') && !$(".videoDevice").hasClass('active'))
      comms.emit('stop', 'onlydesktop');

    if($(".audioDevice").hasClass('active') && $(".videoDevice").hasClass('active') && !$(".desktopDevice").hasClass('active'))
      comms.emit('stop', 'onlyvideo');

    if(document.getElementById('uploadMedia').checked) {
      $('#uploadProgress').show();
      this.addLoader(document.getElementById('uploadProgress'), 'Transfert en cours...', {fontSize: '1.5rem'});
    }

    document.getElementById('toggleSaveCreationModal').checked = true;
    rafLoop.unsubscribe(this.recTimeToken);
    this.recTimeToken = null;
    this.recTime = [];
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
    let timeArr = [duration / 3600000 >> 0, (duration / 60000 >> 0) % 60, ((duration / 1000.0) % 60).toFixed(3)]
                    .map((unit, i) => (unit < 10 ? '0' : '') + unit);
    this.timeEl.textContent = timeArr.join(':');
  },
  listRecording: function(details) {
    let anchor = document.createElement('a');
    anchor.target = '_blank';
    anchor.textContent = details.label;
    anchor.setAttribute('data-id', details.id);
    anchor.setAttribute('data-flavor', details.flavor);
    document.getElementById('recordingList').appendChild(anchor);
    if (details.flavor === 'remote' && peers[details.id].capabilities.MediaRecorder) {
      let requestRaw = document.createElement('button');
      requestRaw.value = details.id;
      requestRaw.className = 'requestRaw';
      requestRaw.addEventListener('click', this.requestRawFootage.bind(this), true);
      requestRaw.textContent = ts.translate('RAW_FOOTAGE');
      let currentLoader = document.querySelector('#introCover .loader');
      let loader = currentLoader.cloneNode(true);
      loader.querySelector('circle').setAttributeNS(null, 'stroke-width', '12');
      loader.querySelector('.loaderText').textContent = 'Incoming Transfer';

      anchor.appendChild(requestRaw);
      anchor.appendChild(loader);
    }
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

        anchor.appendChild(vid);
      }
      else {
        anchor.download = anchor.getAttribute('data-flavor') + ' audio - ' + this.title + '.webm';
        anchor.setAttribute('data-type', 'audio');
      }
    }
  },
  requestRawFootage: function(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    let peerId = e.target.value;
    if (!peers.hasOwnProperty(peerId)) {
      return;
    }

    peers[peerId].progress = e.target.parentNode.querySelector('.loader circle');
    peers[peerId].dataChannel.send('request.filetransfer');
    e.target.parentNode.classList.add('transfer');
  },
  setTitle: function(e) {
    this.title = e.target.value || 'Recording';
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
  saveMedia: function(e) {
    [...document.querySelectorAll('#saveCreation a')].forEach(anchor => anchor.click());
    document.getElementById('toggleSaveCreationModal').checked = false;
  },
  uploadMedia: function(e) {
    if(document.getElementById('uploadMedia').checked) {
      var infos = {};
      infos['titleUpload'] = document.getElementById('titleUpload').value;
      infos['presenterUpload'] = document.getElementById('presenterUpload').value;
      infos['locationUpload'] = document.getElementById('locationUpload').value;
      var select = document.getElementById('listseries');
      infos['idSerie'] = select.options[select.selectedIndex].value;
      comms.emit('infos', JSON.stringify(infos));
    }
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
    if (!document.head.querySelector(`link[data-lang=${langObj.language}`)) {
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
  addPeerStreamToComposite: function(e) {
    let parent = e.target;
    while (parent && !parent.getAttribute('data-id')) {
      parent = parent.parentNode;
    }

    if (!parent) {
      return console.log('no such item');
    }

    let peerId = parent.getAttribute('data-id');
    if (!peers[peerId]) {
      return console.log('no such peer');
    }
    if (!peers[peerId].stream) {
      return console.log('requested peer has no stream');
    }

    compositor.addStream({id: peerId, stream: peers[peerId].stream});
  },
  removePeer: function(peer) {
    [...document.querySelectorAll(`.streamControls [data-id="${peer}"], #streams [data-id="${peer}"]`)]
      .forEach(el => el.parentNode.removeChild(el));
    [...document.querySelectorAll(`video[data-id="${peer}"], audio[data-id="${peer}"]`)]
      .forEach(mediaEl => mediaEl.srcObject = null);
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

[deviceMgr, compositor].forEach(recorder => {
  recorder.on('record.prepare', details => {
    app.listRecording(details);
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
    let delay = setTimeout(() => {
      app.needsExtension = true;
    }, 1000);
    window.addEventListener('message', e => {
      if (e.data.type && e.data.type == 'SS_PING' && document.getElementById('appInstalled')) {
        clearTimeout(delay);
      }
    });
  }
}

if ('serviceWorker' in navigator && 'caches' in window) {
  app.cacheApp();
}
