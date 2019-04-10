$(".nextBtn").on('click', function (e) {
    if(!$('#titleUpload').val() ){
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
    $(document).on("keypress", function (event) {
        if (event.keyCode == 9) {   //tab pressed
            return false; // stops its action
        }
    });
});