/* ************
 * Websockets *
 * ***********/

function Communications() {
  this.socket = null;
  this.bt = null;
  this.nfc = null;

  if (io) {
    this.socket = io();
  }

  this.socket.on('endupload',function(){
    $('#uploadProgress').hide();
    alert('Votre média a bien été tranféré');
  });

  this.socket.on('listseries',function(listSeries){
      var html = '<option value="" disabled selected>Sélectionner votre bibliothèque</option>';
      $.each(listSeries, function (index, item) {
          html += "<option value='"+ item.identifier +"'>" + item.title + "</option>";
      });
      $('#listseries').append(html);
  });

  this.socket.on('displayName',function(displayName){
    if(displayName != null)
      $('#presenterUpload').val(displayName);
  });

  this.socket.on('insidemoodle',function(idSerieToselectTmp) {
    idSerieToselect = idSerieToselectTmp.split( '=' );
    if(idSerieToselect[1])
    {
      $('#listseries option[value="'+idSerieToselect[1]+'"]').attr('selected','selected');
      $('#dropdownlistserie').hide();
    }
  });

  this.socket.on('idRecord',function(idRecord) {

    // if ($(".videoDevice").hasClass('active') && $(".desktopDevice").hasClass('active')) {
    //   console.log('toto');
    //   $('#screenPreview').show();
    //   $('#videoPreview').show();
    // }
    // else
    //   $('#videoPreview').show();

    // document.getElementById("screenPreviewSrc").src = "records/"+idRecord+"screen.webm";
    // document.getElementById("videoPreviewSrc").src = "records/"+idRecord+".webm";

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

