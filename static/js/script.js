$(".nextBtn").on('click', function (e) {
    if(!$('#titleUpload').val() || !$('#presenterUpload').val() || !$('#listseries').val()){
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
    $(document).keydown(function (e) {
        var charCode = e.charCode || e.keyCode || e.which;

        if (charCode == 9) {  //tab pressed
            e.preventDefault();
        }

        //escape
        if(charCode == 27 && document.getElementById('toggleSaveCreationModal').checked) {
            e.preventDefault();
            $('.modalFooter .button-amber').trigger('click');
        }

    });

    $('.modalFooter .button-amber').on('click',  function (e) {
        e.preventDefault(); // stops its action
        window.location = window.location.href;
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
});


