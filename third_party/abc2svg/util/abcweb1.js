// abcweb1-1.js file to include in html pages for rendering the ABC music
//
// Copyright (C) 2019-2025 Jean-Francois Moine
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
//
// This script either:
// - builds a list of the tunes when there is no selection or
// - displays the selected tune.
//
// When the tune is displayed, if playing is not enabled,
// scrolling the music may be done by clicking/taping
// on the 'start scrolling' button.
//
// The header of the tune list ("Tunes:") may be set in a global
// javascript variable 'list_head'.
// The tail of the tune list ("(all tunes)") may be set in a global
// javascript variable 'list_tail'.

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

// remove the menu button on print
window.onbeforeprint = function() {
   var	e = document.getElementById("dd")
	if (e)
		e.style.display = "none"
}
window.onafterprint = function() {
   var	e = document.getElementById("dd")
	if (e)
		e.style.display = "block"
}

    var user,
	abcplay				// (usable for volume or tempo changes)
if (typeof abc2svg == "undefined")
    var abc2svg = {}

// function called when abc2svg is fully loaded
function dom_loaded() {
    var	abc, e,
	new_page,
	playing,
	tune_dur,			// scroll tune duration
	scroll_to,			// scroll timeout
	dt,				// scroll delta per timeout
	sY,				// current scroll Y

	page,				// document source
	a_inc = {},
	errtxt = '',
	app = "abcweb1",
	playconf = {			// play arguments
		onend: function() {
			playing = false
		}
	},
	tune_lst,	// array of [tsfirst, voice_tb, info, cfmt] per tune
	jsdir = document.currentScript ?
		    document.currentScript.src.match(/.*\//) :
		    (function() {
		     var s_a = document.getElementsByTagName('script')
			for (var k = 0; k < s_a.length; k++) {
				if (s_a[k].src.indexOf(app) >= 0)
					return s_a[k].src.match(/.*\//) || ''
			}
			return ""	// ??
	})()
// end of the variables of dom_loaded()

// -- abc2svg init argument
	user = {
		read_file: function(fn) {
			return a_inc[fn]
		}, // read_file()
		errmsg: function(msg, l, c) {	// get the errors
			errtxt += clean_txt(msg) + '\n'
		},

		// function called before SVG generation
		get_abcmodel: function(tsfirst, voice_tb) {
		    var	d, i, n, pf,
			s = tsfirst

			while (1) {
				if (s.tempo && !pf) {
					d = 0
					n = s.tempo_notes.length
					for (i = 0; i < n; i++)
						d += s.tempo_notes[i]
					pf = d * s.tempo / 60
				}
				if (!s.ts_next)
					break
				s = s.ts_next
			}
			if (!pf)
				pf = abc2svg.C.BLEN / 8	// default: Q:1/4=120
//				     abc2svg.C.BLEN / 4 * 120 / 60
			tune_dur = s.time / pf
		},

		img_out: function(str) {	// image output
			new_page += str
		}
	} // user

	// extract the ABC code from the HTML body
	function fix_abc(s) {
	    var	j,
		i = s.indexOf('<script')

		if (i >= 0) {
			i = s.indexOf('type="text/vnd.abc"', i)
			if (i > 0) {
				i = s.indexOf('\n', i) + 1
				j = s.indexOf('</script', i)
				return s.slice(i, j)
			}
		}
		return s
	} // fix_abc()

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

	// scroll the displayed music
	function do_scroll(old) {
	    var	d, ttop

		// if start, get the window parameters and delay the first scroll
		if (!old) {
			d = document.documentElement

			// time for scrolling one pixel
			dt = tune_dur / d.scrollHeight

			// start scrolling at this time (1/4 of the first screen)
			ttop = dt * d.clientHeight / 4
			document.getElementById("ss").style.display = "block"
			scroll_to = setTimeout(do_scroll, ttop * 1000, 1)

			// (in Android Browser, remove the address bar)
			window.scrollTo(0, 8)		// go to the top
			sY = 0
		} else {
			if (sY == window.pageYOffset) {	// no scroll -> finished
				document.getElementById("ss").style.display = "none"
				scroll_to = null
				return
			}
			sY = window.pageYOffset
			window.scrollTo(0, sY + 1)
			scroll_to = setTimeout(do_scroll, dt * 1000, 1)
		}
	} // do_scroll()

	// source edit
	abc2svg.src_upd = function() {
		page = document.getElementById('ta').value
		abc2svg.get_sel()
	} // src_upd()

	abc2svg.src_edit = function() {
		// offer a textarea with the ABC source and 2 buttons
		document.body.innerHTML = '\
<textarea id="ta" rows="50" cols="80" style="overflow:scroll">'
			+ page + '</textarea>\
<br/>\
<a href="#" onclick="abc2svg.src_upd()"> Apply </a> - \
<a href="#" onclick="abc2svg.get_sel()"> Cancel </a>'
	} // src_edit()

	// start/stop scrolling when no play
	abc2svg.st_scroll = function() {
		if (scroll_to) {
			clearTimeout(scroll_to)
			document.getElementById("ss").style.display = "none"
			scroll_to = null
		} else {
			scroll_to = setTimeout(do_scroll, 500, 0)	// scroll start
		}
	} // st_scroll()

	// function to load javascript files
	abc2svg.loadjs = function(fn, relay, onerror) {
	    var	s = document.createElement('script')
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
	} // loadjs()

	// build a list of the tunes
	abc2svg.get_sel = function() {
	    var	j, k,
		n = 0,
		i = 0,
		t = (typeof list_head == "undefined" ? "Tunes:" : list_head) + '<ul>\n',
		tt = typeof list_tail == "undefined" ? "(all tunes)" : list_tail

		for (;;) {
			i = page.indexOf("\nX:", i)
			if (i < 0)
				break
			k = page.indexOf("\n", ++i)
			j = page.indexOf("\nT:", i)
			n++
//			t += '<li><a \
			t += '<li \
style="cursor:pointer;color:blue;text-decoration:underline" \
onclick="abc2svg.do_render(\'' + page.slice(i, k) + '$\')">' +
				page.slice(i + 2, k).replace(/%.*/,'')
			if (j > 0 && j < i + 20) {
				k = page.indexOf("\n", j + 1)
				t += " " + page.slice(j + 3, k).replace(/%.*/,'')
				if (page[k + 1] == 'T' && page[k + 2] == ':') {
					j = k + 3
					k = page.indexOf("\n", j)
					t += " - " + page.slice(j, k).replace(/%.*/,'')
				}
			}
//			t += '</a></li>\n'
			t += '</li>\n'
			i = k
		}
		if (n <= 1) {
			abc2svg.do_render()
			return
		}
//		t += '<li><a \
		t += '<li \
style="cursor:pointer;color:blue;text-decoration:underline" \
onclick="abc2svg.do_render(\'.*\')">' + tt +
//			'</li>\n\
			'</li>\n\
</ul>'

		document.body.innerHTML = t
		if (window.location.hash)
			window.location.hash = ''
	} // get_sel()

	// search/ask the tune to be rendered
	function render() {
	    var	select = window.location.hash.slice(1)		// after '#'

		// create styles for the menu
	   var	sty = document.createElement('style')
		sty.innerHTML = '\
.dd{position:fixed;top:0;bottom:0;right:0;height:40px;cursor:pointer;font-size:16px}\
#ss{display:none;background-color:red}\
.db{margin:5px;background-color:yellow}\
.db:hover,.db:focus{background-color:lightgreen}\
.dc{position:absolute;left:-70px;min-width:100px;display:none;background-color:yellow}\
.dc label{display:block;padding:0 5px 0 5px;margin:2px}\
.dc label:hover{outline:solid;outline-width:2px}\
.show{display:block}'
		document.head.appendChild(sty)

		// if no selection and many tunes, get the references of the tunes
		// and ask which one to display
		if (!select)
			abc2svg.get_sel()
		else
			abc2svg.do_render(decodeURIComponent(select))
	} // render()

	// replace the (previous) body by the music
	abc2svg.do_render = function(select) {

		// aweful hack: user.anno_stop must be defined before Abc creation
		// for being set later by follow() !
		if (typeof follow == "function")
			user.anno_stop = function(){}

		tune_lst = []
		abc2svg.abc =			// for external access
		abc = new abc2svg.Abc(user)
		new_page = ""

		// initialize the play follow function
		if (typeof follow == "function")
			follow(abc, user, playconf)

		if (select) {
			abc.tosvg(app, "%%select " + select)
			window.location.hash = encodeURIComponent(select)
		}
		try {
			abc.tosvg(app, page)
		} catch (e) {
			alert("abc2svg javascript error: " + e.message +
				"\nStack:\n" + e.stack)
		}
		abc2svg.abc_end()	// close the page if %%pageheight
		if (errtxt) {
			new_page += '<pre class="nop" style="background:#ff8080">' +
					errtxt + "</pre>\n"
			errtxt = ""
		}

		// add the menu
		new_page += '\
<div id="dd" class="dd nop">\
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" class="db">\
<path d="M4 6h15v2.5H4zm0 5h15v2.5H4zm0 5h15v2.5H4z" fill="black"/>\
</svg>\
<div id="dc" class="dc">\
<label id="edit" onclick="abc2svg.src_edit()">Source edit</label>\
<label id="list" onclick="abc2svg.get_sel()">Tune list</label>\
<label id="play" onclick="abc2svg.st_scroll()">Scroll</label>\
</div>\
</div>\
<label id="ss" class="dd nop" onclick="abc2svg.st_scroll()">Scroll<br/>stop</label>'

		// change the page
		try {
			document.body.innerHTML = new_page
		} catch (e) {
			alert("abc2svg bad generated SVG: " + e.message +
				"\nStack:\n" + e.stack)
			return
		}

		// add the event handlers
	   var	elts = document.getElementsByTagName('svg')
		for (var i = 0; i < elts.length; i++)
			elts[i].addEventListener('click', click)

		// update the menu
		setTimeout(function() {

			// remove scroll in menu if play or not a big tune
			if (typeof AbcPlay != "undefined"
			 || document.documentElement.scrollHeight <= window.innerHeight)
				document.getElementById("play").style.display = "none"
		}, 500)
	} // render()

	// load the %%abc-include files
	function include() {
	    var	i, j, fn, r,
		k = 0

		while (1) {
			i = page.indexOf('%%abc-include ', k)
			if (i < 0) {
				render()
				return
			}
			i += 14
			j = page.indexOf('\n', i)
			fn = page.slice(i, j).trim()
			if (!a_inc[fn])
				break
			k = j
		}

		// %%abc-include found: load the file
		r = new XMLHttpRequest()
		r.open('GET', fn, true)		// (async)
		r.onload = function() {
			if (r.status === 200) {
				a_inc[fn] = r.responseText
				if (abc2svg.modules.load(a_inc[fn], include))
					include()
			} else {
				a_inc[fn] = '%\n'
				alert('Error getting ' + fn + '\n' + r.statusText)
				include()
			}
		}
		r.onerror = function () {
			a_inc[fn] = '%\n'
			alert('Error getting ' + fn + '\n' + r.statusText)
			include()
		}
		r.send()
	} // include()

	// --- dom_loaded() main code ---

	// load the abc2svg core if not done by <script>
	if (!abc2svg.Abc) {
		abc2svg.loadjs("abc2svg-1.js", dom_loaded)
		return
	}

	// get the page content
	page = fix_abc(document.body.innerHTML)

	// click on a SVG element
	function click(evt) {
		if (playing) {			// stop playing
			abcplay.stop()
			return
		}

	    var	e, s, j,
		c = evt.target

		// remove the menu if active
		e = document.getElementById("dc")
		if (e && e.classList.contains("show")) {
			e.classList.remove("show") // remove the menu
			return
		}

		// search if click in a SVG image
		e = c				// keep the clicked element
		while (1) {
			if (c == document)
				return
			if (c.tagName.toLowerCase() == 'svg')
				break
			c = c.parentNode
		}

		c = c.getAttribute('class')
		if (!c)
			return

		// if click in the menu button, show the menu
		if (c == "db") {
			e = document.getElementById("dc")
			e.classList.toggle("show")
			return
		}

		//play stuff

		// initialize the play object
		if (!abcplay) {
			if (typeof AbcPlay == "undefined")
				return		// no play support
			if (abc.cfmt().soundfont)
				playconf.sfu = abc.cfmt().soundfont
			abcplay = AbcPlay(playconf)
		}

		// get the clicked tune
		c = c.match(/tune(\d+)/)
		if (!c)
			return
		c = c[1]			// tune number

		// if not done yet,
		// generate the play data of the tune
		if (!tune_lst[c]) {
			tune_lst[c] = abc.tunes[c]
			abcplay.add(tune_lst[c][0],
					tune_lst[c][1],
					tune_lst[c][3])
		}

		// start playing from the clicked symbol
		// (this works when 'follow' is active)
		// or from the start of the tune
		s = tune_lst[c][0]		// first symbol of the tune
		c = e.getAttribute('class')
		if (c)
			c = c.match(/abcr _(\d+)_/)
		if (c) {
			c = c[1]		// symbol offset in the source
			while (s && s.istart != c)
				s = s.ts_next
			if (!s) {		// fixme: error ?!
				alert("play bug: no such symbol in the tune")
				return
			}
		}

		playing = true
		abcplay.play(s, null)
	} // click()

	// create a hidden span for string width computation
	e = document.createElement("span")
	e.style.position = "absolute"
	e.style.top =
		e.style.padding = 0
	e.style.visibility = "hidden"
	e.style.lineHeight = 1
	document.body.appendChild(e)
	abc2svg.el = e

	// accept page formatting
	abc2svg.abc_end = function() {}

	// load the required modules, then render the music
	if (abc2svg.modules.load(page, include))
		include()
} // dom_loaded()

// check if the document is loaded
if (document.readyState == "loading")
	addEventListener("DOMContentLoaded", dom_loaded, {once:true})
else
	dom_loaded()			// yes, let's go
