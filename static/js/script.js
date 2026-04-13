$("#nextBtn").on('click', function (e) {
    if(document.getElementById('uploadMedia').checked && (!$('#titleUpload').val() || !$('#presenterUpload').val()  || !$('#listseries').val())){
        e.preventDefault();
        $('#alert').removeClass('hiddenCheck');
        setTimeout(function(){$('#alert').addClass('hiddenCheck'); }, 5000);
    }
    else {
        $(this).closest('section').css("transform", `translateX(-100%)`);
    }
});

$(".backToInfo").on('click', function () {
    $("#nextBtn").closest('section').css("transform", ``);
});

$("#alertBrowser > .btn-close.btn-close-sm, #alertBrowserVersion > .btn-close.btn-close-sm, #alertNoWebcam > .btn-close, #alertWrongReso > .btn-close, " +
    "#alertLowDebit > .btn-close, #alertMicNotEnable > .btn-close, #alertTypeDesktopShare > .btn-close, " +
    "#alertNoOnlyAudio  > .btn-close").on('click', function () {
    $(this).parent().slideUp("slow");
});

$( document ).ready(function() {

    managedRequieredField();
    $('#debitValue').val('');

    const cookieDebitInfo = document.cookie.match(new RegExp('debitValue' + '=([^;]+)'));
    let cookieValueDebit = !!cookieDebitInfo ? cookieDebitInfo[1] : 'null';

    if(document.cookie.indexOf('debitValue=') != -1 && cookieValueDebit != 'null') {
        $('body').removeClass('loading');
        $('.debitCircle').remove();

        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${'debitValue'}=`);
        if (parts.length === 2) {
            let debit = parts.pop().split(';').shift();
            setInformationsRelatedToDebitSpeed(debit, true);
        }
    }
    else {
       $('#introCover .debitCircle').show();
    }

    $('#introCover .loader').show();

    buildSourceCards();
    /**
     * Réception debit depuis l'iframe checkSpeedNtwk
     * @param event
     */
    function receiveMessage(event){

        if(document.getElementById("debitBar") !== null) {
            document.getElementById("debitBar").className = 'c100 p100 big center';
            document.getElementById("debitPercent").innerHTML = "100%";
        }

        setTimeout(function () {
            $('body').removeClass('loading');
            $('.debitCircle').remove();
            document.cookie = "debitValue="+Number(event.data);
            setInformationsRelatedToDebitSpeed(Number(event.data))

        }, 200)
    }
    window.addEventListener("message", receiveMessage, false);


    function setInformationsRelatedToDebitSpeed(debit, estimation = false){

        if(estimation)
            comms.emit('debitValue', '~'+debit);
        else
            comms.emit('debitValue', debit);

        if(debit <= 1) {
            if(debit <= 0.5) {
                $('#resoWebCamChoose').val('nhd');
                $('.videoDevice').removeClass('quartretiers').addClass('seizeneuvieme');
            }
            $('#resoDesktopChoose').val('vga');
        }

        if(debit < 3)
        {
            $('#listResoDesktop li.hd').attr("title", "Résolution non conseillée pour votre débit");
            $('#listResoDesktop li.hd').css("background-color", "rgb(127, 26, 26)");
            $('#listResoDesktop li.hdplus').css("background-color", "rgb(127, 26, 26)");
            $('#listResoDesktop li.hdplus').attr("title", "Résolution non conseillée pour votre débit");
            $('#listResoDesktop li.fullhd').css("background-color", "rgb(127, 26, 26)");
            $('#listResoDesktop li.fullhd').attr("title", "Résolution non conseillée pour votre débit");

            $('#listResoWebCam li.hd').css("background-color", "red");
            $('#listResoWebCam li.hd').attr("title", "Résolution non conseillée pour votre débit");
            $('#listResoWebCam li.fullhd').css("background-color", "rgb(127, 26, 26)");
            $('#listResoWebCam li.fullhd').attr("title", "Résolution non conseillée pour votre débit");

            $(document).on('click', '#listResoDesktop li.hd, #listResoDesktop li.hdplus, #listResoWebCam li.fullhd', function() {
                document.getElementById("alertWrongReso").style.display = "block";
            });
            $(document).on('click', '#listResoDesktop li.qhd, #listResoDesktop li.vga, #listResoDesktop li.svga', function() {
                document.getElementById("alertWrongReso").style.display = "none";
            });

            document.getElementById("alertLowDebit").style.display = "block";
        }
        else if(debit < 4 && debit >= 3)
        {
            $('#resoDesktopChoose').val('hd');
            $('#listResoDesktop li.hdplus').css("background-color", "rgb(127, 26, 26)");
            $('#listResoDesktop li.hdplus').attr("title", "Résolution non conseillée pour votre débit");
            $('#listResoDesktop li.fullhd').css("background-color", "rgb(127, 26, 26)");
            $('#listResoDesktop li.fullhd').attr("title", "Résolution non conseillée pour votre débit");

            $('#listResoWebCam li.fullhd').css("background-color", "rgb(127, 26, 26)");
            $('#listResoWebCam li.fullhd').attr("title", "Résolution non conseillée pour votre débit");

            $(document).on('click', '#listResoDesktop li.hdplus, #listResoWebCam li.fullhd', function() {
                document.getElementById("alertWrongReso").style.display = "block";
            });
            $(document).on('click', '#listResoDesktop li.hd, #listResoDesktop li.qhd, #listResoDesktop li.vga, #listResoDesktop li.svga', function() {
                document.getElementById("alertWrongReso").style.display = "none";
            });
        }
        else if(debit < 5 &&  debit >= 4)
        {
            $('#resoDesktopChoose').val('hd');
            $('#listResoDesktop li.fullhd').css("background-color", "rgb(127, 26, 26)");
            $('#listResoDesktop li.fullhd').attr("title", "Résolution non conseillée pour votre débit");

            $('#listResoWebCam li.fullhd').css("background-color", "rgb(127, 26, 26)");
            $('#listResoWebCam li.fullhd').attr("title", "Résolution non conseillée pour votre débit");

            $(document).on('click', '#listResoWebCam li.fullhd', function() {
                document.getElementById("alertWrongReso").style.display = "block";
            });
            $(document).on('click', '#listResoDesktop li.hdplus, #listResoDesktop li.hd, #listResoDesktop li.qhd, #listResoDesktop li.vga, #listResoDesktop li.svga', function() {
                document.getElementById("alertWrongReso").style.display = "none";
            });
        }
        else if(debit > 5)
            $('#resoDesktopChoose').val('hd');

        $('#debitValue').val(debit);
    }

    $(document).on('click','label.mediadevice.action.audioDevice.active',function(event){
        if($(event.target).attr('class') === 'streamControls' ||
            $(event.target).attr('class') == 'mediadevice action audioDevice active' ||
            $(event.target).attr('id') == 'audioCanvas') {
            event.preventDefault();
            }
    });

    $(document).on('click', '#pauseRecord', function(){

        if (document.getElementById('recordingTime').textContent < '00:00:04.000')
            return;

        if(document.getElementById("pauseRecord").className == "mdi mdi-pause mdi-48px") {
            document.getElementById("pauseRecord").title = "Reprendre l'enregistrement";
            document.getElementById("pauseRecord").className = "mdi mdi-play mdi-48px";
        } else {
            document.getElementById("pauseRecord").className = "mdi mdi-pause mdi-48px";
            document.getElementById("pauseRecord").title = "Mettre l'enregistrement en pause";
        }
        
    });

    //disable live OBS
    // if(getParameterByName('courseid') != null) {
    //     $('label.bigButton:first-child')[0].style.marginLeft = "20%";
    //     $('#live').css('display', 'inline-block');
    // }
    // else
    const bigButtons = document.querySelectorAll('.bigButton');

    if (bigButtons[1]) {
        bigButtons[1].style.display = 'none';
    }

    $('main').css("visibility", "visible");


    if(getParameterByName('ent') != null || getParameterByName('courseid') != null ) {
        $('#help').attr('style', 'color:#178F96; position: absolute;left:-3rem !important;z-index:10;');
        $('#helpList').attr('style', 'right:0 !important');
        $('#UCAStudio').hide();
        $('.logout').hide();
    	document.getElementsByTagName("header")[0].style.backgroundColor= "#FFFFFF";
	    document.getElementsByTagName("header")[0].style.boxShadow = "none";
    	document.getElementsByTagName("header")[0].style.position = "absolute";
        $('#language').show();
    }else {
	    $('#help').css('color', 'white');
        $('#language').show();
    }

    if(getParameterByName('courseid') == null && getParameterByName('ent') == null)
        $('.logout').show();
    let isFirefox;
    if (navigator.userAgentData) {
        isFirefox = navigator.userAgentData.brands.some(brand => brand.brand === 'Firefox');
    }
    else {
        isFirefox = navigator.userAgent.includes('Firefox');
    }

    const isChrome = !!window.chrome && (navigator.userAgent.indexOf("Chrome") > -1);

    if(!isFirefox && !isChrome)
        $("#alertBrowser").show();
    else if(!('mediaDevices' in navigator) || !('getUserMedia' in navigator.mediaDevices) || (window.MediaRecorder == undefined)){
        $("#alertBrowser").show();
    }
    else{
        let infoBrowser = getVersionOfBrowser();
        //on check la version
        if(isFirefox) {
            if (infoBrowser[1] !== undefined){
                if(infoBrowser[1] < 60)
                    $("#alertBrowserVersion").show();

                if(infoBrowser[1] == 87) //bug audio seul FF87
                {
                    $("#alertNoOnlyAudio").show();
                    $(".audioDevice").click(function (){
                        if(!$(".desktopDevice").hasClass('active'))
                            return false;
                    })
                }
            }
        }

        if(isChrome)
            if(infoBrowser[1] !== undefined && infoBrowser[1] < 65)
                $("#alertBrowserVersion").show();
    }

    $('#uploadMedia').on('change',  function () {
        managedRequieredField();
    });

    $(document).keydown(function (e) {
        const charCode = e.charCode || e.keyCode || e.which;

        if (charCode == 9) {  //tab pressed
            e.preventDefault();
        }

        //escape
        if(charCode == 27 && document.getElementById('toggleSaveCreationModal').checked) {
            e.preventDefault();
            $('#newRecord').trigger('click');
        }

    });

    $('#newRecord').on('click',  function (e) {
        e.preventDefault(); // stops its action
        location.reload();
    });

    function closeAll() {
        // Audio mic
        audioSwitchBtn?.classList.remove('open');
        audioCard?.classList.remove('dropdown-open');

        // Listes dropdown
        $('#listWebCamAvailable, #listResoWebCam, #listResoDesktop').removeClass('open');
        document.querySelectorAll('.switch-caret.open').forEach(c => c.classList.remove('open'));

        // Boutons card
        ['btnDesktopReso', 'btnDesktopSource', 'btnWebcamReso', 'btnWebcamSource'].forEach(id => {
            const btn = document.getElementById(id);
            btn?.classList.remove('open');
            btn?.closest('.mediadevice')?.classList.remove('dropdown-open');
        });
    }

    const audioSwitchBtn = document.getElementById('audioSwitchBtn');
    const audioCard = document.querySelector('#streamsSection .mediadevice.audioDevice');

    audioSwitchBtn?.addEventListener('click', function(e) {
        e.stopPropagation();
        const isOpen = this.classList.toggle('open');
        audioCard?.classList.toggle('dropdown-open', isOpen);
    });

    document.querySelector('#listMicAvailable')?.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAll();
    });

    // ── Dropdowns génériques ─────────────────────────────────────────────────────
    [
        { trigger: '.webcam-header-info label.device-switch-btn',            list: '#listWebCamAvailable' },
        { trigger: '.resolution-header-info label.device-switch-btn',        list: '#listResoWebCam'      },
        { trigger: '.resolution-desktop-header-info label.device-switch-btn',list: '#listResoDesktop'     },
    ].forEach(({ trigger, list }) => {
        document.querySelectorAll(trigger).forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                $(list).toggleClass('open');
                btn.querySelector('.switch-caret')?.classList.toggle('open');
            });
        });
    });

    ['btnDesktopReso', 'btnDesktopSource', 'btnWebcamReso', 'btnWebcamSource'].forEach(id => {
        const btn = document.getElementById(id);
        btn?.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = btn.classList.toggle('open');
            btn.closest('.mediadevice')?.classList.toggle('dropdown-open', isOpen);
        });
    });

    document.addEventListener('click', closeAll);

    $(document).on('click', 'body *', function(event) {
        if (!$(event.target).closest('.streamControls').length) {
            if ($("#listWebCamAvailable").outerHeight(true) > 1)  $('.labelWebcam').trigger('click');
            if ($("#listMicAvailable").outerHeight(true) > 1)     $('.labelAudio').trigger('click');
            if ($("#listResoWebCam").outerHeight(true) > 1)       $('.labelVideoResolution').trigger('click');
            if ($("#listResoDesktop").outerHeight(true) > 1)      $('.labelDesktopResolution').trigger('click');
        }
    });

    videojs('#screenPreview', {
        plugins: {
            vjsdownload:{
                beforeElement: 'playbackRateMenuButton',
                textControl: 'Download video',
                name: 'downloadButton'
            }
        }
    } , function() {
        this.on('downloadvideo', function(){
            console.log('downloadvideo triggered');
        });
    });

  videojs('#videoPreview', {
        plugins: {
            vjsdownload:{
                beforeElement: 'playbackRateMenuButton',
                textControl: 'Download video',
                name: 'downloadButton'
            }
        }
    } , function() {
        this.on('downloadvideo', function(){
            console.log('downloadvideo triggered');
        });
    });


    const players = [videojs('#videoPreview'), videojs('#screenPreview')];

    players.forEach(function(player) {
        player.on('play', function() {
            players.forEach(function(pl) {
                if (pl !== player) {
                    pl.play();
                }
            })
        });
        player.on('pause', function() {
            players.forEach(function(pl) {
                if (pl !== player) {
                    pl.pause();
                }
            })
        });
    });

    $('.streamControls ul li button').on('click',  function () {
        if($(this).hasClass('non-clickable'))
            return false;
        else {
            $(this).addClass('non-clickable');
            setTimeout(function () {
                $('.streamControls ul li button').removeClass('non-clickable');
            }, 2000);
        }
    });
});

function managedRequieredField() {
    const isChecked = document.getElementById('uploadMedia').checked;
    $('#listseries').prop('disabled', !isChecked);
    document.querySelectorAll('.required-field-target').forEach(field => {
        field.classList.toggle('required-field', isChecked);
    });
}

// Quand l'audio s'active, déplace le canvas dans la carte
$('#audiostream').on('change', function () {
    if (this.checked) {
        setTimeout(() => {
            const label = $('.labelMicSelect').text().trim();
            if (label) $('#micDevLabel').text(label);
        }, 800);
    }
});

// Lie le canvas existant au progress-bar de niveau
// audioanalyser.js expose l'analyser via window ou un event — on lit la hauteur du canvas
function syncAudioLevel() {
    const canvas = document.querySelector('.audioDevice canvas');
    const bar = document.getElementById('aLevel');

    if (canvas && bar) {
        try {
            const ctx = canvas.getContext('2d');
            const w = canvas.width || 1;
            const h = canvas.height || 1;
            const data = ctx.getImageData(0, 0, w, h).data;
            let bright = 0;
            for (let i = 0; i < data.length; i += 4) {
                bright += (data[i] + data[i+1] + data[i+2]) / 3;
            }
            const level = Math.min(100, (bright / (data.length / 4)) * 0.8);
            bar.style.width = Math.max(3, level) + '%';
        } catch(e) {}
    }
    requestAnimationFrame(syncAudioLevel);
}

syncAudioLevel();

/**
 * @param name
 * @param url
 * @returns {string|null}
 */
function getParameterByName(name, url) {
    if (!url) url = window.location.href;
    name = name.replace(/[\[\]]/g, '\\$&');
    const regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
        results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, ' '));
}

/**
 * @returns {string|*[]}
 */
function getVersionOfBrowser()
{
    let ua = navigator.userAgent, tem,
        M = ua.match(/(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*(\d+)/i) || [];
    if(/trident/i.test(M[1])){
        tem=  /\brv[ :]+(\d+)/g.exec(ua) || [];
        return 'IE '+(tem[1] || '');
    }
    if(M[1]=== 'Chrome'){
        tem= ua.match(/\b(OPR|Edge)\/(\d+)/);
        if(tem!= null) return tem.slice(1).join(' ').replace('OPR', 'Opera');
    }
    M= M[2]? [M[1], M[2]]: [navigator.appName, navigator.appVersion, '-?'];

    return M;
    // if((tem= ua.match(/version\/(\d+)/i))!= null) M.splice(1, 1, tem[1]);
    // return M.join(' ');
}

/**
 *
 */
function saveDevicesAndReload(devices) {
    const deviceInfo = devices.map(device => ({
        kind: device.kind,
        label: device.label,
        deviceId: device.deviceId,
    }));
    localStorage.setItem('devices', JSON.stringify(deviceInfo));
    location.reload();
}

function shareAndReload() {
    navigator.mediaDevices.getUserMedia({audio: true, video: true})
        .then(() => navigator.mediaDevices.enumerateDevices())
        .then(saveDevicesAndReload)
        .catch(() => {
            navigator.mediaDevices.getUserMedia({audio: true})
                .then(() => navigator.mediaDevices.enumerateDevices())
                .then(saveDevicesAndReload)
                .catch(() => {
                    localStorage.setItem('devices', JSON.stringify([]));
                    location.reload();
                });
        });
}

function toggleDeviceCard(el, streamId) {
    el.classList.toggle('selected');
    // Synchronise avec le streamToggle correspondant dans #createTmp
    const streamInput = document.getElementById(streamId);
    if (streamInput) {
        // Si la card est sélectionnée, on active le stream; sinon on le désactive
        streamInput.checked = el.classList.contains('selected');
    }
}

function buildSourceCards() {
    const grid = document.getElementById('deviceGrid');
    if (!grid) return;

    // Affiche un loader le temps de la détection
    grid.innerHTML = '<div class="device-detecting">Détection des périphériques…</div>';

    navigator.mediaDevices.enumerateDevices()
        .then(devices => {
            const hasVideo  = devices.some(d => d.kind === 'videoinput');
            const hasAudio  = devices.some(d => d.kind === 'audioinput');
            const hasScreen = !!navigator.mediaDevices.getDisplayMedia;

            // Pour les labels, on enrichit avec le localStorage si disponible
            const stored = JSON.parse(localStorage.getItem('devices') || '[]');
            const getLabel = (kind) => {
                const live  = devices.find(d => d.kind === kind && d.label);
                const cache = stored.find(d => d.kind === kind && d.label);
                return (live || cache)?.label || null;
            };

            const sources = [
                {
                    id: 'dcScreen',
                    streamId: 'desktopstream',
                    icon: 'mdi-monitor mdi-48px',
                    name: 'Écran',
                    desc: 'Capture du bureau',
                    available: hasScreen,
                    label: null,
                },
                {
                    id: 'dcMic',
                    streamId: 'audiostream',
                    icon: 'mdi-microphone mdi-48px',
                    name: 'Microphone',
                    desc: getLabel('audioinput') || 'Audio ambiant',
                    available: hasAudio,
                },
                {
                    id: 'dcCam',
                    streamId: 'webcamstream',
                    icon: 'mdi-video mdi-48px',
                    name: 'Webcam',
                    desc: getLabel('videoinput') || 'Caméra frontale',
                    available: hasVideo,
                },
            ];

            grid.innerHTML = '';

            sources.forEach(src => {
                const card = document.createElement('div');
                card.id = src.id;

                if (src.available) {
                    card.onclick = () => toggleDeviceCard(card, src.streamId);
                } else {
                    card.title = 'Périphérique non détecté';
                }

                const col = document.createElement('div');
                col.className = 'col-12 col-md-4';
                card.className = 'device-card h-100' + (src.available ? ' selected' : ' unavailable');

                card.innerHTML = `
                    <div class="device-check"><i class="mdi mdi-check"></i></div>
                    <div class="device-icon fs-2 mb-3"><i class="mdi ${src.icon}"></i></div>
                    <div class="fw-bold small mb-1">${src.name}</div>
                    <div class="text-muted" style="font-size:.75rem">${src.desc}</div>
                    ${!src.available ? '<div class="text-muted fst-italic mt-2" style="font-size:.68rem"><i class="mdi mdi-exclamation mdi-48px me-1"></i>Non disponible</div>' : ''}
                `;

                col.appendChild(card);
                grid.appendChild(col);
            });
        })
        .catch(() => {
            grid.innerHTML = '<div class="alert alert-warngin">Impossible d\'accéder aux informations des périphériques.</div>';
        });
}