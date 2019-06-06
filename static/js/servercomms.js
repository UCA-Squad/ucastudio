/* ************
 * Websockets *
 * ***********/

function Communications() {
  this.socket = null;

  if (io) {
    this.socket = io();
  }

  this.socket.on('errorffmpeg',function(e){
    alert("Un problème est survenu sur cette page web, elle va donc être rechargée");
    location.reload();
  });

  this.socket.on('fatal',function(e){
    alert("Un problème est survenu sur cette page web, elle va donc être rechargée");
    location.reload();
  });

  this.socket.on('endupload',function(e){
    $('#uploadProgress').hide();
    if(e == 1)
        alert('Votre média a bien été tranféré');
    else
        alert('Votre média a bien été traité');
  });

  this.socket.on('endzip',function(e, socketissued){
    $('#uploadProgress').hide();
    var file = new File([e],
        socketissued+".zip", {type: "application/zip, application/octet-stream, application/x-zip-compressed, multipart/x-zip"});
    saveAs(file);
  });

  this.socket.on('listseries',function(listSeries, uid){
    var html = '<option value="" disabled selected>Sélectionner votre bibliothèque</option>';

    if (typeof listSeries !== 'undefined' && listSeries.length > 0) {
      $.each(listSeries, function (index, item) {
        if(item.title == uid)
          html += "<option value='" + item.identifier + "'>Mon dossier</option>";
        else
          html += "<option value='" + item.identifier + "'>" + item.title + "</option>";
      });
    }
    else
      html += "<option value='myfolder'>Mon dossier</option>";

      $('#listseries').append(html);
  });

  this.socket.on('displayName',function(displayName){
    if(displayName != null)
      $('#presenterUpload').val(displayName);
  });

  this.socket.on('insidemoodle',function(idSerieToselectTmp) {
    idSerieToselectTmp = idSerieToselectTmp.split( '&' );
    idSerieToselect = idSerieToselectTmp[0].split( '=' );
    if(idSerieToselect[1]){
      $('#listseries option[value="'+idSerieToselect[1]+'"]').attr('selected','selected');
      $('#dropdownlistserie').hide();
      $('#uploadAtEnd').hide();
      $('.nextBtn').css('bottom', '10px');
    }
  });

  this.socket.on('idRecord',function(uid, idRecord) {

    if ($(".videoDevice").hasClass('active') && $(".desktopDevice").hasClass('active')) {
        videojs("#videoPreview").src([
          {type: "video/webm", src: "./records/" + uid + '/' + idRecord + '/' + idRecord + ".webm"}
        ]);

        videojs("#screenPreview").src([
          {type: "video/webm", src: "./records/" + uid + '/' + idRecord + '/' + idRecord + "screen.webm"}
        ]);
    }
    else if($(".videoDevice").hasClass('active')) {
        videojs("#videoPreview").src([
          { type: "video/webm", src: "./records/"+ uid + '/' + idRecord + '/' +idRecord+".webm" }
        ]);
    }
    else{
      videojs("#screenPreview").src([
        {type: "video/webm", src: "./records/" + uid + '/' + idRecord + '/' + idRecord + "screen.webm"}
      ]);
    }
  });

  this.transportOrder = ['SOCKET'];
  this.transportOrder.some(newTransport => {
    if (this[newTransport.toLowerCase()]) {
      return this.switchTransport(newTransport);
    }
  });
}

Communications.prototype = {

  constructor: Communications,
  emitSOCKET: function() {
    if (!this.socket) {
      throw new Error('socket not initialized (io not found)');
    }

    let args = Array.prototype.slice.call(arguments);
    this.socket.emit.apply(this.socket, args);



  },
  switchTransport: function(transport) {
    if (['SOCKET'].indexOf(transport) > -1) {
      this.emit = this.__proto__[`emit${transport}`];
      return true;
    }
  },
  emit: function() {
    console.log('emit progress');
  }
}

const comms = new Communications();

