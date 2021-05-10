
class Recorder extends EventEmitter {

  constructor(stream, typeDevice) {
    super();

    let _vidCodecs = [
                    'video/webm;codecs="vp9,opus"',
                    'video/webm;codecs="vp9.0,opus"',
                    'video/webm;codecs="avc1"',
                    'video/x-matroska;codecs="avc1"',
                    'video/webm'
                  ].filter(codec => MediaRecorder.isTypeSupported(codec));

    let _audioCodecs = [
                         'audio/ogg;codecs=opus',
                         'audio/webm;codecs=opus'
                       ].filter(codec => MediaRecorder.isTypeSupported(codec));

    let _recData = [];

    let chosenCodec = stream.getVideoTracks().length ? _vidCodecs[0] : _audioCodecs[0];

    // this.recorder = new MediaRecorder(stream, {mimeType: chosenCodec});
    var opts = {mimeType: chosenCodec, videoBitsPerSecond : getRate(typeDevice)};
    this.recorder = new MediaRecorder(stream, opts);
    this.recorder.ondataavailable = function(e) {
          var isAudioDesktopRec = false;
          if($(".desktopDevice").hasClass('active') && $(".audioDevice").hasClass('active') && !$(".videoDevice").hasClass('active'))
            isAudioDesktopRec = true;

          if(isAudioDesktopRec && typeDevice != 'audio')
            comms.emit("binarystream"+typeDevice,e.data);
          else if(!isAudioDesktopRec){
            if(typeDevice == 'audio')
              typeDevice = 'desktop';

            comms.emit("binarystream"+typeDevice,e.data);
          }
    };

    this.recorder.onerror = e => {
      //Erreur A GERER !!! Pas de on derrière
      this.emit('record.error', e);
    };

    this.recorder.onstart = e => {
      //A GERER !!! Pas de on derrière
      this.emit('record.start', true);
    };

    this.result = null;

    this.recorder.onstop = e => {
      self.recorder = null;
    };

    Object.defineProperty(this, 'recData', {
      get: function() {
        return _recData;
      }
    });

    this.isRecording = false;
    this.isPaused = false;
  }

  start(delay) {
    delay = delay || 0;
    if (!this.isRecording) {
      setTimeout(() => {
        this.recorder.start(1000);
        // this.recorder.start();
      }, delay);
      this.isRecording = true;
    }
    else if (this.isPaused) {
      this.resume();
    }
  }

  pause() {
    if (!this.isPaused) {
      this.recorder.pause();
    }
    else {
      this.resume();
    }
    this.isPaused = !this.isPaused;
  }

  resume() {
    if (this.recorder.state === 'paused') {
      this.recorder.resume();
    }
  }

  stop() {
    if (this.recorder.state === 'recording')
      this.recorder.stop();
    this.isRecording = false;
  }
}

/**
 * @param type
 * @returns {string}
 */
function getRate(type)
{
  var rateValue;

  if(type == 'webcam') {
    var reso = $("#resoWebCamChoose").val();
    switch (reso) {
      case 'nhd':
      case 'vga':
        rateValue = '1000000';
        break;
      case 'qhd':
      case 'svga':
        rateValue = '1500000';
        break;
      case 'hd':
        rateValue = '2400000';
        break;
      case 'xga':  //à tester
        rateValue = '2060000';
        break;
      case 'hdplus': //à tester
        rateValue = '3500000';
        break;
      case 'fullhd':
        rateValue = '4000000';
      default:
        rateValue = '';
    }
  }
  else {
    var reso = $("#resoDesktopChoose").val();
    switch (reso) {
      case 'vga':
        rateValue = '1000000';
        break;
      case 'qhd':
      case 'svga':
        rateValue = '1500000';
        break;
      case 'hd':
        rateValue = '2400000';
        break;
      case 'hdplus':
        rateValue = '3500000';
        break;
      case 'fullhd':
        rateValue = '4000000';
        break;
      default:
        rateValue = '';
    }
  }

  return rateValue;
}