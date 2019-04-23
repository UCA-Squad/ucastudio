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

$( document ).ready(function() {
    $(document).keydown(function (e) {
        var charCode = e.charCode || e.keyCode || e.which;
        if (charCode == 9) {  //tab pressed
            e.preventDefault(); // stops its action
        }
    });

    $('.modalFooter .button-amber').on('click',  function (e) {
        e.preventDefault(); // stops its action
        window.location = window.location.href;
    });

});