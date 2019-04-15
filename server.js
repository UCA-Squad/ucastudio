const config = require('./config.json');
var express = require('express');
var app = express();
var spawn = require('child_process').spawn;
var session = require('express-session');
var CASAuthentication = require('connect-cas-uca');

var fs = require('fs');
const server = require('https').createServer({
	key: fs.readFileSync(config.path_cert_key),
	cert: fs.readFileSync(config.path_cert)

},app);
var io = require('socket.io')(server);

spawn('ffmpeg',['-h']).on('error',function(m){
	console.error("FFMpeg not found in system cli; please install ffmpeg properly or make a softlink to ./!");
	process.exit(-1);
});

var cas = new CASAuthentication({
	cas_url         : config.cas_url,
	service_url     : config.service_url,
});

var session = require("express-session")({
	secret: config.session_secret_key,
	resave: true,
	saveUninitialized: true
});

var sharedsession = require("express-socket.io-session");
app.use(session);
io.use(sharedsession(session));

app.get( '/', cas.bounce );

app.use(express.static(__dirname + "/static/"));


io.on('connection', function(socket){

	var options = { method: 'GET',
		url: config.opencast_series_url,
		rejectUnauthorized: false,
		headers:
		{
			'cache-control': 'no-cache',
			Authorization: 'Basic '+config.opencast_authentication
		}
	};
	var request = require("request");
	request(options, function (error, response, listSeries) {
		if (error) throw new Error(error);
		 socket.emit('listseries', listSeries);
	});

	var ffmpeg_process, feedStream=false;
	socket._vcodec='libvpx';//from firefox default encoder
	socket.on('config_vcodec',function(m){
		if(typeof m != 'string'){
			socket.emit('fatal','input codec setup error.');
			return;
		}
		if(!/^[0-9a-z]{2,}$/.test(m)){
			socket.emit('fatal','input codec contains illegal character?.');
			return;
		}//for safety
		socket._vcodec=m;
	});

	socket.on('start',function(m){

		if(ffmpeg_process || feedStream){
			socket.emit('fatal','stream already started.');
			return;
		}
		var ops=[
			'-re', '-i','-',
			'-c:v', 'copy', '-preset', 'veryfast',
			'-b:a', '128k', '-strict', '-2',
			'./records/'+socket.handshake.issued+'.webm'
		];

		ffmpeg_process=spawn('ffmpeg', ops);
		feedStream=function(data){
			ffmpeg_process.stdin.write(data);
			//write exception cannot be caught here.
		}

		ffmpeg_process.stderr.on('data',function(d){
			socket.emit('ffmpeg_stderr',''+d);
		});
		ffmpeg_process.on('error',function(e){
			console.log('child process error'+e);
			socket.emit('fatal','ffmpeg error!'+e);
			feedStream=false;
			socket.disconnect();
		});
		ffmpeg_process.on('exit',function(e){
			console.log('child process exit'+e);
			socket.emit('fatal','ffmpeg exit!'+e);
			uploadFile(socket);
		});
	});

	socket.on('binarystream',function(m){
		if(!feedStream){
			socket.emit('fatal','ffmpep not processing.');
			ffmpeg_process.stdin.end();
			return;
		}
		feedStream(m);
	});
	socket.on('infos',function(m){
		socket.handshake.session.usermediadatas = m;
	});
	socket.on('stop',function(m){
		feedStream=false;
		if(ffmpeg_process) {
			try {
				ffmpeg_process.stdin.end();
			} catch (e) {console.warn('End ffmpeg process attempt failed...');}
		}
	});
	socket.on('disconnect', function () {
		feedStream=false;
		if(ffmpeg_process)
			try{
				ffmpeg_process.kill('SIGINT');
			} catch(e){console.warn('killing ffmpeg process attempt failed...');}
	});
	socket.on('error',function(e){
		console.log('socket.io error:'+e);
	});
});

io.on('error',function(e){
	console.log('socket.io error:'+e);
});

server.listen(8888, function(){
  console.log('https and websocket listening on *:8888');
});


process.on('uncaughtException', function(err) {
    // handle the error safely
    console.log(err)
    // Note: after client disconnect, the subprocess will cause an Error EPIPE, which can only be caught this way.
})


function uploadFile(socket)
{
	if(socket.handshake.session.usermediadatas) {
		//on test si c'est pas undefined  ?
		var usermediainfosToUpload = JSON.parse(socket.handshake.session.usermediadatas);

		var request = require("request");
		var d = new Date();
		var startDate = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDay();
		var startTime = d.getHours() + ':' + d.getMinutes();

		var idFileUpload = socket.handshake.issued;
		var uid = socket.handshake.session.cas_user;
		var desc = 'N/R';


		var acl = '[\n' +
			'  {\n' +
			'    "allow": true,\n' +
			'    "role": "ROLE_EXTERNAL_APPLICATION",\n' +
			'    "action": "read"\n' +
			'  },\n' +
			'  {\n' +
			'    "allow": true,\n' +
			'    "role": "ROLE_EXTERNAL_APPLICATION",\n' +
			'    "action": "write"\n' +
			'  },\n' +
			'  {\n' +
			'    "allow": true,\n' +
			'    "role": "ROLE_USER_LDAP_' + uid + '",\n' +
			'    "action": "read"\n' +
			'  },\n' +
			'  {\n' +
			'    "allow": true,\n' +
			'    "role": "ROLE_USER_LDAP_' + uid + '",\n' +
			'    "action": "write"\n' +
			'  }\n' +
			']';

		var metadata = '[\n' +
			'  {\n' +
			'    "flavor": "dublincore/episode",\n' +
			'    "fields": [\n' +
			'      {\n' +
			'        "id": "title",\n' +
			'        "value": "' + usermediainfosToUpload.titleUpload + '"\n' +
			'      },\n' +
			'      {\n' +
			'        "id": "description",\n' +
			'        "value": "' + desc + '"\n' +
			'      },\n' +
			'      {\n' +
			'        "id": "isPartOf",\n' +
			'        "value": "' + usermediainfosToUpload.idSerie + '"\n' +
			'      },\n' +
			'      {\n' +
			'        "id": "startDate",\n' +
			'        "value": "' + startDate + '"\n' +
			'      },\n' +
			'      {\n' +
			'        "id": "startTime",\n' +
			'        "value": "' + startTime + '"\n' +
			'      },\n' +
			'      {\n' +
			'        "id": "location",\n' +
			'        "value": "' + usermediainfosToUpload.locationUpload + '"\n' +
			'      }\n' +
			'    ]\n' +
			'  }\n' +
			']';

		var processing = '{\n' +
			'  "workflow": "' + config.workflow + '"\n' +
			'}';

		var options = {
			method: "POST",
			url: config.opencast_events_url,
			ca: fs.readFileSync(config.opencast_cert),
			headers: {
				'cache-control': 'no-cache',
				Authorization: 'Basic ' + config.opencast_authentication,
				'content-type': 'multipart/form-data;'
			},
			formData:
				{
					presenter:
						{
							value: fs.createReadStream("records/" + idFileUpload + ".webm"),
							options:
								{
									filename: 'metadata/' + idFileUpload + '.webm'
								}
						},
					processing,
					metadata,
					acl
				}
		};
		request(options, function (error, response, body) {
			if (error) {
				socket.disconnect();
				throw new Error(error);
			} else {
				// var obj = JSON.parse(body);
				// console.log(body);
				socket.emit('endupload');

			}
		});
	}
}