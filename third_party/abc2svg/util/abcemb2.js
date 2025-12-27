//#javascript
// abcemb2-1.js file to include in html pages with abc2svg-1.js
//
// Copyright (C) 2018-2019 Jean-Francois Moine
//
// This file is part of abc2svg.
//
// abc2svg is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// abc2svg is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with abc2svg.  If not, see <http://www.gnu.org/licenses/>.

window.onerror = function(msg, url, line) {
	if (typeof msg == 'string')
		alert("window error: " + msg +
			"\nURL: " + url +
			"\nLine: " + line)
	else if (typeof msg == 'object')
		alert("window error: " + msg.type + ' ' + msg.target.src)
	else
		alert("window error: " + msg)
	return false
}

var	errtxt = '',
	elts,				// ABC HTML elements
	tunes = '',			// source of the ABC sequences
	indx = [],			// indexes of the tunes in tunes
	select,
	playing,
	abcplay,
	playconf = {
		onend: endplay
	},
	a_pe = [],			// index: #sequence, value: playing events
	glop,				// global sequence index for play
	old_gm,
	jsdir = document.currentScript ?
		document.currentScript.src.match(/.*\//) :
		(function() {
		     var s_a = document.getElementsByTagName('script')
			for (var k = 0; k < s_a.length; k++) {
				if (s_a[k].src.indexOf('abcemb2-') >= 0)
					return s_a[k].src.match(/.*\//) || ''
			}
			return ""	// ??
		})(),

// -- abc2svg init argument
    user = {
	errmsg: function(msg, l, c) {	// get the errors
		errtxt += clean_txt(msg) + '\n'
	},
	img_out: function(str) {	// image output
		new_page += str
	},
	page_format: true		// define the non-page-breakable blocks
    }

// replace <>& by XML character references
function clean_txt(txt) {
	return txt.replace(/<|>|&.*?;|&/g, function(c) {
		switch (c) {
		case '<': return "&lt;"
		case '>': return "&gt;"
		case '&': return "&amp;"
		}
		return c
	})
}

function endplay() {
	playing = false
}

// function called on click on the music
function playseq(i) {
    var	outputs

	if (!abcplay) {
		if (typeof AbcPlay == "undefined") { // as play-1.js not loaded,
			playseq = function(){}	     // don't come here anymore
			return
		}
		abcplay = AbcPlay(playconf);
	}
	if (playing) {
		abcplay.stop()
		return
	}
	playing = true
	if (!a_pe[i]) {			// if no playing event
		abc = new abc2svg.Abc(user);

		abcplay.clear();
		abc.tosvg("play", "%%play")
		if (select)
			abc.tosvg('abcemb2', select)
		try {
			if (glop != undefined)
				abc.tosvg("abcemb2", tunes, indx[glop], indx[glop + 1]);
			abc.tosvg("abcemb2-" + i, tunes, indx[i], indx[i + 1])
		} catch(e) {
			alert(e.message + '\nabc2svg tosvg bug - stack:\n' + e.stack);
			playing = false;
			a_pe[seq] = null
			return
		}
		a_pe[i] = abcplay.clear()	// keep the playing events
	}
	abcplay.play(0, 100000, a_pe[i])
}

// function called when the page is loaded
function dom_loaded() {

	// convert HTML to ABC
	function toabc(s) {
		return s.replace(/&gt;/g, '>')
			.replace(/&lt;/g, '<')
			.replace(/&amp;/g, '&')
			.replace(/[ \t]+(%%)/g, '$1')
			.replace(/[ \t]+(.:)/g, '$1')
	}

// function to load javascript files
	abc2svg.loadjs = function(fn, relay, onerror) {
		var s = document.createElement('script');
		if (/:\/\//.test(fn))
			s.src = fn		// absolute URL
		else
			s.src = jsdir + fn;
		s.type = 'text/javascript'
		if (relay)
			s.onload = relay;
		s.onerror = onerror || function() {
			alert('error loading ' + fn)
		}
		document.head.appendChild(s)
	}

	// extract the ABC code
	elts = document.getElementsByClassName('abc')
	for (var i = 0; i < elts.length; i++) {
		var elt = elts[i];
		indx[i] = tunes.length;
		tunes += toabc(elt.innerHTML) + '\n'
	}
	indx[i] = tunes.length;
	ready()
}

function ready() {
    var	i, j, abc

	// load the required modules
	if (!abc2svg.modules.load(tunes, ready))
		return

	// accept page formatting
	abc2svg.abc_end = function() {}

	var sel = window.location.hash.slice(1)
	if (sel)
		select = '%%select ' + decodeURIComponent(sel);

	// aweful hack: user.anno_stop must be defined before Abc creation
	// for being set later by follow() !
	if (typeof follow == "function")
		user.anno_stop = function(){};

	abc = new abc2svg.Abc(user)

	// initialize the play follow function
	if (typeof follow == "function")
		follow(abc, user, playconf)

	// generate and replace
	for (i = 0; i < elts.length; i++) {
		new_page = ""

		// set the playing callback
		j = tunes.indexOf('X:', indx[i])
		if (j >= 0 && j < indx[i + 1])
			new_page += '<div onclick="playseq(' + i + ')">\n'
		else if (glop == undefined)
			glop = i

		if (sel) {
			abc.tosvg('abcemb2', select);
			sel = ''
		}

		try {
			abc.tosvg('abcemb2', tunes, indx[i], indx[i + 1])
		} catch (e) {
			alert("abc2svg javascript error: " + e.message +
				"\nStack:\n" + e.stack)
		}
		if (errtxt) {
			new_page += '<pre style="background:#ff8080">' +
					errtxt + "</pre>\n";
			errtxt = ""
		}
		try {
			elts[i].innerHTML = new_page
		} catch (e) {
			alert("abc2svg bad generated SVG: " + e.message +
				"\nStack:\n" + e.stack)
		}

		if (j >= 0 && j < indx[i + 1])
			new_page += '</div>\n'
		abc2svg.abc_end()		// close the page if %%pageheight
	}

	// prepare for playing
	delete user.img_out;		// stop SVG generation
	old_gm = user.get_abcmodel;
	user.get_abcmodel = function(tsfirst, voice_tb, music_types, info) {
			if (old_gm)
				old_gm(tsfirst, voice_tb, music_types, info);
			abcplay.add(tsfirst, voice_tb)
		}
} // dom_loaded()

// wait for the page to be loaded
window.addEventListener("load", function() {setTimeout(dom_loaded, 500)})
