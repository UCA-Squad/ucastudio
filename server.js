const config = require('./config.json');
var express = require('express');
var app = express();
var spawn = require('child_process').spawn;
var fluentFFMPEG = require('fluent-ffmpeg');
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
app.get( '/index.html', cas.bounce );

app.use(express.static(__dirname + "/static/"));


io.on('connection', function(socket){

	var ffmpeg_process, feedStream=false;
	var ffmpeg_process2, feedStream2=false;

	if(typeof socket.handshake.session.cas_user !== 'undefined' ) {

		var uid = socket.handshake.session.cas_user;
		var socketissued = socket.handshake.issued;

		try {
			//on check si l'user est co via cas, et on créer un folder si existe pas
			fs.existsSync('./static/records/' + uid) || fs.mkdirSync('./static/records/' + uid);
		} catch(err) {
			console.error(err)
		}

		socket.on('start', function (m) {

			fs.mkdirSync('./static/records/' + uid + '/'+socketissued+'/');

			if (ffmpeg_process || feedStream || ffmpeg_process2 || feedStream2) {
				socket.emit('fatal', 'stream already started.');
				return;
			}
			var ops = [
				'-i', '-',
				'-c:v', 'copy', '-preset', 'veryfast',
				'-b:a', '192k', '-strict', '-2',
				'./static/records/' + uid + '/' + socketissued + '/' + socketissued + '.webm'
			];

			if(m == 'video-and-desktop') {
				var ops2 = [
					'-i', '-',
					'-c:v', 'copy', '-preset', 'veryfast',
					'-an',
					'./static/records/' + uid + '/' + socketissued + '/' + socketissued + 'screen.webm'
				];
			}
			else
			{
				var ops2 = [
					'-i', '-',
					'-c:v', 'copy', '-preset', 'veryfast',
					'-b:a', '192k', '-strict', '-2',
					'./static/records/' + uid + '/' + socketissued + '/' + socketissued + 'screen.webm'
				];
			}

			if(m == 'video-and-desktop' || m == 'audio-and-desktop' || m == 'onlyaudio' || m == 'onlydesktop') {
				ffmpeg_process2 = spawn('ffmpeg', ops2);
				feedStream2 = function (data) {
					ffmpeg_process2.stdin.write(data);
					//write exception cannot be caught here.
				}
				ffmpeg_process2.stderr.on('data', function (d) {
					socket.emit('ffmpeg_stderr', '' + d);
				});
				ffmpeg_process2.on('error', function (e) {
					console.log('child process error' + e);
					socket.emit('fatal', 'ffmpeg error!' + e);
					feedStream = false;
					socket.disconnect();
				});
				ffmpeg_process2.on('exit', function (e) {
					console.log('child process desktop exit' + e);
					socket.emit('fatal', 'ffmpeg exit!' + e);
					if(m == 'onlyaudio' || m == 'onlydesktop' || m == 'audio-and-desktop') {
                        if(m == 'onlyaudio')
                            encodeAudioToMp4(socket)
					    else
                            uploadFile(socket, false, true);
                    }
				});
			}

			if(m == 'video-and-desktop' || m == 'onlyvideo') {
				ffmpeg_process = spawn('ffmpeg', ops);

				feedStream = function (data) {
					ffmpeg_process.stdin.write(data);
					//write exception cannot be caught here.
				}
				ffmpeg_process.stderr.on('data', function (d) {
					socket.emit('ffmpeg_stderr', '' + d);
				});
				ffmpeg_process.on('error', function (e) {
					console.log('child process error' + e);
					socket.emit('fatal', 'ffmpeg error!' + e);
					feedStream = false;
					socket.disconnect();
				});
				ffmpeg_process.on('exit', function (e) {
					console.log('child process video exit' + e);
					socket.emit('fatal', 'ffmpeg exit!' + e);
					if(m == 'video-and-desktop')
						uploadFile(socket, true);
					else
						uploadFile(socket, false);
				});
			}


		});

		socket.on('binarystreamvideo', function (m) {
			if (!feedStream) {
				socket.emit('fatal', 'ffmpep not processing.');
				ffmpeg_process.stdin.end();
				ffmpeg_process.kill('SIGINT');
				return;
			}
			feedStream(m);
		});

		socket.on('binarystreamdesktop', function (m) {
			if (!feedStream2) {
				socket.emit('fatal', 'ffmpep not processing.');
				ffmpeg_process2.stdin.end();
				ffmpeg_process2.kill('SIGINT');
				return;
			}
			feedStream2(m);
		});
		socket.on('infos', function (m) {
			socket.handshake.session.usermediadatas = m;
		});
		socket.on('stop', function (m) {
			if(m == 'video-and-desktop' || m == 'onlyvideo') {
				feedStream = false;
				if (ffmpeg_process) {
					try {
						ffmpeg_process.stdin.end();
					} catch (e) {
						console.warn('End ffmpeg process attempt failed...');
					}
				}
			}
			if(m == 'video-and-desktop' || m == 'audio-and-desktop' || m == 'onlyaudio' || m == 'onlydesktop') {
				feedStream2 = false;
				if (ffmpeg_process2) {
					try {
						ffmpeg_process2.stdin.end();
					} catch (e) {
						console.warn('End ffmpeg process attempt failed...');
					}
				}
			}

			socket.emit('idRecord', socketissued, uid);
		});
		socket.on('disconnect', function () {
			feedStream = false,feedStream2 = false;
			if (ffmpeg_process)
				try {
					ffmpeg_process.kill('SIGINT');
				} catch (e) {
					console.warn('killing ffmpeg process attempt failed...');
				}
			if (ffmpeg_process2)
				try {
					ffmpeg_process2.kill('SIGINT');
				} catch (e) {
					console.warn('killing ffmpeg2 process attempt failed...');
				}
		});
		socket.on('error', function (e) {
			console.log('socket.io error:' + e);
		});

		socket.on('zipfiles', function () {
			var JSZip = require("jszip");
			var zip = new JSZip();

			const webcamMedia = './static/records/' + uid + '/' + socketissued + '/' + socketissued + '.webm';
			const screenMedia = './static/records/' + uid + '/' + socketissued + '/' + socketissued + 'screen.webm';

			try {
				if (fs.existsSync(webcamMedia))
					zip.file(socketissued + '.webm', fs.createReadStream('./static/records/' + uid + '/' + socketissued + '/' + socketissued + '.webm'));
			} catch(err) {
				console.error(err);
			}

			try {
				if (fs.existsSync(screenMedia))
					zip.file(socketissued + 'screen.webm', fs.createReadStream('./static/records/' + uid + '/' + socketissued + '/' + socketissued + 'screen.webm'));
			} catch(err) {
				console.error(err);
			}

			if((fs.existsSync(webcamMedia) && fs.existsSync(screenMedia))) //si deux flux alors on merge
			{

				var width = 1280;
				var height = 720;
				var bitrate = 1450;
				var videowidth = 480; //480;
				var videoheight = 270;
				var slidewidth = 800;
				var slideheight = 450;
				var videotop = (height - videoheight) / 2;
				var slidetop = (height - slideheight) / 2;
				var leftmargin = 10; //10;

				fluentFFMPEG()
					.input(webcamMedia)
					.input(screenMedia)
					.complexFilter([
						'[0]scale='+videowidth+':-1, pad='+width+':'+height+':'+leftmargin+':('+height+'-ih)/2 [LEFT]',
						'[1] scale='+slidewidth+':-1 [RIGHT]',
						'[LEFT][RIGHT] overlay='+videowidth+':(main_h/2)-(overlay_h/2)',
					])
					.outputOption('-ac', '1')
					.outputOption('-b', bitrate+'k')
					.outputOption('-preset', 'fast')
					.outputOption('-s', width + "x" + height)
					.output('./static/records/' + uid + '/' + socketissued + '/' + socketissued + 'merged.webm')
					.on("error",function(er){
						console.log("error occured: "+er.message);
					})
					.on("end",function(){
						zip.file(socketissued + 'merged.webm', fs.createReadStream('./static/records/' + uid + '/' + socketissued + '/' + socketissued + 'merged.webm'));
						zip.generateNodeStream({type:'nodebuffer',streamFiles:true})
							.pipe(fs.createWriteStream('./static/records/' + uid + '/' + socketissued + '/' + socketissued+'.zip'))
							.on('finish', function () {
								socket.emit('endzip', fs.readFileSync('./static/records/' + uid + '/' + socketissued + '/' + socketissued+'.zip'), socketissued);
							});
					})
					.run();
			}
			else
			{
				zip.generateNodeStream({type:'nodebuffer',streamFiles:true})
					.pipe(fs.createWriteStream('./static/records/' + uid + '/' + socketissued + '/' + socketissued+'.zip'))
					.on('finish', function () {
						socket.emit('endzip', fs.readFileSync('./static/records/' + uid + '/' + socketissued + '/' + socketissued+'.zip'), socketissued);
					});
			}
		});

		getListSeries(socket, function (displayName) {
			socket.emit('listseries', displayName);
			if(typeof socket.handshake.headers.referer !== 'undefined' && socket.handshake.headers.referer.indexOf('serieid') > -1)
			{
				let infos = socket.handshake.headers.referer.split( '?' );
				if(infos[1])
					socket.emit('insidemoodle', infos[1]);
			}
		});
		getLdapInfos(socket.handshake.session.cas_user, function (displayName) {
			socket.handshake.session.cn = displayName;
			socket.emit('displayName', displayName);
		});
	}
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
});


/**
 * Réencode les fichiers audio en mp4 pour ingest opencast
 * @param socket
 */
function encodeAudioToMp4(socket)
{
	var uid = socket.handshake.session.cas_user;
	var socketissued = socket.handshake.issued;
    var ops = [
        '-y', '-loop', '1', '-t', '1',
        '-i', './static/img/onlyaudio_ffmpeg.jpg',
        '-i', './static/records/' + uid + '/' + socketissued + '/' + socketissued + 'screen.webm',
		'./static/records/' + uid + '/' + socketissued + '/' + socketissued + 'screen.mp4'
    ];

    ffmpeg_process = spawn('ffmpeg', ops);
    ffmpeg_process.on('exit', function (e) {
        uploadFile(socket, false, true, true);
    });
}

/**
 * Permet d'uploader un média
 * @param socket
 */
function uploadFile(socket, hasSecondStream, onlySecondStream = false, isAudioFile = false)
{
	if(typeof socket.handshake.session.usermediadatas !== 'undefined') {
		//on test si c'est pas undefined  ?
		var usermediainfosToUpload = JSON.parse(socket.handshake.session.usermediadatas);

		var request = require("request");
		var d = new Date();
		var startDate = d.getFullYear() + '-' + ("0" + (d.getMonth() + 1)).slice(-2) + '-' + ("0" + d.getDate()).slice(-2);
		var startTime = d.getUTCHours() + ':' + d.getMinutes();

		var idFileUpload = socket.handshake.issued;
		var uid = socket.handshake.session.cas_user;
		var desc = 'N/R';
		var location = 'N/R';
		if(usermediainfosToUpload.locationUpload != '')
			location = usermediainfosToUpload.locationUpload;

		var nameFile = uid + '/' + idFileUpload + '/' + idFileUpload + ".webm";

		if(onlySecondStream)
			nameFile = uid + '/' + idFileUpload + '/' + idFileUpload + "screen.webm";

		if(isAudioFile)
			nameFile = uid + '/' + idFileUpload + '/' + idFileUpload + "screen.mp4";

		//on récup la duration du média
		var duration = '00:00:00';
		fluentFFMPEG.ffprobe('./static/records/'+nameFile, function(err, metadata) {

			duration = new Date(metadata.format.duration * 1000).toISOString().substr(11, 8);

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
				'    "role": "ROLE_GROUP_MOODLE",\n' +
				'    "action": "read"\n' +
				'  },\n' +
				'  {\n' +
				'    "allow": true,\n' +
				'    "role": "ROLE_GROUP_MOODLE",\n' +
				'    "action": "write"\n' +
				'  },\n' +
				'  {\n' +
				'    "allow": true,\n' +
				'    "role": "ROLE_GROUP_MOODLE",\n' +
				'    "action": "annotate"\n' +
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
				'  {\n' +
				'    "allow": true,\n' +
				'    "role": "ROLE_USER_LDAP_' + uid + '",\n' +
				'    "action": "annotate-admin"\n' +
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
				'        "id": "creator",\n' +
				'        "value": ["' + socket.handshake.session.cn + '"]\n' +
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
				'        "id": "duration",\n' +
				'        "value": "' + duration + '"\n' +
				'      },\n' +
				'      {\n' +
				'        "id": "location",\n' +
				'        "value": "' + location + '"\n' +
				'      }\n' +
				'    ]\n' +
				'  }\n' +
				']';

			if (isAudioFile) {
				var processing = '{\n' +
					'  "workflow": "' + config.opencast_workflow_audio + '"\n' +
					'}';
			} else {
				var processing = '{\n' +
					'  "workflow": "' + config.opencast_workflow + '"\n' +
					'}';
			}


			if (hasSecondStream) {
				var options = {
					method: "POST",
					url: config.opencast_events_url,
					ca: fs.readFileSync(config.opencast_cert),
					headers:
						{
							'cache-control': 'no-cache',
							'Authorization': 'Basic ' + config.opencast_authentication,
							'content-type': 'multipart/form-data;'
						},
					formData:
						{
							presenter:
								{
									value: fs.createReadStream('./static/records/'+ uid + '/' + idFileUpload + '/' + idFileUpload + ".webm"),
									options:
										{
											filename: 'metadata/' + idFileUpload + '.webm'
										}
								},
							presentation:
								{
									value: fs.createReadStream('./static/records/'+ uid + '/' + idFileUpload + '/' + idFileUpload + "screen.webm"),
									options:
										{
											filename: 'metadata/' + idFileUpload + 'screen.webm'
										}
								},
							processing,
							metadata,
							acl
						}
				};
			} else {
				var options = {
					method: "POST",
					url: config.opencast_events_url,
					ca: fs.readFileSync(config.opencast_cert),
					headers:
						{
							'cache-control': 'no-cache',
							'Authorization': 'Basic ' + config.opencast_authentication,
							'content-type': 'multipart/form-data;'
						},
					formData:
						{
							presenter:
								{
									value: fs.createReadStream("./static/records/" + nameFile),
									options:
										{
											filename: 'metadata/' + nameFile
										}
								},
							processing,
							metadata,
							acl
						}
				};
			}

			request(options, function (error, response, body) {
				if (error) {
					socket.disconnect(); //?? à set ailleur ?
					throw new Error(error);
				} else {
				// var obj = JSON.parse(body);
				// console.log(body);
					socket.emit('endupload', 1);
				}
				// socket.disconnect();
			});
		});
	}
	else {
		socket.emit('endupload', 0); // pas nécessaire si on force l'upload
		// socket.disconnect();
	}
}

/**
 * Permet de récupérer des infos ldap en fonction d'un uid
 * @param uid
 */
function getLdapInfos(uid, callback)
{
	var ldap = require('ldapjs');
	var client = ldap.createClient({
		url: config.path_ldap_uca
	});
	var opts = {
		filter: '(&(clfdstatus=9)(uid='+uid+'))',
		scope: 'sub',
		attributes: ['sn', 'cn', 'displayName']
	};

	let displayName = '';
	client.search('ou=people, dc=uca,dc=fr', opts, function(err, res) {
		res.on('searchEntry', function(entry) {
			displayName = entry.object.displayName;
		});
		res.on('searchReference', function(referral) {
			console.log('referral: ' + referral.uris.join());
		});
		res.on('error', function(err) {
			console.error('error: ' + err.message);
		});
		res.on('end', function(result) {
			callback(displayName);
		});
	});
}

/**
 * @param socket
 * @param callback
 */
function getListSeries(socket, callback)
{
	var options = {
		method: 'GET',
		url: config.opencast_series_url,
		rejectUnauthorized: false,
		headers: {
			'cache-control': 'no-cache',
			Authorization: 'Basic '+config.opencast_authentication
		}
	};
	var request = require("request");
	request(options, function (error, response, listSeriesTmp) {
		var listSeries = JSON.parse(listSeriesTmp);
		getListSeriresWritable(socket.handshake.session.cas_user, listSeries).then(function(result) {
			callback(result);
		}, function(err) {
			console.log(err);
		})
	});
}

/**
 * P
 * @param uid
 * @param listSeries
 * @returns {Promise<Array>}
 */
async function getListSeriresWritable (uid, listSeries)
{
	let result = [];
	for (var i = 0, len = listSeries.length; i < len; i++) {
		rst = await checkSerieAcl(uid, listSeries[i]);
		if(typeof rst !== 'undefined')
			result.push(rst);
	}
	return  result;
}

/**
 *
 * @param uid
 * @param serieinfo
 * @returns {Promise<any>}
 */
function checkSerieAcl(uid, serieinfo)
{
	return new Promise(function (resolve, reject) {
		var options = {
			method: 'GET',
			url: config.opencast_series_url + '/' + serieinfo.identifier + '/acl',
			rejectUnauthorized: false,
			headers: {
				'cache-control': 'no-cache',
				Authorization: 'Basic ' + config.opencast_authentication
			}
		};
		var request = require("request");
		request(options, function (error, response, listSeries2) {
			serieInfo = JSON.parse(listSeries2);
			for (var j = 0, len = serieInfo.length; j < len; j++)
				if (serieInfo[j].allow == true && serieInfo[j].role.toLocaleLowerCase().indexOf(uid) > -1)
					resolve(serieinfo);
			resolve();
		});
	});
}
