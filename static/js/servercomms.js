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
  });

  this.socket.on('listseries',function(listSeries){
      var html = '<option value="" disabled selected>Sélectionner votre bibliothèque</option>';
      $.each(JSON.parse(listSeries), function (index, item) {
          html += "<option value='"+ item.identifier +"'>" + item.title + "</option>";
      });
      $('#listseries').append(html);
  });

  this.socket.on('displayName',function(displayName){
    if(displayName != null)
      $('#presenterUpload').val(displayName);
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

