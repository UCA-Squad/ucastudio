$(".nextBtn").on('click', function (e) {
    if(!$('#titleUpload').val() || !$('#presenterUpload').val() || (document.getElementById('uploadMedia').checked && !$('#listseries').val())){
        e.preventDefault();
        $('#alert').removeClass('hiddenCheck');
        setTimeout(function(){$('#alert').addClass('hiddenCheck'); }, 5000);
    }
    else {
        $(this).closest('section').css("transform", `translateX(-100%)`);
    }
});

$(".backToInfo").on('click', function () {
    $(".nextBtn").closest('section').css("transform", ``);
});

$("#alertNoWebcam > .close").on('click', function () {
    $(this).parent().slideUp("slow");
});


var actualprogress = 0;
var itv = 0;
function prog()
{
   if(actualprogress >= 100)
   {
       clearInterval(itv);
       return;
   }
   actualprogress += 6.25; 
   document.getElementById("debitBar").className = 'c100 p'+Math.round(actualprogress)+' big center'; 
   document.getElementById("debitPercent").innerHTML = Math.round(actualprogress) + "%";   
   if(actualprogress == 100) clearInterval(itv);
}
setInterval(prog, 500);

$( document ).ready(function() {

    $('#debitValue').val('');

    /**
     * Réception debit depuis l'iframe checkSpeedNtwk
     * @param event
     */
    function receiveMessage(event){

        $('body').removeClass('loading');
        $('.debitCircle').remove();
        comms.emit('debitValue', Number(event.data));

        if(Number(event.data) < 3)
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
        else if(Number(event.data) < 4 && Number(event.data) >= 3)
        {
            $('#resoDesktopChoose').val('hd');
            $('#listResoDesktop li.hdplus').css("background-color", "rgb(127, 26, 26)");
            $('#listResoDesktop li.hdplus').attr("title", "Résolution non conseillée pour votre débit");
            $('#listResoDesktop li.fullhd').css("background-color", "rgb(127, 26, 26)");
            $('#listResoDesktop li.fullhd').attr("title", "Résolution non conseillée pour votre débit");

            $('#listResoWebCam li.fullhd').css("background-color", "rgb(127, 26, 26)");
            $('#listResoWebCam li.fullhd').attr("title", "Résolution non conseillée pour votre débit");

            $(document).on('click', '#listResoDesktop li.hdplus, #listResoWebCam li.fullhd', function(event) {
                document.getElementById("alertWrongReso").style.display = "block";
            });
            $(document).on('click', '#listResoDesktop li.hd, #listResoDesktop li.qhd, #listResoDesktop li.vga, #listResoDesktop li.svga', function() {
                document.getElementById("alertWrongReso").style.display = "none";
            });
        }
        else if(Number(event.data) < 5 &&  Number(event.data) >= 4)
        {
            $('#resoDesktopChoose').val('hd');
            $('#listResoDesktop li.fullhd').css("background-color", "rgb(127, 26, 26)");
            $('#listResoDesktop li.fullhd').attr("title", "Résolution non conseillée pour votre débit");

            $('#listResoWebCam li.fullhd').css("background-color", "rgb(127, 26, 26)");
            $('#listResoWebCam li.fullhd').attr("title", "Résolution non conseillée pour votre débit");

            $(document).on('click', '#listResoWebCam li.fullhd', function(event) {
                document.getElementById("alertWrongReso").style.display = "block";
            });
            $(document).on('click', '#listResoDesktop li.hdplus, #listResoDesktop li.hd, #listResoDesktop li.qhd, #listResoDesktop li.vga, #listResoDesktop li.svga', function() {
                document.getElementById("alertWrongReso").style.display = "none";
            });
        }

        $('#debitValue').val(Number(event.data));
    }
    window.addEventListener("message", receiveMessage, false);
    

    $(document).on('click','label.mediadevice.action.audioDevice.active',function(event){
        if($(event.target).attr('class') == 'streamControls' || $(event.target).attr('class') == 'mediadevice action audioDevice active')
            event.preventDefault();
    });

    //Add by lylblaud
    $(document).on('click', '#pauseRecord', function(event){

        if (document.getElementById('recordingTime').textContent < '00:00:04.000')
            return;

        if(document.getElementById("pauseRecord").className == "fas fa-pause fa-2x") {
            document.getElementById("pauseRecord").title = "Reprendre l'enregistrement";
            document.getElementById("pauseRecord").className = "fas fa-play fa-2x";
        } else {
            document.getElementById("pauseRecord").className = "fas fa-pause fa-2x";
            document.getElementById("pauseRecord").title = "Mettre l'enregistrement en pause";
        }
        
    });


    if(getParameterByName('courseid') == null) {
        $('#live').hide();
        $('.bigButton:first-child')[0].style.marginLeft = "38%";
    }
    if(getParameterByName('ent') != null) {
        $('#help').css('color', '#178F96');
        $('#help').css('position', 'absolute');
        $('#help').css('left', '-3rem', '!important');
        $('#help').css('z-index', '10');
        $('#UCAStudio').hide();
        $('.logout').hide();
    	document.getElementsByTagName("header")[0].style.backgroundColor= "#FAF8F5";
	    document.getElementsByTagName("header")[0].style.boxShadow = "none";
    	document.getElementsByTagName("header")[0].style.position = "absolute";
    }else {
	    $('#help').css('color', 'white');
    }

    if(getParameterByName('courseid') == null && getParameterByName('ent') == null)
        $('.logout').show();

    var isFirefox = typeof InstallTrigger !== 'undefined';
    var isChrome = !!window.chrome && (!!window.chrome.webstore || !!window.chrome.runtime);
    if(!isFirefox && !isChrome)
        $("#alertBrowser").show();
    else if(!('mediaDevices' in navigator) || !('getUserMedia' in navigator.mediaDevices) || (window.MediaRecorder == undefined)){
        $("#alertBrowser").show();
    }
    else{
        let infoBrowser = getVersionOfBrowser();
        //on check la version
        if(isFirefox)
            if(infoBrowser[1] !== undefined && infoBrowser[1] < 60)
                $("#alertBrowserVersion").show();

        if(isChrome)
            if(infoBrowser[1] !== undefined && infoBrowser[1] < 65)
                $("#alertBrowserVersion").show();
    }

    if(!$('#uploadMedia').prop("checked"))
        $("#listseries").prop('disabled', 'disabled');

    $('#uploadMedia').on('change',  function (e) {
       if(!$(this).prop("checked"))
           $("#listseries").prop('disabled', 'disabled');
       else
           $("#listseries").prop('disabled', '');
    });

    if(isChrome) {
        document.getElementById("pauseRecord").style.top = "-13px";
    }
    $(document).keydown(function (e) {
        var charCode = e.charCode || e.keyCode || e.which;

        if (charCode == 9) {  //tab pressed
            e.preventDefault();
        }

        //escape
        if(charCode == 27 && document.getElementById('toggleSaveCreationModal').checked) {
            e.preventDefault();
            $('.modalFooter label.button.button-amber').trigger('click');
        }

    });

    $('.modalFooter label.button.button-amber').on('click',  function (e) {
        e.preventDefault(); // stops its action
        location.reload();
    });

    $(document).on('click','body *',function(event){
        if(!$(event.target).closest('.streamControls').length) {

            if ($("#listWebCamAvailable").outerHeight(true) > 1)
                $('.labelWebcam').trigger('click');

            if ($("#listMicAvailable").outerHeight(true) > 1)
                $('.labelAudio').trigger('click');

            if ($("#listResoWebCam").outerHeight(true) > 1)
                $('.labelVideoResolution').trigger('click');

            if ($("#listResoDesktop").outerHeight(true) > 1)
                $('.labelDesktopResolution').trigger('click');
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


    var players = [videojs('#videoPreview'), videojs('#screenPreview')];

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

    $('.streamControls ul li button').on('click',  function (e) {
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

/**
 * @param name
 * @param url
 * @returns {string|null}
 */
function getParameterByName(name, url) {
    if (!url) url = window.location.href;
    name = name.replace(/[\[\]]/g, '\\$&');
    var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
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
    var ua= navigator.userAgent, tem,
        M= ua.match(/(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*(\d+)/i) || [];
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

