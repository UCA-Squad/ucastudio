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
	if(typeof socket.handshake.headers.referer !== 'undefined' && socket.handshake.headers.referer.indexOf('moodle') > -1)
		socket.emit('insidemoodle', true);

	var today = new Date();
	today.setHours(today.getHours() - 2);
	var startTime = today.getHours() + ':' + today.getMinutes();
	var dd = String(today.getDate()).padStart(2, '0');
	var mm = String(today.getMonth() + 1).padStart(2, '0'); //January is 0!
	var yyyy = today.getFullYear();
	var startDate = yyyy + '-' + mm + '-' + dd;

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

	if(typeof socket.handshake.session.cas_user !== 'undefined' ) {

		socket.on('start', function (m) {

			if (ffmpeg_process || feedStream) {
				socket.emit('fatal', 'stream already started.');
				return;
			}
			var ops = [
				'-re', '-i', '-',
				'-c:v', 'copy', '-preset', 'veryfast',
				'-b:a', '128k', '-strict', '-2',
				'./records/' + socket.handshake.issued + '.webm'
			];

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
				console.log('child process exit' + e);
				socket.emit('fatal', 'ffmpeg exit!' + e);
				uploadFile(socket);
			});
		});

		socket.on('binarystream', function (m) {
			if (!feedStream) {
				socket.emit('fatal', 'ffmpep not processing.');
				ffmpeg_process.stdin.end();
				return;
			}
			feedStream(m);
		});
		socket.on('infos', function (m) {
			socket.handshake.session.usermediadatas = m;
		});
		socket.on('stop', function (m) {
			feedStream = false;
			if (ffmpeg_process) {
				try {
					ffmpeg_process.stdin.end();
				} catch (e) {
					console.warn('End ffmpeg process attempt failed...');
				}
			}
		});
		socket.on('disconnect', function () {
			feedStream = false;
			if (ffmpeg_process)
				try {
					ffmpeg_process.kill('SIGINT');
				} catch (e) {
					console.warn('killing ffmpeg process attempt failed...');
				}
		});
		socket.on('error', function (e) {
			console.log('socket.io error:' + e);
		});

		getListSeries(socket, function (displayName) {
			socket.emit('listseries', displayName);
		});
		getLdapInfos(socket.handshake.session.cas_user, function (displayName) {
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
 * Permet d'uploader un média
 * @param socket
 */
function uploadFile(socket)
{
	if(socket.handshake.session.usermediadatas !== 'undefined') {
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
			'        "value": "[' + socket.handshake.session.cn + ']"\n' +
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
				socket.disconnect(); //?? à set ailleur ?
				throw new Error(error);
			} else {
				// var obj = JSON.parse(body);
				// console.log(body);
				socket.emit('endupload');

			}
		});
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
