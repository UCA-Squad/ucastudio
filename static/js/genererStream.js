function genLive() {
	function $_GET(param) {
			var vars = {};
			window.location.href.replace( location.hash, '' ).replace( 
						/[?&]+([^=&]+)=?([^&]*)?/gi, // regexp
						function( m, key, value ) { // callback
										vars[key] = value !== undefined ? value : '';
									}
					);

			if ( param ) {
						return vars[param] ? vars[param] : null;	
					}
			return vars;
	}

	var courseid = $_GET("courseid");
	var email = $_GET("email");
	var data = null;

	var xhr = new XMLHttpRequest();
	xhr.withCredentials = true;

	xhr.addEventListener("readystatechange", function () {
		  if (this.readyState === 4) {
			      console.log(this.responseText);
			    }
	});
	var moodle = $('#moodle').val();
	xhr.open("POST", moodle+"insertLive.php?courseid="+courseid+"&email="+email);
	xhr.setRequestHeader("User-Agent", "PostmanRuntime/7.13.0");
	xhr.setRequestHeader("Accept", "*/*");
	xhr.setRequestHeader("Cache-Control", "no-cache");
	xhr.setRequestHeader("Host", "ent.uca.fr");
	xhr.setRequestHeader("accept-encoding", "gzip, deflate");
	xhr.setRequestHeader("content-length", "");
	xhr.setRequestHeader("Connection", "keep-alive");
	xhr.setRequestHeader("cache-control", "no-cache");

	xhr.send(data);
	document.getElementById("idStream").innerHTML = "Clé du stream : " + courseid +"<br /> URL : rtmp://openstream.dsi.uca.fr/app";
	document.getElementById("email").innerHTML = "Si la section Live n'a pas encore été créée, un mail contenant les informations a été envoyé.";
}
