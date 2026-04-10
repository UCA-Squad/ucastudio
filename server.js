const nodemailer    = require('nodemailer')
const { Client }    = require('ldapts');
const js2xmlparser  = require('js2xmlparser');
const FormData      = require('form-data')

const config = require('./config.json');
const express = require('express');
const app = express();
const spawn = require('child_process').spawn;
const CASAuthentication = require('connect-cas-uca');
const useragent = require('ua-parser-js');
const logFileEvents = config.path_log_file_events;
const axios = require('axios');
const fs = require('fs');
const transporter = nodemailer.createTransport({
	host:   config.mail_host,
	port:   config.mail_port,
	secure: false,
	tls:    { rejectUnauthorized: false }
});
let debitValue = null;
global.hasSendMailError = false;

//uncomment if https
// const server = require('https').createServer({
// 	key: fs.readFileSync(config.path_cert_key),
// 	cert: fs.readFileSync(config.path_cert)
//
// },app);
const server = require('http').createServer(app)
const io = require('socket.io')(server, {
	'maxHttpBufferSize': '1e8'
});

spawn('ffmpeg',['-h']).on('error',function(){
	console.error("FFMpeg not found in system cli; please install ffmpeg properly or make a softlink to ./!");
	process.exit(-1);
});

const cas = new CASAuthentication({
	cas_url         : config.cas_url,
	service_url     : config.service_url,
});

const session = require("express-session")({
	secret: config.session_secret_key,
	resave: false,
	saveUninitialized: false
});

app.use(session);
io.use((socket, next) => {
	session(socket.request, socket.request.res || {}, next);
});

app.get( '/', cas.bounce );
app.get( '/index.html', cas.bounce );
app.get( '/logout', cas.logout );

app.use(express.static(__dirname + "/static/"));


io.on('connection', async function (socket) {
	const session = socket.request.session;

	socket.on('debitValue', function (debit) {
		debitValue = debit;
	});

	let isMonitor = 'noSelect';
	socket.on('isMonitor', function (isMonitorSelect) {
		isMonitor = isMonitorSelect;
	});

	socket.emit('clientConfig', config.client_config);
	socket.emit('moodle', config.moodle_url);

	if (config.enable_maintenance_mod === "true")
		socket.emit('info_maintenance_mod', config.info_maintenance_mod);

	let ffmpeg_process, feedStream = false;
	let ffmpeg_process2, feedStream2 = false;
	let hasCheckFileIsWrite = false, hasCheckFileIsWrite2 = false;

	// if(typeof socket.handshake.session.cas_user !== 'undefined' ) {
	if (session && session.cas_user !== 'undefined') {
		const agent = parseUserAgent(socket);
		const uid = session.cas_user;
		const socketissued = socket.handshake.issued;
		const basePath = config.path_folder_record + uid + '/' + socketissued + '/' + socketissued;

		try {
			//on check si l'user est co via cas, et on créer un folder si existe pas
			fs.existsSync(config.path_folder_record + uid) || fs.mkdirSync(config.path_folder_record + uid);
		} catch (err) {
			await sendEmailError('error create new folder user' + err, uid + ' / ' + agent);
			console.error(getDateNow() + ' : ' + err);
		}

		socket.on('start', async function (m, resDesktop = null, resWebCam = null) {

			fs.mkdirSync(config.path_folder_record + uid + '/' + socketissued + '/');

			socket.emit('socketissuedValue', socketissued);

			if (ffmpeg_process || feedStream || ffmpeg_process2 || feedStream2) {
				socket.emit('fatal', 'stream already started.');
				return;
			}
			const BASE_OPS = [
				'-loglevel', 'error',
				'-i', '-',
				'-c:v', 'copy',
				'-use_wallclock_as_timestamps', '1',
				'-threads', '0',
				'-f', 'webm',
			];

			const ops = [
				...BASE_OPS,
				'-b:a', '96k',
				basePath + '.webm'
			];

			let screenAudioFlags;
			if (m === 'video-and-desktop') {
				screenAudioFlags = ['-c:a', 'copy'];
			}
			/* else if (m === 'onlydesktop') {
				screenAudioFlags = ['-an'];
			} */
			else {
				screenAudioFlags = ['-b:a', '96k'];
			}

			const ops2 = [
				...BASE_OPS,
				...screenAudioFlags,
				basePath + 'screen.webm'
			];

			if (m !== 'onlyaudio') {
				let iWebCam = 6;
				getRate('webcam', resWebCam).forEach(function (element) {
					ops.splice(iWebCam, 0, element);
					iWebCam++;
				});
				let iDesktop = 6;
				getRate('desktop', resDesktop).forEach(function (element) {
					ops2.splice(iDesktop, 0, element);
					iDesktop++;
				});
			}

			if (m === 'video-and-desktop' || m === 'audio-and-desktop' || m === 'onlyaudio' || m === 'onlydesktop') {
				ffmpeg_process2 = spawn('ffmpeg', ops2);
				feedStream2 = function (data) {
					ffmpeg_process2.stdin.write(data);
				};
				ffmpeg_process2.stderr.on('data', function (d) {
					socket.emit('ffmpeg_stderr', '' + d);
					if (!hasCheckFileIsWrite2)
						setTimeout(function () {
							hasCheckFileIsWrite2 = true;
							checkIsFileIsWrite(socket, config.path_folder_record + uid + '/' + socketissued + '/', m, agent);
						}, 180000);
				});
				ffmpeg_process2.on('error', function (e) {
					console.log('child process error' + e);
					sendEmailError('ffmpeg child process error' + e, uid + ' / ' + agent);
					socket.emit('fatal', 'ffmpeg error!' + e);
					feedStream2 = false;  // ← corrigé : était feedStream au lieu de feedStream2
					socket.disconnect();
				});
				ffmpeg_process2.on('exit', function (e) {
					console.log('child process desktop exit - ' + uid + ' - ' + socketissued + ' - status ' + e);
					if (m === 'onlyaudio' || m === 'onlydesktop' || m === 'audio-and-desktop') {
						if (m === 'onlyaudio')
							uploadFile(socket, false, true, true);
						else
							uploadFile(socket, false, true, false, true);
					}
				});
			}

			if (m === 'video-and-desktop' || m === 'onlyvideo') {
				ffmpeg_process = spawn('ffmpeg', ops);
				feedStream = function (data) {
					ffmpeg_process.stdin.write(data);
				};
				ffmpeg_process.stderr.on('data', function (d) {
					socket.emit('ffmpeg_stderr', '' + d);
					if (!hasCheckFileIsWrite)
						setTimeout(function () {
							hasCheckFileIsWrite = true;
							checkIsFileIsWrite(socket, config.path_folder_record + uid + '/' + socketissued + '/', m, agent);
						}, 180000);
				});
				ffmpeg_process.on('error', function (e) {
					console.log('child process error' + e);
					sendEmailError('ffmpeg child process error' + e, uid + ' / ' + agent);
					socket.emit('fatal', 'ffmpeg error!' + e);
					feedStream = false;
					socket.disconnect();
				});
				ffmpeg_process.on('exit', function (e) {
					console.log('child process video exit - ' + uid + ' - ' + socketissued + ' - status ' + e);
					if (m === 'video-and-desktop')
						uploadFile(socket, true);
					else
						uploadFile(socket, false);
				});
			}

			try {
				fs.writeFileSync(logFileEvents, 'startrec;' + uid + ';' + getDateNow() + ';' + socketissued + ';' + m + ';ismonitor=>' + isMonitor + ';' + debitValue + 'Mbps' + ';"' + agent + '"' + "\n", {flag: 'a'});
			} catch (err) {
				await sendEmailError('error write logFileEvents' + err, uid + ' / ' + agent);
				console.error(getDateNow() + ' : ' + err);
			}
		});

		socket.on('binarystreamvideo', function (m) {
			if (!feedStream) {
				try {
					socket.emit('fatal', 'ffmpep not processing video.');
					ffmpeg_process.stdin.end();
					ffmpeg_process.kill('SIGINT');
				} catch (e) {
					console.warn('End ffmpeg not processing failed video...');
				}
			} else {
				if (typeof feedStream === "function") {
					try {
						feedStream(m);
					} catch (e) {
						sendEmailError('feedStream error:' + e, uid + ' / ' + agent);
					}
				} else {
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
				} catch (e) {
					console.warn('End ffmpeg2 not processing failed desktop...');
				}
			} else {
				if (typeof feedStream2 === "function") {
					try {
						feedStream2(m);
					} catch (e) {
						sendEmailError('feedStream2 error:' + e, uid + ' / ' + agent);
					}
				} else {
					socket.emit('errorffmpeg');
					socket.disconnect();
				}
			}
		});
		socket.on('infos', function (m) {
			session.usermediadatas = m;
		});
		socket.on('stop', function (m) {
			if (m === 'video-and-desktop' || m === 'onlyvideo') {
				feedStream = false;
				if (ffmpeg_process) {
					try {
						ffmpeg_process.stdin.end();
					} catch (e) {
						sendEmailError('End ffmpeg process attempt failed ' + e, uid + ' / ' + agent);
						console.warn('End ffmpeg process attempt failed...');
					}
				}
			}
			if (m === 'video-and-desktop' || m === 'audio-and-desktop' || m === 'onlyaudio' || m === 'onlydesktop') {
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
				fs.writeFileSync(logFileEvents, 'stoprec;' + uid + ';' + getDateNow() + ';' + socketissued + ';' + m + ';ismonitor=>' + isMonitor + ';' + agent + '"' + "\n", {flag: 'a'});
			} catch (err) {
				sendEmailError('error write logFileEvents' + err, uid + ' / ' + agent);
				console.error(getDateNow() + ' : ' + err)
			}
		});
		socket.on('disconnect', function () {
			feedStream = false;
			feedStream2 = false;
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
			sendEmailError('socket.io error:' + e, uid + ' / ' + agent)
		});

		socket.on('zipfiles', async function (fusion, idSocket = null) {
			const JSZip = require("jszip");
			const zip = new JSZip();

			let socketTmp = socketissued;

			if (idSocket != null)
				socketTmp = idSocket;

			const webcamMedia = config.path_folder_record + uid + '/' + socketTmp + '/' + socketTmp + '.webm';
			const screenMedia = config.path_folder_record + uid + '/' + socketTmp + '/' + socketTmp + 'screen.webm';
			const metadataXML = config.path_folder_record + uid + '/' + socketTmp + '/metadata.xml';

			try {
				if (fs.existsSync(webcamMedia))
					zip.file(socketTmp + '.webm', fs.createReadStream(webcamMedia));
			} catch (err) {
				await sendEmailError('zip file' + err, uid + ' / ' + agent);
				console.error(getDateNow() + ' : ' + err);
			}

			try {
				if (fs.existsSync(screenMedia))
					zip.file(socketTmp + 'screen.webm', fs.createReadStream(screenMedia));
			} catch (err) {
				await sendEmailError('zip file' + err, uid + ' / ' + agent);
				console.error(getDateNow() + ' : ' + err);
			}

			try {
				if (fs.existsSync(metadataXML))
					zip.file('metadata.xml', fs.createReadStream(metadataXML));
			} catch (err) {
				await sendEmailError('zip file' + err, uid + ' / ' + agent);
				console.error(getDateNow() + ' : ' + err);
			}

			if (fusion && (fs.existsSync(webcamMedia) && fs.existsSync(screenMedia))) //si deux flux alors on merge
			{

				const width = 1920;
				const height = 1080;
				const videowidth = 640;
				const slidewidth = 1280;
				const leftmargin = 0;

				try {
					await runFFmpeg([
						'-loglevel', 'error',
						'-i', screenMedia,
						'-i', webcamMedia,
						'-filter_complex',
						`[0]scale=${slidewidth}:-1:force_original_aspect_ratio=decrease,` +
						`pad=${width}:${height}:${leftmargin}:(${height}-ih)/2 [LEFT];` +
						`[1]scale=${videowidth}:-1:force_original_aspect_ratio=decrease [RIGHT];` +
						`[LEFT][RIGHT]overlay=${slidewidth}:(main_h/2)-(overlay_h/2)`,
						'-c:v', 'libx264',
						'-c:a', 'aac',
						'-r', '25',
						'-ac', '1',
						'-crf', '23',
						'-preset', 'fast',
						'-threads', '0',
						'-s', `${width}x${height}`,
						basePath + 'merged.mp4'
					], null, 'merge');

					// Code du .on("end") — exécuté séquentiellement après le await
					const mergedPath = `${config.path_folder_record}${uid}/${socketTmp}/${socketTmp}merged.mp4`;
					const zipPath = `${config.path_folder_record}${uid}/${socketTmp}/${socketTmp}.zip`;

					zip.file(`${socketTmp}merged.mp4`, fs.createReadStream(mergedPath));

					await new Promise((resolve, reject) => {
						zip.generateNodeStream({type: 'nodebuffer', streamFiles: true})
							.pipe(fs.createWriteStream(zipPath))
							.on('finish', resolve)
							.on('error', reject);
					});

					socket.emit('endzip', fs.readFileSync(zipPath), socketTmp);

				} catch (er) {
					console.log("error occured: " + er.message);
				}
			} else {
				zip.generateNodeStream({type: 'nodebuffer', streamFiles: true})
					.pipe(fs.createWriteStream(config.path_folder_record + uid + '/' + socketTmp + '/' + socketTmp + '.zip'))
					.on('finish', function () {
						socket.emit('endzip', fs.readFileSync(config.path_folder_record + uid + '/' + socketTmp + '/' + socketTmp + '.zip'), socketTmp);
					});
			}
		});

		if (session && session.cas_user) {
			try {
				// getLdapInfos retourne maintenant un objet { displayName, mail, clfdstatus }
				const {displayName, mail, clfdstatus} = await getLdapInfos(session.cas_user);

				session.cn = displayName;
				session.mail = mail;
				session.isEtudiant = clfdstatus === '0' || clfdstatus === '1';
				socket.emit('displayName', displayName);
				socket.emit('isEtudiant', session.isEtudiant);

				// Promisification de getListSeries (callback → await)
				const listSeries = await new Promise(resolve => getListSeries(socket, resolve));

				// Le for...of avec await remplace le new Promise(async function) imbriqué
				for (const serie of listSeries) {
					if (serie['title'][0].match('^[a-zA-Z0-9_]+$') !== null && serie['title'][0] !== uid) {
						const {displayName: serieDisplayName} = await getLdapInfos(serie['title'][0]);
						if (serieDisplayName !== '')
							serie['title'][0] = 'Bibliothèque de : ' + serieDisplayName;
					}
				}

				socket.emit('listseries', listSeries, uid, session.mail);

				if (typeof socket.handshake.headers.referer !== 'undefined' &&
					socket.handshake.headers.referer.indexOf('serieid') > -1) {
					const infos = socket.handshake.headers.referer.split('?');
					if (infos[1])
						socket.emit('insidemoodle', infos[1]);
				}

			} catch (err) {
				console.error('getLdapInfos error:', err.message);
			}
		}
	}
});

io.on('error',function(e){
	console.log('socket.io error:'+e);
});

server.listen(80, function(){
	console.log('http and websocket listening on *:80');
});


process.on('uncaughtException', function(err) {
	// handle the error safely
	console.log(err)
	// Note: after client disconnect, the subprocess will cause an Error EPIPE, which can only be caught this way.
});


function runFFmpeg(args, inputStream, label) {
	return new Promise((resolve, reject) => {
		const proc = spawn('ffmpeg', args);

		if (inputStream) {
			inputStream.pipe(proc.stdin);
			proc.stdin.on('error', () => {}); // évite crash si ffmpeg ferme stdin tôt
		}

		let stderr = '';
		proc.stderr.on('data', d => { stderr += d.toString(); });

		proc.on('close', (code) => {
			if (code === 0) {
				console.log(`End ffmpeg ${label} success`);
				resolve();
			} else {
				console.error(`End ffmpeg ${label} failed (code ${code}):`, stderr.slice(-300));
				reject(new Error(`ffmpeg ${label} exited with code ${code}`));
			}
		});

		proc.on('error', reject);
	});
}


function ffprobe(filePath) {
	return new Promise((resolve, reject) => {
		const proc = spawn('ffprobe', [
			'-v', 'quiet',
			'-print_format', 'json',
			'-show_streams',
			'-show_format',
			filePath
		]);

		let stdout = '';
		let stderr = '';
		proc.stdout.on('data', d => { stdout += d.toString(); });
		proc.stderr.on('data', d => { stderr += d.toString(); });

		proc.on('close', (code) => {
			if (code !== 0) {
				reject(new Error(`ffprobe failed (code ${code}): ${stderr}`));
				return;
			}
			try {
				resolve(JSON.parse(stdout));
			} catch (e) {
				reject(new Error('ffprobe: JSON parse error: ' + e.message));
			}
		});

		proc.on('error', reject);
	});
}

/**
 * @param socket
 * @returns {{os: *, engine: *, browser: *, cpu: *, ua: *, device: *}}
 */
function parseUserAgent(socket) {
	const userAgentString = socket.request.headers['user-agent'] || '';
	const parser = new useragent(userAgentString);
	const infoAgent = parser.getResult();
	return `${infoAgent.browser.name || ''} ${infoAgent.browser.version || ''} / ` +
		`${infoAgent.os.name || ''} ${infoAgent.os.version || ''} / ` +
		`${infoAgent.device.type || 'desktop'}`;
}

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
	const session = socket.request.session;

	if(session &&  session.usermediadatas !== 'undefined') {
		//on test si c'est pas undefined  ?
		const usermediainfosToUpload = JSON.parse(session.usermediadatas);
		const agent = parseUserAgent(socket);

		const d = new Date();
		const startDate = d.getFullYear() + '-' + ("0" + (d.getMonth() + 1)).slice(-2) + '-' + ("0" + d.getDate()).slice(-2);
		const startTime = d.getUTCHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();

		const idFileUpload = socket.handshake.issued;
		const uid = session.cas_user;
		const mustBeUpload = usermediainfosToUpload.mustBeUpload;
		let desc = 'N/R';
		let typeOfFlavor = "presenter";
		if(usermediainfosToUpload.descUpload !== '')
			desc = usermediainfosToUpload.descUpload;
		let location = 'N/R';
		if(usermediainfosToUpload.locationUpload !== '')
			location = usermediainfosToUpload.locationUpload;

		let nameFile = uid + '/' + idFileUpload + '/' + idFileUpload + ".webm";

		if(onlySecondStream)
			nameFile = uid + '/' + idFileUpload + '/' + idFileUpload + "screen.webm";

		//on check si l'user à select une serie ou son dossier, si son dossier et exist pas alors on le créer
		createSerie(uid, socket, usermediainfosToUpload.idSerie, mustBeUpload).then( async function (idSerie) {

			usermediainfosToUpload.idSerie = idSerie;

			let pathMediaToFFprobe;
			if (hasSecondStream || onlySecondStream)
				pathMediaToFFprobe = config.path_folder_record + uid + '/' + idFileUpload + '/' + idFileUpload + "screen.webm";
			else
				pathMediaToFFprobe = config.path_folder_record + nameFile;

			//on récup la duration du média
			let duration = '00:00:00';
			try {
				const metadataFFprobe = await ffprobe(pathMediaToFFprobe);

				let typeEncode = '';
				metadataFFprobe.streams.forEach(obj => {
					if (obj.codec_type === 'video') typeEncode = obj.codec_name;
				});


				duration = new Date(metadataFFprobe.format.duration * 1000)
					.toISOString()
					.substr(11, 8);

				let metadata = getMetadatasNewEvent(usermediainfosToUpload, desc, startDate, startTime, duration, location);
				const metadataXML = js2xmlparser.parse("media", JSON.parse(metadata)[0]);

				try {
					fs.writeFileSync(`${config.path_folder_record}${uid}/${idFileUpload}/metadata.xml`, metadataXML);
				} catch (err) {
					await sendEmailError('write file metadata' + err, `${uid} / ${agent}`);
					console.error(getDateNow() + ' : ' + err);
				}

				if (mustBeUpload) {
					let processing;
					if (isAudioFile) {
						processing = `{\n  "workflow": "${config.opencast_workflow_audio}"\n}`;
					} else {
						processing = `{\n  "workflow": "${config.opencast_workflow}",\n  "configuration": {\n    "typeEncode": "${typeEncode}"\n  }\n}`;
					}

					if (onlydesktop) typeOfFlavor = "presentation";

					const data = new FormData();

					if (hasSecondStream) {
						data.append('presenter', fs.createReadStream(`${config.path_folder_record}${uid}/${idFileUpload}/${idFileUpload}.webm`), {filename: `metadata/${idFileUpload}.webm`});
						data.append('presentation', fs.createReadStream(`${config.path_folder_record}${uid}/${idFileUpload}/${idFileUpload}screen.webm`), {filename: `metadata/${idFileUpload}screen.webm`});
					} else if (!hasSecondStream && typeOfFlavor === "presenter" && !isAudioFile) {
						data.append('presenter', fs.createReadStream(`${config.path_folder_record}${uid}/${idFileUpload}/${idFileUpload}.webm`), {filename: `metadata/${idFileUpload}.webm`});
					} else if (isAudioFile) {
						data.append('presenter', fs.createReadStream(`${config.path_folder_record}${uid}/${idFileUpload}/${idFileUpload}screen.webm`), {filename: `metadata/${idFileUpload}screen.webm`});
					} else {
						data.append('presentation', fs.createReadStream(`${config.path_folder_record}${uid}/${idFileUpload}/${idFileUpload}screen.webm`), {filename: `metadata/${idFileUpload}screen.webm`});
					}

					data.append('acl', getAclNewEvent(uid));
					data.append('metadata', metadata);
					data.append('processing', processing);

					await axios({
						method: 'POST',
						url: config.opencast_events_url,
						headers: {
							'cache-control': 'no-cache',
							'Authorization': 'Basic ' + config.opencast_authentication,
							'content-type': 'multipart/form-data;',
							...data.getHeaders()
						},
						data,
						maxContentLength: Infinity,
						maxBodyLength: Infinity
					});

					socket.emit('endupload', 1);

				} else {
					socket.emit('endupload', 0);
				}

			} catch (e) {
				await sendEmailError(' errorrec ' + e, `${uid} / ${agent}`);
			}
		});
		socket.emit('idRecord', session.cas_user, socket.handshake.issued);
	}
}

/**
 * @param uid
 * @returns {string}
 */
function getAclNewEvent(uid)
{
	return '[\n' +
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

}


/**
 * @param usermediainfosToUpload
 * @param desc
 * @param startDate
 * @param startTime
 * @param duration
 * @param location
 * @returns {string}
 */
function getMetadatasNewEvent(usermediainfosToUpload, desc, startDate, startTime, duration, location)
{

	return '[\n' +
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
}

/**
 * Permet de récupérer des infos ldap en fonction d'un uid
 * @param uid
 */
async function getLdapInfos(uid) {
	const client = new Client({
		url: config.path_ldap_uca
	});

	try {
		await client.bind('', ''); // bind anonyme — retire si ton LDAP n'en a pas besoin

		const { searchEntries } = await client.search('ou=people,dc=uca,dc=fr', {
			scope: 'sub',
			filter: `(uid=${uid})`,
			attributes: ['sn', 'cn', 'displayName', 'mail', 'CLFDstatus'],
		});

		const entry = searchEntries[0] ?? {};
		return {
			displayName: entry.displayName ?? '',
			mail:        entry.mail        ?? '',
			clfdstatus:  entry.CLFDstatus  ?? '',
		};

	} finally {
		await client.unbind(); // toujours exécuté, même en cas d'erreur
	}
}

/**
 * @param socket
 * @param callback
 */
function getListSeries(socket, callback)
{
	const session = socket.request.session;
	if (session && session.cas_user) {
		const uid = session.cas_user.toUpperCase();
		const data = JSON.stringify({
			"query": {
				"bool": {
					"must": [
						{"term": {"acl_permission_write": "ROLE_USER_LDAP_" + uid}}
					]
				}
			}
		});

		let httpsAgent = null;
		if (config.opencast_series_ES_url_CERT !== '') {
			httpsAgent = require('https').Agent({
				ca: fs.readFileSync(config.opencast_series_ES_url_CERT)
			});
		}

		const configES = {
			method: 'get',
			url: config.opencast_series_ES_url,
			headers: {'Content-Type': 'application/json'},
			data: data,
			httpsAgent: httpsAgent
		};

		axios(configES)
			.then(function (response) {
				callback(response.data.hits.hits.map(function (hit) {
					return hit._source
				}).sort(function (a, b) {
					const titleA = a.title[0].toUpperCase();
					const titleB = b.title[0].toUpperCase();
					return (titleA < titleB) ? -1 : (titleA > titleB) ? 1 : 0;
				}));
			})
			.catch(function (error) {
				throw new Error(error);
			});
	}
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
	let i = 0, len = listSeries.length;
	for (; i < len; i++) {
		let rst;
		rst = await checkSerieAcl(uid, listSeries[i]);
		if(typeof rst !== 'undefined' && rst.title !== uid.toLowerCase()+'_inwicast_medias')
			result.push(rst);
	}

	result.sort(function (a, b) {
		const titleA = a.title.toUpperCase();
		const titleB = b.title.toUpperCase();
		return (titleA < titleB) ? -1 : (titleA > titleB) ? 1 : 0;
	});

	return result;
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
		const options = {
			method: 'GET',
			url: config.opencast_series_url + '/' + serieinfo.identifier + '/acl',
			rejectUnauthorized: false,
			headers: {
				'cache-control': 'no-cache',
				Authorization: 'Basic ' + config.opencast_authentication
			}
		};

		axios.request(options)
			.then(function (listSeries2) {
				let serieInfo;
				serieInfo =listSeries2.data;
				let j = 0, len = serieInfo.length;
				for (; j < len; j++)
					if (serieInfo[j].action === 'write' && serieInfo[j].allow === true && serieInfo[j].role.indexOf(uid) > -1)
						resolve(serieinfo);
				resolve();
			})
			.catch(function (error) {
				console.log(error);
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
			const session = socket.request.session;
			let realUserName = uid;
			if(session.isEtudiant)
				uid = 'etd_'+uid;

			let idSerieMyFolder = null;
			getListSeries(socket, function (listSeries) {
				listSeries.forEach(function (serie) {
					if(serie.title === uid ||  serie.title === realUserName)
						idSerieMyFolder = serie.identifier;
				});

				if(idSerieMyFolder !== null)
					resolve(idSerieMyFolder);
				else
				{
					const FormData = require('form-data');
					const data = new FormData();
					data.append('acl', getAclSerie(realUserName));
					data.append('metadata', getMetadatasSerie(uid, socket));

					const options = {
						method: "POST",
						url: config.opencast_series_url,
						ca: fs.readFileSync(config.opencast_cert),
						headers:
							{
								'cache-control': 'no-cache',
								'Authorization': 'Basic ' + config.opencast_authentication,
								'content-type': 'multipart/form-data;',
								...data.getHeaders()
							},
						data: data
					};

					axios(options)
						.then(function (response) {
							resolve(response.data.identifier);
						})
						.catch(function (error) {
							console.log(error);
						});
				}
			});
		}
		else
			resolve(idSerieSelect);
	});
}

/**
 * @param uid
 * @returns {string}
 */
function getAclSerie(uid)
{
	return '[\n' +
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
}

/**
 * @param uid
 * @param socket
 * @returns {string}
 */
function getMetadatasSerie(uid, socket)
{
	const session = socket.request.session;

	return '[\n' +
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
		'        "value": "' + session.mail + '"\n' +
		'      }\n' +
		'    ]\n' +
		'  }\n' +
		']';
}

/**
 *
 * @param socket
 * @param path
 * @param typeOfRec
 * @param agent
 */
async function checkIsFileIsWrite(socket, path, typeOfRec, agent) {
	const uid = socket.request.session.cas_user;
	const socketissued = socket.handshake.issued;
	const recordDir = config.path_folder_record + uid + '/' + socketissued + '/';
	const basePath  = recordDir + socketissued;

	async function failRecording(reason) {
		try {
			fs.writeFileSync(logFileEvents,
				`errorrec;${uid};${getDateNow()};${socketissued};${typeOfRec};"${agent}"\n`,
				{ flag: 'a' }
			);
		} catch (err) {
			await sendEmailError('ffmpeg errorrec ' + err, uid + ' / ' + agent);
			console.error(getDateNow() + ' : ' + err);
		}
		socket.emit('errorffmpeg');
		socket.disconnect();
	}

	try {
		const files = await fs.promises.readdir(recordDir);

		if (!files.length) {
			return failRecording('empty dir');
		}

		if (typeOfRec === 'video-and-desktop') {
			const screenExists = fs.existsSync(basePath + 'screen.webm');
			const videoExists  = fs.existsSync(basePath + '.webm');
			if (!screenExists || !videoExists) {
				return failRecording('missing webm files');
			}
		}

	} catch (err) {
		await sendEmailError('file length error ' + err, uid + ' / ' + agent);
		console.error(getDateNow() + ' : ' + err);
	}
}

/**
 * @returns {string}
 */
function getDateNow() {
	const dateNowTmp = new Date();
	return dateNowTmp.getDate() + '-' + (dateNowTmp.getMonth() + 1) + '-' + dateNowTmp.getFullYear() + ';' + dateNowTmp.getHours() + ':' + dateNowTmp.getMinutes() + ':' + dateNowTmp.getSeconds();
}

/**
 * @param err
 * @param user
 */
async function sendEmailError(err, user) {
	if (!hasSendMailError) {
		try {
			await transporter.sendMail({
				from:    config.mail_from,
				to:      config.mail_to,
				subject: '[Warn] UCAStudio Error',
				text:    `Une erreur a été détectée\nDate : ${getDateNow()}\nUser : ${user}\nErreur : \n${err}`
			});
		} catch (error) {
			console.log(error);
		}

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
	let rateValue;

	if(type === 'webcam') {
		switch (reso) {
			case 'nhd':
			case 'vga':
				rateValue = ['-maxrate', '1000k', '-bufsize', '1500k'];
				break;
			case 'qhd':
			case 'svga':
				rateValue = ['-maxrate', '1500k', '-bufsize', '2000k'];
				break;
			case 'hd':
				rateValue = ['-maxrate', '2500k', '-bufsize', '3000k'];
				break;
			case 'xga':
				rateValue = ['-maxrate', '2060k', '-bufsize', '2560k'];
				break;
			case 'hdplus':
				rateValue = ['-maxrate', '3500k', '-bufsize', '4000k'];
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
				rateValue = ['-maxrate', '1500k', '-bufsize', '2000k'];
				break;
			case 'hd':
				rateValue = ['-maxrate', '2500k', '-bufsize', '3000k'];
				break;
			case 'hdplus':
				rateValue = ['-maxrate', '3500k', '-bufsize', '4000k'];
				break;
			default:
				rateValue = [];
		}
	}

	return 	rateValue;
}
