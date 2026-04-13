const AudioAnalyser = function AudioAnalyserImpl(isNoCanvas) {
  this.audioSource = null;
  this.canvas = null;
  this.canvasCtx = null;
  this.WIDTH = 0;
  this.height = 0;
  this.noCanvas = isNoCanvas;

  const AudioContext = window.AudioContext          // Default
      || window.webkitAudioContext
      || false;

  this.audioCtx = new AudioContext();
  this.analyser = this.audioCtx.createAnalyser();
  this.bufferLength = 0;
  this.dataArray = null;

  const _subscriptions = {};
  Object.defineProperty(this, 'subscriptions', {
    get: function () {
      return _subscriptions;
    },
  });

  const _delegations = {};
  Object.defineProperty(this, 'delegations', {
    get: function () {
      return _delegations
    }
  });

  this.rafTokens = {
    performCalc: null
  };
};

AudioAnalyser.prototype = {
  constructor: AudioAnalyser,
  resume: function() {
    this.audioCtx.resume();
  },
  attachCanvas: function(canvas) {
    canvas = canvas[0] || canvas;

    if (this.canvas !== canvas) {
      this.canvas = canvas;
      this.setCanvasDimensions(canvas);
    }
  },
  setCanvasDimensions: function(canvas) {
    if (!canvas) return;
    // On utilise les attributs width/height posés dans le HTML
    // CSS s'occupe de l'affichage, JS s'occupe du buffer de dessin
    this.WIDTH  = this.canvas.width;   // = 140
    this.HEIGHT = this.canvas.height;  // = 80
    this.canvasCtx = this.canvas.getContext('2d');
  },
  attachLevelCanvas: function(canvas) {
    if (!canvas) return;
    canvas = canvas[0] || canvas;
    this.levelCanvas = canvas;
    // Idem : lit directement les attributs HTML (width=140 height=6)
    this.levelCtx = canvas.getContext('2d');
  },
  analyse: function(track) {
    this.audioSource = this.audioCtx.createMediaStreamSource(track);
    this.audioSource.connect(this.analyser);
    this.bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(this.bufferLength);

    this.delegate('subscribe.raf', this.performCalc, token => {
      this.rafTokens.performCalc = token;
    });
  },
  performCalc: function() {
    try {
      // Fréquentiel au lieu de time-domain → donne les barres
      this.analyser.getByteFrequencyData(this.dataArray);

      // Magnitude RMS pour les dépendances externes (level meter, etc.)
      let magnitude = Math.sqrt(
          this.dataArray.reduce((s, v) => s + Math.pow(v / 255, 2), 0) / this.dataArray.length
      );
      this.notifyDependencies('magnitude', magnitude);

      if (!this.noCanvas) {
        this.drawFn(this.dataArray); // on passe le tableau complet
      }
    } catch(e) {
      console.log(e);
    }
  },
  draw: function(dataArray) {
    if (!this.canvasCtx || !this.WIDTH || !this.HEIGHT) return;
    const W = this.WIDTH, H = this.HEIGHT;
    const ctx = this.canvasCtx;
    ctx.clearRect(0, 0, W, H);

    const barCount = 26;       // doit être pair
    const gap = 2;
    const barW = Math.max(2, Math.floor((W - gap * (barCount - 1)) / barCount));
    const halfCount = Math.floor(barCount / 2);
    const step = Math.floor(dataArray.length / barCount);

    // Centre du canvas
    const centerX = Math.floor(W / 2);

    for (let i = 0; i < halfCount; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) sum += dataArray[i * step + j];
      const ratio = (sum / step) / 255;
      const barH = Math.max(3, ratio * H);
      const y = H - barH;
      const color = ratio < 0.45 ? '#22c55e' : ratio < 0.72 ? '#f97316' : '#ef4444';

      // Barre droite
      const xRight = centerX + i * (barW + gap);
      // Barre gauche (miroir)
      const xLeft  = centerX - (i + 1) * (barW + gap);

      [xRight, xLeft].forEach(x => {
        ctx.fillStyle = color;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, barW, barH, 2);
        else ctx.rect(x, y, barW, barH);
        ctx.fill();
      });
    }

    // Barre horizontale de niveau
    if (this.levelCtx && this.levelCanvas) {
      const lW = this.levelCanvas.width;
      const lH = this.levelCanvas.height;
      const avg = dataArray.reduce((s, v) => s + v, 0) / dataArray.length;
      const ratio = avg / 255;
      const fillW = ratio * lW;

      this.levelCtx.clearRect(0, 0, lW, lH);

      this.levelCtx.fillStyle = '#e2e8f0';
      this.levelCtx.beginPath();
      if (this.levelCtx.roundRect) {
        this.levelCtx.roundRect(0, 0, lW, lH, lH / 2);
      } else {
        this.levelCtx.rect(0, 0, lW, lH);
      }
      this.levelCtx.fill();

      if (fillW > 0) {
        this.levelCtx.fillStyle = ratio < 0.45 ? '#22c55e' : ratio < 0.72 ? '#f97316' : '#ef4444';
        this.levelCtx.beginPath();
        if (this.levelCtx.roundRect) {
          this.levelCtx.roundRect(0, 0, fillW, lH, lH / 2);
        } else {
          this.levelCtx.rect(0, 0, fillW, lH);
        }
        this.levelCtx.fill();
      }
    }
  },
  drawFn: function(magnitude) {
    return this.draw(magnitude);
  },
  on: function(ev, fn) {
    if (!this.subscriptions.hasOwnProperty(ev)) {
      this.subscriptions[ev] = {};
    }

    const currentSubscriptions = Object.keys(this.subscriptions);

    let randString = null;
    do {
      randString = (1 + Math.random()).toString(36).substring(2, 10);
    } while (currentSubscriptions.indexOf(randString) > -1);

    this.subscriptions[ev][randString] = fn;
  },
  notifyDependencies: function(ev, val) {
    if (this.subscriptions.hasOwnProperty(ev)) {
      for (const key in this.subscriptions[ev]) {
        this.subscriptions[ev][key](val);
      }
    }
  },
  delegate: function() {
    let args = Array.prototype.slice.call(arguments);
    if (this.delegations.hasOwnProperty(args[0])) {
      this.delegations[args[0]].forEach(fn => {
        fn.apply(this, args.slice(1));
      });
    }
  },
  ondelegation: function(type, fn) {
    if (!this.delegations.hasOwnProperty(type)) {
      this.delegations[type] = [];
    }

    this.delegations[type].push(fn);
  }
}
