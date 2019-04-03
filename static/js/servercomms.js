/* ************
 * Websockets *
 * ***********/

function Communications() {
  this.socket = null;
  this.bt = null;
  this.nfc = null;

  if (io) {
    this.socket = io();

    this.socket.on('message',function(m){
      console.log('recv server message',m);

    });

    this.socket.emit('config_rtmpDestination','rtmp://openstream.dsi.uca.fr/app/live');
  }

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

