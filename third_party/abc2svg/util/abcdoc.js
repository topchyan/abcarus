//#javascript
// abcdoc-1.js file to include in html pages with abc2svg-1.js
//
// Copyright (C) 2014-2021 Jean-Francois Moine
//
// This file is part of abc2svg.
//
// abc2svg is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// abc2svg is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with abc2svg.  If not, see <http://www.gnu.org/licenses/>.

    var user

(function(){

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

// function called when abc2svg is fully loaded
function abcdoc() {
    var	errtxt = '',
	new_page = '',
	page,				// document source
	jsdir = document.currentScript ?
		    document.currentScript.src.match(/.*\//) :
		    (function() {
		     var s_a = document.getElementsByTagName('script')
			for (var k = 0; k < s_a.length; k++) {
				if (s_a[k].src.indexOf('abcdoc-') >= 0)
					return s_a[k].src.match(/.*\//) || ''
			}
			return ""	// ??

	})()
    user = {	// -- abc2svg init argument
	errmsg: function(msg, l, c) {	// get the errors
		errtxt += clean_txt(msg) + '\n'
	},
	img_out: function(str) {	// image output
		new_page += str
	}
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

// function to load javascript files
	abc2svg.loadjs = function(fn, relay, onerror) {
		var s = document.createElement('script')
		if (/:\/\//.test(fn))
			s.src = fn		// absolute URL
		else
			s.src = jsdir + fn
		s.onload = relay
		s.onerror = function() {
			if (onerror)
				onerror(fn)
			else
				alert('error loading ' + fn)
		}
		document.head.appendChild(s)
	}

    // search the ABC tunes and add their rendering as SVG images
    function render() {
    var	i = 0, j, k, res, re,
	re_stop = /\n<|\n%.begin/g,	// stop on "<" and skip "%%begin"
	abc = new abc2svg.Abc(user);

	// get the ABC insertion mode
	if (page.indexOf('<script type="text/vnd.abc"') >= 0)
		re = /<script type="text\/vnd.abc"/g
	else
		re = /\n%abc|\nX:/g

	for (;;) {

		// get the start of a ABC sequence
		res = re.exec(page)
		if (!res)
			break
		j = re.lastIndex - res[0].length;
		new_page += page.slice(i, j);
		if (page[j] == '<') {		// ABC start on <script .. vnd.abc ..>
			j = page.indexOf(">", re.lastIndex) + 2
			k = page.indexOf("</script>", j)
			tune = page.slice(j, k)
			k += 10
		} else {

			// get the end of the ABC sequence
			// including the %%beginxxx/%%endxxx sequences
			re_stop.lastIndex = ++j
			while (1) {
				res = re_stop.exec(page)
				if (!res || res[0] == "\n<")
					break
				k = page.indexOf(res[0].replace("begin", "end"),
						re_stop.lastIndex)
				if (k < 0)
					break
				re_stop.lastIndex = k
			}
			if (!res || k < 0)
				k = page.length
			else
				k = re_stop.lastIndex - 2
			tune = page.slice(j, k)
		}
		new_page += '<pre style="display:inline-block; vertical-align: top">' +
				clean_txt(tune) +
				'</pre>\n\
<div style="display:inline-block; vertical-align: top">\n'
// not "float:right"
		try {
			abc.tosvg('abcdoc', tune)
		} catch (e) {
			alert("abc2svg javascript error: " + e.message +
				"\nStack:\n" + e.stack)
		}
		if (errtxt) {
			i = page.indexOf("\n", j);
			i = page.indexOf("\n", i + 1);
			alert("Errors in\n" +
				page.slice(j, i) +
				"\n...\n\n" + errtxt);
			errtxt = ""
		}
		abc2svg.abc_end();	// close the page if %%pageheight
		new_page += '</div><br/>\n';
		i = k
		if (k >= page.length)
			break
		re.lastIndex = i
	}

	try {
		document.body.innerHTML = new_page + page.slice(i)
	} catch (e) {
		alert("abc2svg bad generated SVG: " + e.message +
			"\nStack:\n" + e.stack)
	}
    } // render()

	// --- abcdoc() main code ---

	// get the page content
	page = document.body.innerHTML;

	// accept page formatting
	abc2svg.abc_end = function() {}

	// load the required modules, then render the music
	if (abc2svg.modules.load(page, render))
		render()
} // abcdoc()

// loop until abc2svg is fully loaded
function dom_loaded() {
	if (typeof abc2svg != "object"
	 || !abc2svg.modules) {
		setTimeout(dom_loaded, 500)
		return
	}
	abcdoc()
}

// wait for the page to be loaded
document.addEventListener("DOMContentLoaded", dom_loaded, false)
})()
