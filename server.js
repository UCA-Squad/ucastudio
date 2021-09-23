const config = require('./config.json');
var express = require('express');
var app = express();
var spawn = require('child_process').spawn;
var fluentFFMPEG = require('fluent-ffmpeg');
var CASAuthentication = require('connect-cas-uca');
var useragent = require('useragent');
var logFileEvents = config.path_log_file_events;
var debitValue = null;
var fs = require('fs');
global.hasSendMailError = false;
const server = require('https').createServer({
	key: fs.readFileSync(config.path_cert_key),
	cert: fs.readFileSync(config.path_cert)

},app);
var io = require('socket.io')(server, {
	'maxHttpBufferSize': '1e8'
});

spawn('ffmpeg',['-h']).on('error',function(){
	console.error("FFMpeg not found in system cli; please install ffmpeg properly or make a softlink to ./!");
	process.exit(-1);
});

var cas = new CASAuthentication({
	cas_url         : config.cas_url,
	service_url     : config.service_url,
});

var session = require("express-session")({
	secret: config.session_secret_key,
	resave: false,
	saveUninitialized: false
});

var sharedsession = require("express-socket.io-session");
app.use(session);
io.use(sharedsession(session));

app.get( '/', cas.bounce );
app.get( '/index.html', cas.bounce );
app.get( '/logout', cas.logout );

app.use(express.static(__dirname + "/static/"));


io.on('connection', function(socket){

	socket.on('debitValue', function (debit) {
		debitValue = debit;
	});

	var isMonitor = 'noSelect';
	socket.on('isMonitor', function (isMonitorSelect) {
		isMonitor = isMonitorSelect;
	});

	socket.emit('clientConfig', config.client_config);
	socket.emit('moodle', config.moodle_url);

	if(config.enable_maintenance_mod === "true")
		socket.emit('info_maintenance_mod', config.info_maintenance_mod);

	var ffmpeg_process, feedStream=false;
	var ffmpeg_process2, feedStream2=false;
	var hasCheckFileIsWrite = false,  hasCheckFileIsWrite2 = false;

	if(typeof socket.handshake.session.cas_user !== 'undefined' ) {
		var agent = useragent.parse(socket.request.headers['user-agent']);
		var uid = socket.handshake.session.cas_user;
		var socketissued = socket.handshake.issued;

		try {
			//on check si l'user est co via cas, et on créer un folder si existe pas
			fs.existsSync(config.path_folder_record + uid) || fs.mkdirSync(config.path_folder_record + uid);
		} catch(err) {
			sendEmailError('error create new folder user' + err, uid+' / '+agent.toString());
			console.error(getDateNow()+' : '+err);
		}

		socket.on('start', function (m, resDesktop = null, resWebCam = null) {

			fs.mkdirSync(config.path_folder_record + uid + '/'+socketissued+'/');

			if (ffmpeg_process || feedStream || ffmpeg_process2 || feedStream2) {
				socket.emit('fatal', 'stream already started.');
				return;
			}
			var ops = [
				'-loglevel', 'quiet',
				'-i', '-',
				'-c:v', 'copy', '-preset', 'fast',
				'-use_wallclock_as_timestamps', '1',
				'-async', '1',
				'-b:a', '96k', '-strict', '-2',
				'-threads', '0',
				'-f', 'webm',
				config.path_folder_record + uid + '/' + socketissued + '/' + socketissued + '.webm'
			];

			var ops2;
			if(m === 'video-and-desktop') {
				ops2 = [
					'-loglevel', 'quiet',
					'-i', '-',
					'-c:v', 'copy', '-preset', 'fast',
					'-an',
					'-use_wallclock_as_timestamps', '1',
					'-threads', '0',
					'-f', 'webm',
					config.path_folder_record + uid + '/' + socketissued + '/' + socketissued + 'screen.webm'
				];
			}
			else
			{
				if(m === "onlydesktop") {
					ops2 = [
						'-loglevel', 'quiet',
						'-i', '-',
						'-c:v', 'copy', '-preset', 'fast',
						'-use_wallclock_as_timestamps', '1',
						'-async', '1',
						'-threads', '0',
						'-f', 'webm',
						config.path_folder_record + uid + '/' + socketissued + '/' + socketissued + 'screen.webm'
					];
				}
				else {
					ops2 = [
						'-loglevel', 'quiet',
						'-i', '-',
						'-c:v', 'copy', '-preset', 'fast',
						'-use_wallclock_as_timestamps', '1',
						'-async', '1',
						'-b:a', '96k', '-strict', '-2',
						'-threads', '0',
						'-f', 'webm',
						config.path_folder_record + uid + '/' + socketissued + '/' + socketissued + 'screen.webm'
					];
				}
			}

			if(m !== "onlyaudio") {
				var iWebCam = 6;
				getRate('webcam', resWebCam).forEach(function (element) {
					ops.splice(iWebCam, 0, element);
					iWebCam++;
				});
				var iDesktop = 6;
				getRate('desktop', resDesktop).forEach(function (element) {
					ops2.splice(iDesktop, 0, element);
					iDesktop++;
				});
			}

			if(m === 'video-and-desktop' || m === 'audio-and-desktop' || m === 'onlyaudio' || m === 'onlydesktop') {
				ffmpeg_process2 = spawn('ffmpeg', ops2);
				feedStream2 = function (data) {
					ffmpeg_process2.stdin.write(data);
					//write exception cannot be caught here.
				}
				ffmpeg_process2.stderr.on('data', function (d) {
					socket.emit('ffmpeg_stderr', '' + d);
					if(!hasCheckFileIsWrite2)
						setTimeout(function(){
							hasCheckFileIsWrite2 = true;
							checkIsFileIsWrite(socket, config.path_folder_record + uid + '/' + socketissued + '/', m, agent);
						}, 180000);
				});
				ffmpeg_process2.on('error', function (e) {
					console.log('child process error' + e);
					sendEmailError('ffmpeg child process error' + e, uid+' / '+agent.toString());
					socket.emit('fatal', 'ffmpeg error!' + e);
					feedStream = false;
					socket.disconnect();
				});
				ffmpeg_process2.on('exit', function (e) {
					console.log('child process desktop exit - '+ uid +' - '+ socketissued +' - status '+e);
					if(m === 'onlyaudio' || m === 'onlydesktop' || m === 'audio-and-desktop') {
                        if(m === 'onlyaudio')
							uploadFile(socket, false, true, true);
						else
                            uploadFile(socket, false, true, false, true);
                    }
				});
			}

			if(m === 'video-and-desktop' || m === 'onlyvideo') {
				ffmpeg_process = spawn('ffmpeg', ops);
				feedStream = function (data) {
					ffmpeg_process.stdin.write(data);
					//write exception cannot be caught here.
				}
				ffmpeg_process.stderr.on('data', function (d) {
					socket.emit('ffmpeg_stderr', '' + d);
					if(!hasCheckFileIsWrite)
						setTimeout(function(){
							hasCheckFileIsWrite = true;
							checkIsFileIsWrite(socket, config.path_folder_record + uid + '/' + socketissued + '/', m, agent);
						}, 180000);
				});
				ffmpeg_process.on('error', function (e) {
					console.log('child process error' + e);
					sendEmailError('ffmpeg child process error' + e, uid+' / '+agent.toString());
					socket.emit('fatal', 'ffmpeg error!' + e);
					feedStream = false;
					socket.disconnect();
				});
				ffmpeg_process.on('exit', function (e) {
					console.log('child process video exit - '+ uid +' - '+ socketissued +' - status '+e);
					if(m === 'video-and-desktop')
						uploadFile(socket, true);
					else
						uploadFile(socket, false);
				});
			}

			try {
				fs.writeFileSync(logFileEvents, 'startrec;'+uid+';'+getDateNow()+';'+socketissued+';'+m+';ismonitor=>'+isMonitor+';'+debitValue+'Mbps'+';"'+agent.toString()+'"'+"\n", {flag: 'a'});
			} catch (err) {
				sendEmailError('error write logFileEvents' + err, uid+' / '+agent.toString());
				console.error(getDateNow()+' : '+err)
			}

		});

		socket.on('binarystreamvideo', function (m) {
			if (!feedStream) {
				try {
					socket.emit('fatal', 'ffmpep not processing video.');
					ffmpeg_process.stdin.end();
					ffmpeg_process.kill('SIGINT');
					return;
				} catch (e) {
					console.warn('End ffmpeg not processing failed video...');
				}
			}
			else {
				if (typeof feedStream === "function") {
					try { feedStream(m); }
					catch (e) { sendEmailError('feedStream error:' + e, uid+' / '+agent.toString()); }
				}
				else {
					socket.emit('errorffmpeg');
					socket.disconnect();
				}
			}
		});

		socket.on('binarystreamdesktop', function (m) {
			if (!feedStream2) {
				try {
					socket.emit('fatal', 'ffmpep not processing desktop.');
					ffmpeg_process2.stdin.end();
					ffmpeg_process2.kill('SIGINT');
					return;
				} catch (e) {
					console.warn('End ffmpeg2 not processing failed desktop...');
				}
			}
			else {
				if (typeof feedStream2 === "function") {
					try { feedStream2(m); }
					catch (e) { sendEmailError('feedStream2 error:' + e, uid+' / '+agent.toString()); }
				}
				else {
					socket.emit('errorffmpeg');
					socket.disconnect();
				}
			}
		});
		socket.on('infos', function (m) {
			socket.handshake.session.usermediadatas = m;
		});
		socket.on('stop', function (m) {
			if(m === 'video-and-desktop' || m === 'onlyvideo') {
				feedStream = false;
				if (ffmpeg_process) {
					try {
						ffmpeg_process.stdin.end();
					} catch (e) {
						sendEmailError('End ffmpeg process attempt failed ' + e, uid+' / '+agent.toString());
						console.warn('End ffmpeg process attempt failed...');
					}
				}
			}
			if(m === 'video-and-desktop' || m === 'audio-and-desktop' || m === 'onlyaudio' || m === 'onlydesktop') {
				feedStream2 = false;
				if (ffmpeg_process2) {
					try {
						ffmpeg_process2.stdin.end();
					} catch (e) {
						console.warn('End ffmpeg process attempt failed...');
					}
				}
			}

			// socket.emit('idRecord', socketissued, uid);
			try {
				fs.writeFileSync(logFileEvents, 'stoprec;'+uid+';'+getDateNow()+';'+socketissued+';'+m+';ismonitor=>'+isMonitor+';'+agent.toString()+'"'+"\n", {flag: 'a'});
			} catch (err) {
				sendEmailError('error write logFileEvents' + err, uid+' / '+agent.toString());
				console.error(getDateNow()+' : '+err)
			}
		});
		socket.on('disconnect', function () {
			feedStream = false,feedStream2 = false;
			if (ffmpeg_process)
				try {
					ffmpeg_process.stdin.end();
					ffmpeg_process.kill('SIGINT');
				} catch (e) {
					console.warn('killing ffmpeg process attempt failed...');
				}
			if (ffmpeg_process2)
				try {
					ffmpeg_process2.stdin.end();
					ffmpeg_process2.kill('SIGINT');
				} catch (e) {
					console.warn('killing ffmpeg2 process attempt failed...');
				}
			cas.destroy_session;
		});
		socket.on('error', function (e) {
			console.log('socket.io error:' + e);
			sendEmailError('socket.io error:' + e, uid+' / '+agent.toString())
		});

		socket.on('zipfiles', function (fusion) {
			var JSZip = require("jszip");
			var zip = new JSZip();

			const webcamMedia = config.path_folder_record + uid + '/' + socketissued + '/' + socketissued + '.webm';
			const screenMedia = config.path_folder_record + uid + '/' + socketissued + '/' + socketissued + 'screen.webm';
			const metadataXML = config.path_folder_record + uid + '/' + socketissued + '/metadata.xml';

			try {
				if (fs.existsSync(webcamMedia))
					zip.file(socketissued + '.webm', fs.createReadStream(webcamMedia));
			} catch(err) {
				sendEmailError('zip file' + err, uid+' / '+agent.toString());
				console.error(getDateNow()+' : '+err);
			}

			try {
				if (fs.existsSync(screenMedia))
					zip.file(socketissued + 'screen.webm', fs.createReadStream(screenMedia));
			} catch(err) {
				sendEmailError('zip file' + err, uid+' / '+agent.toString());
				console.error(getDateNow()+' : '+err);
			}

			try {
				if (fs.existsSync(metadataXML))
					zip.file('metadata.xml', fs.createReadStream(metadataXML));
			} catch(err) {
				sendEmailError('zip file' + err, uid+' / '+agent.toString());
				console.error(getDateNow()+' : '+err);
			}

			if(fusion && (fs.existsSync(webcamMedia) && fs.existsSync(screenMedia))) //si deux flux alors on merge
			{

				var width = 1920;
				var height = 1080;
				var videowidth = 640; //480;
				var slidewidth = 1280;
				var leftmargin = 0; //10;

				fluentFFMPEG()
					.input(screenMedia)
					.input(webcamMedia)
					.complexFilter([
						'[0]scale='+slidewidth+':-1:force_original_aspect_ratio=decrease, pad='+width+':'+height+':'+leftmargin+':('+height+'-ih)/2 [LEFT]',
						'[1] scale='+videowidth+':-1:force_original_aspect_ratio=decrease [RIGHT]',
						'[LEFT][RIGHT] overlay='+slidewidth+':(main_h/2)-(overlay_h/2)',
					])
					.outputOption('-r', '25')
					.outputOption('-ac', '1')
					.outputOption('-crf', '23')
					.outputOption('-preset', 'fast')
					.outputOption('-threads', '0')
					.outputOption('-s', width + "x" + height)
					.output(config.path_folder_record + uid + '/' + socketissued + '/' + socketissued + 'merged.mp4')
					.on("error",function(er){
						console.log("error occured: "+er.message);
					})
					.on("end",function(){
						zip.file(socketissued + 'merged.mp4', fs.createReadStream(config.path_folder_record + uid + '/' + socketissued + '/' + socketissued + 'merged.mp4'));
						zip.generateNodeStream({type:'nodebuffer',streamFiles:true})
							.pipe(fs.createWriteStream(config.path_folder_record + uid + '/' + socketissued + '/' + socketissued+'.zip'))
							.on('finish', function () {
								socket.emit('endzip', fs.readFileSync(config.path_folder_record + uid + '/' + socketissued + '/' + socketissued+'.zip'), socketissued);
							});
					})
					.run();
			}
			else
			{
				zip.generateNodeStream({type:'nodebuffer',streamFiles:true})
					.pipe(fs.createWriteStream(config.path_folder_record + uid + '/' + socketissued + '/' + socketissued+'.zip'))
					.on('finish', function () {
						socket.emit('endzip', fs.readFileSync(config.path_folder_record + uid + '/' + socketissued + '/' + socketissued+'.zip'), socketissued);
					});
			}
		});

		getLdapInfos(socket.handshake.session.cas_user, function (displayName, mail, clfdstatus) {
			socket.handshake.session.cn = displayName;
			socket.handshake.session.mail = mail;
			socket.handshake.session.isEtudiant = clfdstatus === 0 || clfdstatus === 1;
			socket.emit('displayName', displayName);
			socket.emit('isEtudiant', socket.handshake.session.isEtudiant);
		});

		getListSeries(socket, function (listSeries) {
			socket.emit('listseries', listSeries, uid, socket.handshake.session.mail);
			if(typeof socket.handshake.headers.referer !== 'undefined' && socket.handshake.headers.referer.indexOf('serieid') > -1) {
				let infos = socket.handshake.headers.referer.split( '?' );
				if(infos[1])
					socket.emit('insidemoodle', infos[1]);
			}
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
 * Permet d'uploader un média
 * @param socket
 * @param hasSecondStream
 * @param onlySecondStream
 * @param isAudioFile
 * @param onlydesktop
 */
function uploadFile(socket, hasSecondStream, onlySecondStream = false, isAudioFile = false, onlydesktop = false)
{
	if(typeof socket.handshake.session.usermediadatas !== 'undefined') {
		//on test si c'est pas undefined  ?
		var usermediainfosToUpload = JSON.parse(socket.handshake.session.usermediadatas);
		const agent = useragent.parse(socket.request.headers['user-agent']);
		var request = require("request");
		var d = new Date();
		var startDate = d.getFullYear() + '-' + ("0" + (d.getMonth() + 1)).slice(-2) + '-' + ("0" + d.getDate()).slice(-2);
		var startTime = d.getUTCHours() + ':' + (d.getMinutes()<10?'0':'') + d.getMinutes();

		var idFileUpload = socket.handshake.issued;
		var uid = socket.handshake.session.cas_user;
		var mustBeUpload = usermediainfosToUpload.mustBeUpload;
		var desc = 'N/R';
		var typeOfFlavor = "presenter";
		if(usermediainfosToUpload.descUpload !== '')
			desc = usermediainfosToUpload.descUpload;
		var location = 'N/R';
		if(usermediainfosToUpload.locationUpload !== '')
			location = usermediainfosToUpload.locationUpload;

		var nameFile = uid + '/' + idFileUpload + '/' + idFileUpload + ".webm";

		if(onlySecondStream)
			nameFile = uid + '/' + idFileUpload + '/' + idFileUpload + "screen.webm";

		//on check si l'user à select une serie ou son dossier, si son dossier et exist pas alors on le créer
		createSerie(uid, socket, usermediainfosToUpload.idSerie, mustBeUpload).then( function (idSerie) {

			usermediainfosToUpload.idSerie = idSerie;

			var pathMediaToFFprobe;
			if(hasSecondStream || onlySecondStream)
				pathMediaToFFprobe = config.path_folder_record + uid + '/' + idFileUpload + '/' + idFileUpload + "screen.webm";
			else
				pathMediaToFFprobe = config.path_folder_record + nameFile;

			//on récup la duration du média
			var duration = '00:00:00';
			fluentFFMPEG.ffprobe(pathMediaToFFprobe, function(err, metadataFFprobe) {

				try {

					var typeEncode = '';

					metadataFFprobe.streams.forEach(function(obj) {
						if(obj.codec_type === 'video')
							typeEncode = obj.codec_name;

					});

					duration = new Date(metadataFFprobe.format.duration * 1000).toISOString().substr(11, 8);

					var metadata = '[\n' +
						'  {\n' +
						'    "flavor": "dublincore/episode",\n' +
						'    "fields": [\n' +
						'      {\n' +
						'        "id": "title",\n' +
						'        "value": "' + usermediainfosToUpload.titleUpload.replace(/"/g, '\\"') + '"\n' +
						'      },\n' +
						'      {\n' +
						'        "id": "description",\n' +
						'        "value": "' + desc.replace(/"/g, '\\"') + '"\n' +
						'      },\n' +
						'      {\n' +
						'        "id": "creator",\n' +
						'        "value": ["' + usermediainfosToUpload.presenterUpload.replace(/"/g, '\\"')  + '"]\n' +
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
						'      },\n' +
						'      {\n' +
						'        "id": "source",\n' +
						'        "value": "UCAStudio"\n' +
						'      }\n' +
						'    ]\n' +
						'  }\n' +
						']';


					var js2xmlparser = require("js2xmlparser");
					var metadataXML  = js2xmlparser.parse("media", JSON.parse(metadata)[0]);
					try {
						fs.writeFileSync(config.path_folder_record + uid + '/' + idFileUpload + '/metadata.xml', metadataXML);
					} catch (err) {
						sendEmailError('write file metadata' + err, uid+' / '+agent.toString());
						console.error(getDateNow()+' : '+err)
					}

					if(mustBeUpload)
					{
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
							'    "action": "annotate"\n' +
							'  },\n' +
							'  {\n' +
							'    "allow": true,\n' +
							'    "role": "ROLE_USER_LDAP_' + uid.toUpperCase() + '",\n' +
							'    "action": "read"\n' +
							'  },\n' +
							'  {\n' +
							'    "allow": true,\n' +
							'    "role": "ROLE_USER_LDAP_' + uid.toUpperCase() + '",\n' +
							'    "action": "write"\n' +
							'  }\n' +
							'  {\n' +
							'    "allow": true,\n' +
							'    "role": "ROLE_USER_LDAP_' + uid.toUpperCase() + '",\n' +
							'    "action": "annotate-admin"\n' +
							'  }\n' +
							']';

						var canEncode540p = false;
						if((!isAudioFile) && metadataFFprobe.streams[0].height >= 520 && metadataFFprobe.streams[0].height <= 700) {
							canEncode540p = true;
						}

						var canEncode720p = true;
						if((!isAudioFile) && metadataFFprobe.streams[0].height < 700 ) {
							canEncode720p = false;
						}

						var canEncode1080p = true;
						if((!isAudioFile) && metadataFFprobe.streams[0].height < 1000 ) {
							canEncode1080p = false;
						}
						var processing;
						if (isAudioFile)
						{
							processing = '{\n' +
								'  "workflow": "' + config.opencast_workflow_audio + '"\n' +
								'}';
						}
						else
						{
							if (canEncode1080p)
							{
								processing = '{\n' +
									'  "workflow": "' + config.opencast_workflow + '"\n' +
									'  "configuration": {\n' +
									'    "flagQuality480p": "true",\n' +
									'    "flagQuality720p": "true",\n' +
									'    "flagQuality1080p": "true"\n' +
									'    "typeEncode": "'+ typeEncode + '"\n' +
									'  }\n' +
									'}';
							}
							else if (canEncode720p)
							{
								processing = '{\n' +
									'  "workflow": "' + config.opencast_workflow + '"\n' +
									'  "configuration": {\n' +
									'    "flagQuality480p": "true",\n' +
									'    "flagQuality720p": "true",\n' +
									'    "flagQuality1080p": "false"\n' +
									'    "typeEncode": "'+ typeEncode + '"\n' +
									'  }\n' +
									'}';
							}
							else if (canEncode540p)
							{
								processing = '{\n' +
									'  "workflow": "' + config.opencast_workflow + '"\n' +
									'  "configuration": {\n' +
									'    "flagQuality480p": "true",\n' +
									'    "flagQuality540p": "true",\n' +
									'    "flagQuality720p": "false",\n' +
									'    "flagQuality1080p": "false"\n' +
									'    "typeEncode": "'+ typeEncode + '"\n' +
									'  }\n' +
									'}';
							}
							else
							{
								processing = '{\n' +
									'  "workflow": "' + config.opencast_workflow + '",\n' +
									'  "configuration": {\n' +
									'    "flagQuality480p": "true",\n' +
									'    "flagQuality540p": "false",\n' +
									'    "flagQuality720p": "false",\n' +
									'    "flagQuality1080p": "false"\n' +
									'    "typeEncode": "'+ typeEncode + '"\n' +
									'  }\n' +
									'}'
							}
						}

						if(onlydesktop) {
							typeOfFlavor = "presentation";
						}

						var options;
						if (hasSecondStream) {
							options = {
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
												value: fs.createReadStream(config.path_folder_record + uid + '/' + idFileUpload + '/' + idFileUpload + ".webm"),
												options:
													{
														filename: 'metadata/' + idFileUpload + '.webm'
													}
											},
										presentation:
											{
												value: fs.createReadStream(config.path_folder_record + uid + '/' + idFileUpload + '/' + idFileUpload + "screen.webm"),
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
						} else if(!hasSecondStream && typeOfFlavor === "presenter") {
							options = {
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
												value: fs.createReadStream(config.path_folder_record + nameFile),
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
						} else {
							options = {
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
										presentation:
											{
												value: fs.createReadStream(config.path_folder_record + nameFile),
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

						request(options, function (error) {
							if (error)
								throw new Error(error);
							else
								socket.emit('endupload', 1);
						});
					}
					else
						socket.emit('endupload', 0); // pas nécessaire si on force l'upload
				}
				catch (e) {
					sendEmailError(' errorrec ' + e, uid + ' / ' + agent.toString());
				}
			});
		});
		socket.emit('idRecord', socket.handshake.session.cas_user, socket.handshake.issued);
	}
}

/**
 * Permet de récupérer des infos ldap en fonction d'un uid
 * @param uid
 * @param callback
 */
function getLdapInfos(uid, callback)
{
	var ldap = require('ldapjs');
	var client = ldap.createClient({
		url: config.path_ldap_uca
	});
	var opts = {
		filter: '(uid='+uid+')',
		scope: 'sub',
		attributes: ['sn', 'cn', 'displayName', 'mail', 'CLFDstatus']
	};

	let displayName = '';
	let mail = '';
	let clfdstatus = '';
	client.search('ou=people, dc=uca,dc=fr', opts, function(err, res) {
		res.on('searchEntry', function(entry) {
			displayName = entry.object.displayName;
			mail = entry.object.mail;
			clfdstatus = entry.object.CLFDstatus;
		});
		res.on('searchReference', function(referral) {
			console.log('referral: ' + referral.uris.join());
		});
		res.on('error', function(err) {
			console.error('error: ' + err.message);
		});
		res.on('end', function() {
			callback(displayName, mail, clfdstatus);
		});
	});
}

/**
 * @param socket
 * @param callback
 */
function getListSeries(socket, callback)
{
	var uid = socket.handshake.session.cas_user.toUpperCase();
	var options = {
		method: 'GET',
		url: config.opencast_series_url,
		rejectUnauthorized: false,
		headers: {
			'cache-control': 'no-cache',
			'Authorization': 'Basic '+config.opencast_authentication,
			'X-RUN-WITH-ROLES': 'ROLE_USER_LDAP_'+uid
		}
	};
	var request = require("request");
	request(options, function (error, response, listSeriesTmp) {
		var listSeries = JSON.parse(listSeriesTmp);
		getListSeriresWritable(uid, listSeries).then(function(result) {
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
	return new Promise(function (resolve) {
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
				if (serieInfo[j].action === 'write' && serieInfo[j].allow === true && serieInfo[j].role.indexOf(uid) > -1)
					resolve(serieinfo);
			resolve();
		});
	});
}

/**
 * Créer une série si existe pas
 * @param uid
 * @param socket
 * @param idSerieSelect
 * @param mustBeUpload
 * @returns {Promise<any>}
 */
function createSerie(uid, socket, idSerieSelect, mustBeUpload)
{
	return new Promise(function (resolve) {

		if(idSerieSelect === 'myfolder' && mustBeUpload) {

			var acl = '[\n' +
				'  {\n' +
				'    "allow": true,\n' +
				'    "action": "read"\n' +
				'    "role": "ROLE_ADMIN",\n' +
				'  },\n' +
				'  {\n' +
				'    "allow": true,\n' +
				'    "action": "write"\n' +
				'    "role": "ROLE_ADMIN",\n' +
				'  },\n' +
				'  {\n' +
				'    "allow": true,\n' +
				'    "action": "read"\n' +
				'    "role": "ROLE_GROUP_MOODLE",\n' +
				'  },\n' +
				'  {\n' +
				'    "allow": true,\n' +
				'    "action": "read"\n' +
				'    "role": "ROLE_USER_LDAP_' + uid.toUpperCase() + '",\n' +
				'  },\n' +
				'  {\n' +
				'    "allow": true,\n' +
				'    "action": "write"\n' +
				'    "role": "ROLE_USER_LDAP_' + uid.toUpperCase() + '",\n' +
				'  }\n' +
				']';

			if(socket.handshake.session.isEtudiant)
				uid = 'etd_'+uid;

			var idSerieMyFolder = null;
			getListSeries(socket, function (listSeries) {
				listSeries.forEach(function (serie) {
					if(serie.title === uid)
						idSerieMyFolder = serie.identifier;
				});

				if(idSerieMyFolder !== null)
					resolve(idSerieMyFolder);
				else
				{
					var metadata = '[\n' +
						'  {\n' +
						'    "label": "Opencast Series DublinCore",\n' +
						'    "flavor": "dublincore/series",\n' +
						'    "fields": [\n' +
						'      {\n' +
						'        "id": "title",\n' +
						'        "value": "' + uid + '"\n' +
						'      },\n' +
						'      {\n' +
						'        "id": "subject",\n' +
						'        "value": "' + socket.handshake.session.mail + '"\n' +
						'      }\n' +
						'    ]\n' +
						'  }\n' +
						']';


					var options = {
						method: "POST",
						url: config.opencast_series_url,
						ca: fs.readFileSync(config.opencast_cert),
						headers:
							{
								'cache-control': 'no-cache',
								'Authorization': 'Basic ' + config.opencast_authentication,
								'content-type': 'multipart/form-data;'
							},
						formData:
							{
								metadata,
								acl
							}
					};

					var request = require("request");
					request(options, function (error, response, body) {
						if (error) {
							throw new Error(error);
						} else {
							var obj = JSON.parse(body);
							resolve(obj.identifier);
						}
					});
				}
			});
		}
		else
			resolve(idSerieSelect);
	});
}

/**
 *
 * @param socket
 * @param path
 * @param typeOfRec
 * @param agent
 */
function checkIsFileIsWrite(socket, path, typeOfRec, agent)
{
	var uid = socket.handshake.session.cas_user;
	var socketissued = socket.handshake.issued;

	fs.readdir(config.path_folder_record + uid + '/' + socketissued + '/', function (err, files) {
		try {
			if (!files.length) {
				try {
					fs.writeFileSync(logFileEvents, 'errorrec;' + uid + ';' + getDateNow() + ';' + socketissued + ';' + typeOfRec + ';"' + agent.toString() + '"' + "\n", {flag: 'a'});
				} catch (err) {
					sendEmailError('ffmpeg errorrec' + err, uid + ' / ' + agent.toString());
					console.error(getDateNow()+' : '+err)
				}
				socket.emit('errorffmpeg');
				socket.disconnect();
			} else if (typeOfRec === 'video-and-desktop') {
				if (!fs.existsSync(config.path_folder_record + uid + '/' + socketissued + '/' + socketissued + 'screen.webm') || !fs.existsSync(config.path_folder_record + uid + '/' + socketissued + '/' + socketissued + '.webm')) {
					try {
						fs.writeFileSync(logFileEvents, 'errorrec;' + uid + ';' + getDateNow() + ';' + socketissued + ';' + typeOfRec + ';"' + agent.toString() + '"' + "\n", {flag: 'a'});
					} catch (err) {
						sendEmailError('ffmpeg errorrec' + err, uid + ' / ' + agent.toString());
						console.error(getDateNow()+' : '+err)
					}
					socket.emit('errorffmpeg');
					socket.disconnect();
				}
			}
		}
		catch (err) {
			sendEmailError('file length error' + err, uid+' / '+agent.toString());
			console.error(getDateNow()+' : '+err)
		}
	});
}

/**
 * @returns {string}
 */
function getDateNow() {
	var dateNowTmp = new Date();
	return dateNowTmp.getDate() + '-' + (dateNowTmp.getMonth() + 1) + '-' + dateNowTmp.getFullYear() + ';' + dateNowTmp.getHours() + ':' + dateNowTmp.getMinutes() + ':' + dateNowTmp.getSeconds();
}

/**
 * @param err
 * @param user
 */
function sendEmailError(err, user) {
	if(!hasSendMailError) {
		const nodemailer = require("nodemailer");
		var transporter = nodemailer.createTransport({
			host: config.mail_host,
			port: config.mail_port,
			secure: false,
			tls: {rejectUnauthorized: false}
		});

		var mailOptions = {
			from: config.mail_from,
			to: config.mail_to,
			subject: '[Warn] UCAStudio Error',
			text: 'Une erreur a été détectée \nDate : ' + getDateNow() + '\nUser : ' + user + '\nErreur : \n' + err
		};

		transporter.sendMail(mailOptions, function (error) {
			if (error)
				console.log(error);
		});

		hasSendMailError = true;
	}
}

/**
 *
 * @param type
 * @param reso
 * @returns {string[]}
 */
function getRate(type, reso)
{
	var rateValue;

	if(type === 'webcam') {
		switch (reso) {
			case 'nhd':
			case 'vga':
				rateValue = ['-maxrate', '1000k', '-bufsize', '1500k'];
				break;
			case 'qhd':
			case 'svga':
				rateValue = ['-maxrate', '1500k', '-bufsize', '3000k'];
				break;
			case 'hd':
				rateValue = ['-maxrate', '2400k', '-bufsize', '4800k'];
				break;
			case 'xga':  //à tester
				rateValue = ['-maxrate', '2060k', '-bufsize', '4120k'];
				break;
			case 'hdplus': //à tester
				rateValue = ['-maxrate', '3500k', '-bufsize', '7000k'];
				break;
			default:
				rateValue = [];
		}
	}
	else {
		switch (reso) {
			case 'vga':
				rateValue = ['-maxrate', '1000k', '-bufsize', '1500k'];
				break;
			case 'qhd':
			case 'svga':
				rateValue = ['-maxrate', '1500k', '-bufsize', '3000k'];
				break;
			case 'hd':
				rateValue = ['-maxrate', '2400k', '-bufsize', '4800k']; 
				break;
			case 'hdplus':
				rateValue = ['-maxrate', '3500k', '-bufsize', '7000k'];
				break;
			default:
				rateValue = [];
		}
	}

	return 	rateValue;
}
