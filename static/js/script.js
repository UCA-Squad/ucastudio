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

$( document ).ready(function() {
    if(getParameterByName('courseid') == null) {
        $('#live').hide();
        $('.bigButton:first-child')[0].style.marginLeft = "38%";
    }
    var isFirefox = typeof InstallTrigger !== 'undefined';
    var isChrome = !!window.chrome && (!!window.chrome.webstore || !!window.chrome.runtime);
    if(!isFirefox && !isChrome)
        $("#alertBrowser").show();
    else if(!('mediaDevices' in navigator) || !('getUserMedia' in navigator.mediaDevices)){
        $("#alertBrowser").show();
    }

    if(!$('#uploadMedia').prop("checked"))
        $("#listseries").prop('disabled', 'disabled');

    $('#uploadMedia').on('change',  function (e) {
       if(!$(this).prop("checked"))
           $("#listseries").prop('disabled', 'disabled');
       else
           $("#listseries").prop('disabled', '');
    });

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
        document.location.reload(true);
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

    function getParameterByName(name, url) {
        if (!url) url = window.location.href;
        name = name.replace(/[\[\]]/g, '\\$&');
        var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
            results = regex.exec(url);
        if (!results) return null;
        if (!results[2]) return '';
        return decodeURIComponent(results[2].replace(/\+/g, ' '));
    }
});


