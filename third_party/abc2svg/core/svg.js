// abc2svg - svg.js - svg functions
//
// Copyright (C) 2014-2025 Jean-Francois Moine
//
// This file is part of abc2svg-core.
//
// abc2svg-core is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// abc2svg-core is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with abc2svg-core.  If not, see <http://www.gnu.org/licenses/>.

var	output = "",		// output buffer
	style = '\
\n.stroke{stroke:currentColor;fill:none}\
\n.bW{stroke:currentColor;fill:none;stroke-width:1}\
\n.bthW{stroke:currentColor;fill:none;stroke-width:3}\
\n.slW{stroke:currentColor;fill:none;stroke-width:.7}\
\n.slthW{stroke:currentColor;fill:none;stroke-width:1.5}\
\n.sltnW{stroke:currentColor;fill:none;stroke-width:.25}\
\n.sldW{stroke:currentColor;fill:none;stroke-width:.7;stroke-dasharray:5,10}\
\n.sW{stroke:currentColor;fill:none;stroke-width:.7}\
\n.box{outline:1px solid black;outline-offset:1px}',
	font_style = '',
	posx = cfmt.leftmargin / cfmt.scale,	// default x offset of the images
	posy = 0,		// y offset in the block
	img = {			// image
		width: cfmt.pagewidth,	// width
		lm: cfmt.leftmargin,	// left and right margins
		rm: cfmt.rightmargin,
		wx: 0,			// used width between the left and right margins
		chg: 1 //true
	},
	defined_glyph = {},
	defs = '',
	fulldefs = '',		// unreferenced defs as <filter>
	stv_g = {		/* staff/voice graphic parameters */
		scale: 1,
		stsc: 1,	// staff scale
		vsc: 1,		// voice scale
		dy: 0,
		st: -1,
		v: -1,
		g: 0
//		color: undefined
	},
	blkdiv = 0		// block of contiguous SVGs
				// -1: block started
				//  0: no block
				//  1: start a block
				//  2: start a new page

// glyphs in music font
var tgls = {
 "mtr ": {x:0, y:0, c:"\u0020"},	// space
  brace: {x:0, y:0, c:"\ue000"},
  lphr: {x:0, y:23, c:"\ue030"},
  mphr: {x:0, y:23, c:"\ue038"},
  sphr: {x:0, y:25, c:"\ue039"},
  short: {x:0, y:32, c:"\ue038"},
  tick: {x:0, y:25, c:"\ue039"},
  rdots: {x:0, y:0, c:"\ue043"},	// repeat dots
  rdot: {x:0, y:0, c:"\ue044"},		// single repeat dot
  dsgn: {x:-12, y:0, c:"\ue045"},	// D.S.
  dcap: {x:-12, y:0, c:"\ue046"},	// D.C.
  sgno: {x:-5, y:0, c:"\ue047"},	// segno
  coda: {x:-10, y:0, c:"\ue048"},
  tclef: {x:-8, y:0, c:"\ue050"},
  cclef: {x:-8, y:0, c:"\ue05c"},
  bclef: {x:-8, y:0, c:"\ue062"},
  pclef: {x:-6, y:0, c:"\ue069"},
  spclef: {x:-6, y:0, c:"\ue069"},
  stclef: {x:-8, y:0, c:"\ue07a"},
  scclef: {x:-8, y:0, c:"\ue07b"},
  sbclef: {x:-7, y:0, c:"\ue07c"},
  oct: {x:0, y:2, c:"\ue07d"},		// 8 for clefs
  oct2: {x:0, y:2, c:"\ue07e"},		// 15 for clefs
  mtr0: {x:0, y:0, c:"\ue080"},		// meters
  mtr1: {x:0, y:0, c:"\ue081"},
  mtr2: {x:0, y:0, c:"\ue082"},
  mtr3: {x:0, y:0, c:"\ue083"},
  mtr4: {x:0, y:0, c:"\ue084"},
  mtr5: {x:0, y:0, c:"\ue085"},
  mtr6: {x:0, y:0, c:"\ue086"},
  mtr7: {x:0, y:0, c:"\ue087"},
  mtr8: {x:0, y:0, c:"\ue088"},
  mtr9: {x:0, y:0, c:"\ue089"},
  mtrC: {x:0, y:0, c:"\ue08a"},		// common time (4/4)
  "mtrC|": {x:0, y:0, c:"\ue08b"},	// cut time (2/2)
  "mtr+":  {x:0, y:0, c:"\ue08c"},
  "mtr(":  {x:0, y:0, c:"\ue094"},
  "mtr)":  {x:0, y:0, c:"\ue095"},
  HDD: {x:-7, y:0, c:"\ue0a0"},
  breve: {x:-7, y:0, c:"\ue0a1"},
  HD: {x:-5.2, y:0, c:"\ue0a2"},
  Hd: {x:-3.8, y:0, c:"\ue0a3"},
  hd: {x:-3.7, y:0, c:"\ue0a4"},
  ghd: {x:2, y:0, c:"\ue0a4", sc:.66},	// grace note head
  pshhd: {x:-3.7, y:0, c:"\ue0a9"},
  pfthd: {x:-3.7, y:0, c:"\ue0b3"},
  x: {x:-3.7, y:0, c:"\ue0a9"},		// 'x' note head
  "circle-x": {x:-3.7, y:0, c:"\ue0b3"}, // 'circle-x' note head
  srep: {x:-5, y:0, c:"\ue101"},
  "dot+": {x:-5, y:0, sc:.7, c:"\ue101"},
  diamond: {x:-4, y:0, c:"\ue1b9"},
  triangle: {x:-4, y:0, c:"\ue1bb"},
  dot: {x:-1, y:0, c:"\ue1e7"},
  flu1: {x:-.3, y:0, c:"\ue240"},	// flags
  fld1: {x:-.3, y:0, c:"\ue241"},
  flu2: {x:-.3, y:0, c:"\ue242"},
  fld2: {x:-.3, y:0, c:"\ue243"},
  flu3: {x:-.3, y:3.5, c:"\ue244"},
  fld3: {x:-.3, y:-4, c:"\ue245"},
  flu4: {x:-.3, y:8, c:"\ue246"},
  fld4: {x:-.3, y:-9, c:"\ue247"},
  flu5: {x:-.3, y:12.5, c:"\ue248"},
  fld5: {x:-.3, y:-14, c:"\ue249"},
 "acc-1": {x:-1, y:0, c:"\ue260"},		// flat
 "cacc-1": {x:-18, y:0, c:"\ue26a\ue260\ue26b"}, // courtesy flat (note deco)
 "sacc-1": {x:-1, y:0, sc:.7, c:"\ue260"},	// small flat (editorial)
  acc3: {x:-1, y:0, c:"\ue261"},		// natural
 "cacc3": {x:-18, y:0, c:"\ue26a\ue261\ue26b"},	// courtesy natural (note deco)
  sacc3: {x:-1, y:0, sc:.7, c:"\ue261"},	// small natural (editorial)
  acc1: {x:-2, y:0, c:"\ue262"},		// sharp
 "cacc1": {x:-18, y:0, c:"\ue26a\ue262\ue26b"},	// courtesy sharp (note deco)
  sacc1: {x:-2, y:0, sc: .7, c:"\ue262"},	// small sharp (editorial)
  acc2: {x:-3, y:0, c:"\ue263"},	// double sharp
 "acc-2": {x:-3, y:0, c:"\ue264"},	// double flat
 "acc-1_2": {x:-2, y:0, c:"\ue280"},	// quarter-tone flat
 "acc-3_2": {x:-3, y:0, c:"\ue281"},	// three-quarter-tones flat
  acc1_2: {x:-1, y:0, c:"\ue282"},	// quarter-tone sharp
  acc3_2: {x:-3, y:0, c:"\ue283"},	// three-quarter-tones sharp
  accent: {x:-3, y:2, c:"\ue4a0"},
  stc: {x:0, y:-2, c:"\ue4a2"},		// staccato
  emb: {x:0, y:-2, c:"\ue4a4"},
  wedge: {x:0, y:0, c:"\ue4a8"},
  marcato: {x:-3, y:-2, c:"\ue4ac"},
  hld: {x:-7, y:-2, c:"\ue4c0"},		// fermata
  brth: {x:0, y:0, c:"\ue4ce"},
  caes: {x:0, y:8, c:"\ue4d1"},
  r00: {x:-1.5, y:0, c:"\ue4e1"},
  r0: {x:-1.5, y:0, c:"\ue4e2"},
  r1: {x:-3.5, y:-6, c:"\ue4e3"},
  r2: {x:-3.2, y:0, c:"\ue4e4"},
  r4: {x:-3, y:0, c:"\ue4e5"},
  r8: {x:-3, y:0, c:"\ue4e6"},
  r16: {x:-4, y:0, c:"\ue4e7"},
  r32: {x:-4, y:0, c:"\ue4e8"},
  r64: {x:-4, y:0, c:"\ue4e9"},
  r128: {x:-4, y:0, c:"\ue4ea"},
//  mrest: {x:-10, y:0, c:"\ue4ee"},
  mrep: {x:-6, y:0, c:"\ue500"},
  mrep2: {x:-9, y:0, c:"\ue501"},
  p: {x:-3, y:0, c:"\ue520"},
  f: {x:-3, y:0, c:"\ue522"},
  pppp: {x:-15, y:0, c:"\ue529"},
  ppp: {x:-14, y:0, c:"\ue52a"},
  pp: {x:-8, y:0, c:"\ue52b"},
  mp: {x:-8, y:0, c:"\ue52c"},
  mf: {x:-8, y:0, c:"\ue52d"},
  ff: {x:-7, y:0, c:"\ue52f"},
  fff: {x:-10, y:0, c:"\ue530"},
  ffff: {x:-14, y:0, c:"\ue531"},
  sfz: {x:-10, y:0, c:"\ue539"},
  trl: {x:-3, y:-3, c:"\ue566"},	// trill
  turn: {x:-5, y:0, c:"\ue567"},
  turnx: {x:-5, y:0, c:"\ue569"},
  umrd: {x:-6, y:2, c:"\ue56c"},
  lmrd: {x:-6, y:2, c:"\ue56d"},
  dplus: {x:-3, y:0, c:"\ue582"},	// plus
  sld: {x:-3, y:2, c:"\ue5d0"},		// slide
  grm: {x:-3, y:-2, c:"\ue5e2"},	// grace mark
  dnb: {x:-3, y:0, c:"\ue610"},		// down bow
  upb: {x:-2, y:0, c:"\ue612"},		// up bow
  opend: {x:-2, y:-2, c:"\ue614"},	// harmonic
  roll: {x:0, y:0, c:"\ue618"},
  thumb: {x:-2, y:-2, c:"\ue624"},
  snap: {x:-2, y:-2, c:"\ue630"},
  ped: {x:-10, y:0, c:"\ue650"},
  pedoff: {x:-5, y:0, c:"\ue655"},
 "mtro.": {x:0, y:0, c:"\ue910"},	// tempus perfectum prolatione perfecta
  mtro:   {x:0, y:0, c:"\ue911"},		// tempus perfectum
 "mtro|": {x:0, y:0, c:"\ue912"},	// tempus perfectum (twice as fast)
 "mtrc.": {x:0, y:0, c:"\ue914"},	// tempus imperfectum prolatione perfecta
  mtrc:   {x:0, y:0, c:"\ue915"},	// tempus imperfectum
 "mtrc|": {x:0, y:0, c:"\ue918"},	// tempus imperfectum (twice as fast)
  longa: {x:-4.7, y:0, c:"\ue95d"},
  custos: {x:-4, y:3, c:"\uea02"},
  ltr: {x:2, y:6, c:"\ueaa4"}		// long trill element
}

// glyphs to put in <defs>
var glyphs = {
}

// convert a meter string to a SmuFL encoded string
function m_gl(s) {
	return s.replace(/./g,
		function(e) {
		    var	m = tgls["mtr" + e]
//fixme: !! no m.x nor m.y yet !!
//			if (!m.x && !m.y)
				return m ? m.c : 0
//			return '<tspan dx="'+ m.x.toFixed(1) +
//				'" dy="' + m.y.toFixed(1) +
//				'">' +
//				m.c + '</tspan>'
		})
}

// mark a glyph as used and add it in <defs>
function def_use(gl) {
	var	i, j, g

	if (defined_glyph[gl])
		return
	defined_glyph[gl] = true;
	g = glyphs[gl]
	if (!g) {
//throw new Error("unknown glyph: " + gl)
		error(1, null, "Unknown glyph: '$1'", gl)
		return	// fixme: the xlink is set
	}
	j = 0
	while (1) {
		i = g.indexOf('xlink:href="#', j)
		if (i < 0)
			break
		i += 13;
		j = g.indexOf('"', i);
		def_use(g.slice(i, j))
	}
	defs += '\n' + g
}

// add user defs from %%beginsvg
function defs_add(text) {
	var	i, j, gl, tag, is,
		ie = 0

	// remove XML comments
	text = text.replace(/<!--.*?-->/g, '')

	while (1) {
		is = text.indexOf('<', ie);
		if (is < 0)
			break
		i = text.indexOf('id="', is)
		if (i < 0)
			break
		i += 4;
		j = text.indexOf('"', i);
		if (j < 0)
			break
		gl = text.slice(i, j);
		ie = text.indexOf('>', j);
		if (ie < 0)
			break
		if (text[ie - 1] == '/') {
			ie++
		} else {
			i = text.indexOf(' ', is);
			if (i < 0)
				break
			tag = text.slice(is + 1, i);
			ie = text.indexOf('</' + tag + '>', ie)
			if (ie < 0)
				break
			ie += 3 + tag.length
		}
		if (text.substr(is, 7) == '<filter')
			fulldefs += text.slice(is, ie) + '\n'
		else
			glyphs[gl] = text.slice(is, ie)
	}
}

// output the stop/start of a graphic sequence
function set_g() {

	// close the previous sequence
	if (stv_g.started) {
		stv_g.started = false;
		glout()
		output += "</g>\n"
	}

	// check if new sequence needed
	if (stv_g.scale == 1 && !stv_g.color)
		return

	// open the new sequence
	glout()
	output += '<g '
	if (stv_g.scale != 1) {
		if (stv_g.st < 0)
			output += voice_tb[stv_g.v].scale_str
		else if (stv_g.v < 0)
			output += staff_tb[stv_g.st].scale_str
		else
			output += 'transform="translate(0,' +
					(posy - stv_g.dy).toFixed(1) +
				') scale(' + stv_g.scale + ')"'
	}
	if (stv_g.color) {
		if (stv_g.scale != 1)
			output += ' ';
		output += 'color="' + stv_g.color + '"'
	}
	output += ">\n";
	stv_g.started = true
}

/* set the color */
function set_color(color) {
	if (color == stv_g.color)
		return undefined	// same color
	var	old_color = stv_g.color;
	stv_g.color = color;
	set_g()
	return old_color
}

/* -- set the staff scale (only) -- */
function set_sscale(st) {
	var	new_scale, dy

	if (st != stv_g.st && stv_g.scale != 1)
		stv_g.scale = 1
	new_scale = st >= 0 ? staff_tb[st].staffscale : 1
	if (st >= 0 && new_scale != 1)
		dy = staff_tb[st].y
	else
		dy = posy
	if (new_scale == stv_g.scale && dy == stv_g.dy
	 && stv_g.st == st && stv_g.vsc == 1)
		return
	stv_g.stsc =
		stv_g.scale = new_scale
	stv_g.vsc = 1
	stv_g.dy = dy;
	stv_g.st = st;
	stv_g.v = -1;
	set_g()
}

/* -- set the voice or staff scale -- */
function set_scale(s) {
    var	new_dy = posy,
	st = staff_tb[s.st].staffscale == 1 ? -1 : s.st,
	new_scale = s.p_v.scale

	if (st >= 0) {
		new_scale *= staff_tb[st].staffscale
		new_dy = staff_tb[st].y
	}
	if (new_scale == stv_g.scale && stv_g.dy == new_dy)
		return
	stv_g.scale = new_scale;
	stv_g.vsc = s.p_v.scale
	stv_g.dy = new_dy;
	stv_g.st = st
	stv_g.v = s.v;
	set_g()
}

// -- set the staff output buffer and scale when delayed output
function set_dscale(st, no_scale) {
	if (output) {
		if (stv_g.started) {	// close the previous sequence
			stv_g.started = false
			glout()
			output += "</g>\n"
		}
		if (stv_g.st < 0) {
			staff_tb[0].output += output
		} else if (stv_g.scale == 1) {
			staff_tb[stv_g.st].output += output
		} else {
			staff_tb[stv_g.st].sc_out += output
		}
		output = ""
	}
	if (st < 0)
		stv_g.scale = 1
	else
		stv_g.scale = no_scale ? 1 : staff_tb[st].staffscale;
	stv_g.st = st;
	stv_g.dy = 0
}

// update the y offsets of delayed output
function delayed_update() {
	var st, new_out, text

	for (st = 0; st <= nstaff; st++) {
		if (staff_tb[st].sc_out) {
			output += '<g ' + staff_tb[st].scale_str + '>\n' +
				staff_tb[st].sc_out + '</g>\n';
			staff_tb[st].sc_out = ""
		}
		if (!staff_tb[st].output)
			continue
		output += '<g transform="translate(0,' +
				(-staff_tb[st].y).toFixed(1) +
				')">\n' +
			staff_tb[st].output +
			'</g>\n';
		staff_tb[st].output = ""
	}
}

// output the annotations
function anno_out(s, t, f) {
	if (s.istart == undefined)
		return
	var	type = s.type,
		h = s.ymx - s.ymn + 4,
		wl = s.wl || 2,
		wr = s.wr || 2

	if (s.grace)
		type = C.GRACE

	f(t || abc2svg.sym_name[type], s.istart, s.iend,
		s.x - wl - 2, staff_tb[s.st].y + s.ymn + h - 2,
		wl + wr + 4, h, s);
}

function a_start(s, t) {
	anno_out(s, t, user.anno_start)
}
function a_stop(s, t) {
	anno_out(s, t, user.anno_stop)
}
function empty_function() {
}
	// the values are updated on generate()
    var	anno_start = empty_function,
	anno_stop = empty_function

// output the stop user annotations
function anno_put() {
    var	s
	while (1) {
		s = anno_a.shift()
		if (!s)
			break
		switch (s.type) {
		case C.CLEF:
		case C.METER:
		case C.KEY:
		case C.REST:
			if (s.type != C.REST || s.rep_nb) {
				set_sscale(s.st)
				break
			}
			// fall thru
		case C.GRACE:
		case C.NOTE:
		case C.MREST:
			set_scale(s)
			break
//		default:
//			continue
		}
		anno_stop(s)
	}
} // anno_put()

// output a string with x, y, a and b
// In the string,
//	X and Y are replaced by scaled x and y
//	A and B are replaced by a and b as string
//	F and G are replaced by a and b as float
function out_XYAB(str, x, y, a, b) {
	x = sx(x);
	y = sy(y);
	output += str.replace(/X|Y|A|B|F|G/g, function(c) {
		switch (c) {
		case 'X': return x.toFixed(1)
		case 'Y': return y.toFixed(1)
		case 'A': return a
		case 'B': return b
		case 'F': return a.toFixed(1)
//		case 'G':
		default: return b.toFixed(1)
		}
		})
}

// open / close containers
function g_open(x, y, rot, sx, sy) {
	glout()
	out_XYAB('<g transform="translate(X,Y', x, y);
	if (rot)
		output += ') rotate(' + rot.toFixed(2)
	if (sx) {
		output += ') scale(' + sx
		if (sy)
			output += ', ' + sy
	}
	output += ')">\n';
	stv_g.g++
}
function g_close() {
	glout()
	stv_g.g--;
	output += '</g>\n'
}

// external SVG string
Abc.prototype.out_svg = function(str) { output += str }

// exported functions for the annotation
function sx(x) {
	if (stv_g.g)
		return x
	return (x + posx) / stv_g.scale
}
Abc.prototype.sx = sx
function sy(y) {
	if (stv_g.g)
		return -y
	if (stv_g.scale == 1)
		return posy - y
	if (stv_g.v >= 0)
		return (stv_g.dy - y) / stv_g.vsc
	return stv_g.dy - y	// staff scale only
}
Abc.prototype.sy = sy;
Abc.prototype.sh = function(h) {
	if (stv_g.st < 0)
		return h / stv_g.scale
	return h
}
// for absolute X,Y coordinates
Abc.prototype.ax = function(x) { return x + posx }
Abc.prototype.ay = function(y) {
	if (stv_g.st < 0)
		return posy - y
	return posy + (stv_g.dy - y) * stv_g.scale - stv_g.dy
}
Abc.prototype.ah = function(h) {
	if (stv_g.st < 0)
		return h
	return h * stv_g.scale
}
// output scaled (x + <sep> + y)
function out_sxsy(x, sep, y) {
	x = sx(x);
	y = sy(y);
	output += x.toFixed(1) + sep + y.toFixed(1)
}
Abc.prototype.out_sxsy = out_sxsy

// define the start of a path
function xypath(x, y, fill) {
	if (fill)
		out_XYAB('<path d="mX Y', x, y)
	else
		out_XYAB('<path class="stroke" d="mX Y', x, y)
}
Abc.prototype.xypath = xypath

// draw all the helper/ledger lines
	function draw_all_hl() {
	    var	st, p_st

		function hlud(hla, d) {
		    var	hl, hll, i, xp, dx2, x2,
			n = hla.length

			if (!n)
				return
			for (i = 0; i < n; i++) {	// for all lines
				hll = hla[i]
				if (!hll || !hll.length)
					continue
				xp = sx(hll[0][0])	// previous x
				output +=
				    '<path class="stroke" stroke-width="1" d="M' +
					xp.toFixed(1) + ' ' +
					sy(p_st.y + d * i).toFixed(1)
				dx2 = 0
				while (1) {
					hl = hll.shift()
					if (!hl)
						break
					x2 = sx(hl[0])
					output += 'm' +
						(x2 - xp + hl[1] - dx2).toFixed(2) +
						' 0h' + (-hl[1] + hl[2]).toFixed(2)
					xp = x2
					dx2 = hl[2]
				}
				output += '"/>\n'
			}
		} // hlud()

		for (st = 0; st <= nstaff; st++) {
			p_st = staff_tb[st]
			if (!p_st.hlu)
				continue	// (staff not yet displayed)
			set_sscale(st)
			hlud(p_st.hlu, 6)
			hlud(p_st.hld, -6)
		}
	} // draw_all_hl()

// output the list of glyphs and the stems
// [0] = x glyph
// [1] = y glyph
// [2] = glyph code
// [3] = x, y, h of stem (3 values per stem)
var gla = [[], [], "", [], [], []]
function glout() {
    var	e,
	v = []

	// glyphs (notes, accidentals...)
    if (gla[0].length) {
	while (1) {
		e = gla[0].shift()
		if (e == undefined)
			break
		v.push(e.toFixed(1))
	}
	output += '<text x="' + v.join(',')

	v = []
	while (1) {
		e = gla[1].shift()
		if (e == undefined)
			break
		v.push(e.toFixed(1))
	}
	output += '"\ny="' + v.join(',')

	output += '"\n>' + gla[2] + '</text>\n'
	gla[2] = ""
    }

	// stems
	if (!gla[3].length)
		return
	output += '<path class="sW" d="'
	while (1) {
		e = gla[3].shift()
		if (e == undefined)
			break
		output += 'M' + e.toFixed(1) +
			' ' + gla[3].shift().toFixed(1) +
			'v' + gla[3].shift().toFixed(1)
	}
	output += '"/>\n'
} // glout()

// output a glyph
function xygl(x, y, gl) {
// (avoid ps<->js loop)
//	if (psxygl(x, y, gl))
//		return
	if (glyphs[gl]) {
		def_use(gl)
		out_XYAB('<use x="X" y="Y" xlink:href="#A"/>\n', x, y, gl)
	} else {
	    var	tgl = tgls[gl]
		if (tgl) {
			x += tgl.x * stv_g.scale;
			y -= tgl.y
			if (tgl.sc) {
				out_XYAB('<text transform="translate(X,Y) scale(A)">B</text>\n',
					x, y, tgl.sc, tgl.c);
			} else {
//				out_XYAB('<text x="X" y="Y">A</text>\n', x, y, tgl.c)
				gla[0].push(sx(x))
				gla[1].push(sy(y))
				gla[2] += tgl.c
			}
		} else if (gl != 'nil') {
			error(1, null, 'no definition of $1', gl)
		}
	}
}
// - specific functions -
// gua gda (acciaccatura)
function out_acciac(x, y, dx, dy, up) {
	if (up) {
		x -= 1;
		y += 4
	} else {
		x -= 5;
		y -= 4
	}
	out_XYAB('<path class="stroke" d="mX YlF G"/>\n',
		x, y, dx, -dy)
}
// staff system brace
function out_brace(x, y, h) {
//fixme: '-6' depends on the scale
	x += posx - 6;
	y = posy - y;
	h /= 24;
	output += '<text transform="translate(' +
				x.toFixed(1) + ',' + y.toFixed(1) +
			') scale(2.5,' + h.toFixed(2) +
			')">' + tgls.brace.c + '</text>\n'
}

// staff system bracket
function out_bracket(x, y, h) {
	x += posx - 5;
	y = posy - y - 3;
	h += 2;
	output += '<path d="m' + x.toFixed(1) + ' ' + y.toFixed(1) + '\n\
	c10.5 1 12 -4.5 12 -3.5c0 1 -3.5 5.5 -8.5 5.5\n\
	v' + h.toFixed(1) + '\n\
	c5 0 8.5 4.5 8.5 5.5c0 1 -1.5 -4.5 -12 -3.5"/>\n'
}
// hyphen
function out_hyph(x, y, w) {
	var	n, a_y,
		d = 25 + ((w / 20) | 0) * 3

	if (w > 15.)
		n = ((w - 15) / d) | 0
	else
		n = 0;
	x += (w - d * n - 5) / 2;
	out_XYAB('<path class="stroke" stroke-width="1.2"\n\
	stroke-dasharray="5,A"\n\
	d="mX YhB"/>\n',
		x, y + 4,		// set the line a bit upper
		Math.round((d - 5) / stv_g.scale), d * n + 5)
}
// stem [and flags]
function out_stem(x, y, h, grace,
		  nflags, straight) {	// optional
//fixme: dx KO with half note or longa
	var	dx = grace ? GSTEM_XOFF : 3.5,
		slen = -h

	if (h < 0)
		dx = -dx;		// down
	x += dx * stv_g.scale
	if (stv_g.v >= 0)
		slen /= voice_tb[stv_g.v].scale;
	gla[3].push(sx(x))
	gla[3].push(sy(y))
	gla[3].push(slen)
	if (!nflags)
		return

	y += h
	if (h > 0) {				// up
		if (!straight) {
			if (!grace) {
				xygl(x, y, "flu" + nflags)
				return
			} else {		// grace
				output += '<path d="'
				if (nflags == 1) {
					out_XYAB('MX Yc0.6 3.4 5.6 3.8 3 10\n\
	1.2 -4.4 -1.4 -7 -3 -7\n', x, y)
				} else {
					while (--nflags >= 0) {
						out_XYAB('MX Yc1 3.2 5.6 2.8 3.2 8\n\
	1.4 -4.8 -2.4 -5.4 -3.2 -5.2\n', x, y);
						y -= 3.5
					}
				}
			}
		} else {			// straight
			output += '<path d="'
			if (!grace) {
				while (--nflags >= 0) {
					out_XYAB('MX Yl7 3.2 0 3.2 -7 -3.2z\n',
						x, y);
					y -= 5.4
				}
			} else {		// grace
				while (--nflags >= 0) {
					out_XYAB('MX Yl3 1.5 0 2 -3 -1.5z\n',
						x, y);
					y -= 3
				}
			}
		}
	} else {				// down
		if (!straight) {
			if (!grace) {
				xygl(x, y, "fld" + nflags)
				return
			} else {		// grace
				output += '<path d="'
				if (nflags == 1) {
					out_XYAB('MX Yc0.6 -3.4 5.6 -3.8 3 -10\n\
	1.2 4.4 -1.4 7 -3 7\n', x, y)
				} else {
					while (--nflags >= 0) {
						out_XYAB('MX Yc1 -3.2 5.6 -2.8 3.2 -8\n\
	1.4 4.8 -2.4 5.4 -3.2 5.2\n', x, y);
						y += 3.5
					}
				}
			}
		} else {			// straight
			output += '<path d="'
			if (!grace) {
				while (--nflags >= 0) {
					out_XYAB('MX Yl7 -3.2 0 -3.2 -7 3.2z\n',
						x, y);
					y += 5.4
				}
//			} else {		// grace
//--fixme: error?
			}
		}
	}
	output += '"/>\n'
}
// tremolo
function out_trem(x, y, ntrem) {
	out_XYAB('<path d="mX Y\n\t', x - 4.5, y)
	while (1) {
		output += 'l9 -3v3l-9 3z'
		if (--ntrem <= 0)
			break
		output += 'm0 5.4'
	}
	output += '"/>\n'
}
// tuplet bracket - the staves are not defined
function out_tubr(x, y, dx, dy, up) {
	var	h = up ? -3 : 3;

	y += h;
	dx /= stv_g.scale;
	output += '<path class="stroke" d="m';
	out_sxsy(x, ' ', y);
	output += 'v' + h.toFixed(1) +
		'l' + dx.toFixed(1) + ' ' + (-dy).toFixed(1) +
		'v' + (-h).toFixed(1) + '"/>\n'
}
// tuplet bracket with number - the staves are not defined
function out_tubrn(x, y, dx, dy, up, str) {
    var	dxx,
	sw = str.length * 10,
	h = up ? -3 : 3;

	set_font("tuplet")
	xy_str(x + dx / 2, y + dy / 2 - gene.curfont.size * .1,
		str, 'c')
		dx /= stv_g.scale
	if (!up)
		y += 6;
	output += '<path class="stroke" d="m';
	out_sxsy(x, ' ', y);
	dxx = dx - sw + 1
	if (dy > 0)
		sw += dy / 8
	else
		sw -= dy / 8
	output += 'v' + h.toFixed(1) +
		'm' + dx.toFixed(1) + ' ' + (-dy).toFixed(1) +
		'v' + (-h).toFixed(1) + '"/>\n' +
		'<path class="stroke" stroke-dasharray="' +
		(dxx / 2).toFixed(1) + ' ' + sw.toFixed(1) +
		'" d="m';
	out_sxsy(x, ' ', y - h);
	output += 'l' + dx.toFixed(1) + ' ' + (-dy).toFixed(1) + '"/>\n'

}
// underscore line
function out_wln(x, y, w) {
	out_XYAB('<path class="stroke" stroke-width="0.8" d="mX YhF"/>\n',
		x, y + 1, w)
}

// decorations with string
var deco_str_style = {
crdc:	{				// cresc., decresc., dim., ...
		dx: 0,
		dy: 5,
		style: 'font:italic 14px text,serif',
		anchor: ' text-anchor="middle"'
	},
dacs:	{				// long repeats (da capo, fine...)
		dx: 0,
		dy: 3,
		style: 'font:bold 15px text,serif',
		anchor: ' text-anchor="middle"'
	},
pf:	{
		dx: 0,
		dy: 5,
		style: 'font:italic bold 16px text,serif',
		anchor: ' text-anchor="middle"'
	}
}
deco_str_style.at = deco_str_style.crdc

function out_deco_str(x, y, de) {
    var	name = de.dd.glyph			// class

	if (name == 'fng') {
		out_XYAB('\
<text x="X" y="Y" style="font-size:14px">A</text>\n',
			x - 2, y + 1, m_gl(de.dd.str))
		return
	}

	if (name == '@') {			// compatibility
		name = 'at'
	} else if (!/^[A-Za-z][A-Za-z\-_]*$/.test(name)) {
		error(1, de.s, "No function for decoration '$1'", de.dd.name)
		return
	}

    var	f,
		a_deco = deco_str_style[name]

	if (!a_deco)
		a_deco = deco_str_style.crdc	// default style
	else if (a_deco.style)
		style += "\n." + name + "{" + a_deco.style + "}",
		delete a_deco.style

	x += a_deco.dx;
	y += a_deco.dy;
	out_XYAB('<text x="X" y="Y" class="A"B>', x, y,
		name, a_deco.anchor || "");
	set_font("annotation");
	out_str(de.dd.str)
	output += '</text>\n'
}

function out_arp(x, y, val) {
	g_open(x, y, 270);
	x = 0;
	val = Math.ceil(val / 6)
	while (--val >= 0) {
		xygl(x, 6, "ltr");
		x += 6
	}
	g_close()
}
function out_cresc(x, y, val, defl) {
	x += val * stv_g.scale
	val = -val;
	out_XYAB('<path class="stroke"\n\
	d="mX YlF ', x, y, val)
	if (defl.nost)
		output += '-2.2m0 -3.6l' + (-val).toFixed(1) + ' -2.2"/>\n'
	else
		output += '-4l' + (-val).toFixed(1) + ' -4"/>\n'

}
function out_dim(x, y, val, defl) {
	out_XYAB('<path class="stroke"\n\
	d="mX YlF ', x, y, val)
	if (defl.noen)
		output += '-2.2m0 -3.6l' + (-val).toFixed(1) + ' -2.2"/>\n'
	else
		output += '-4l' + (-val).toFixed(1) + ' -4"/>\n'
}
function out_ltr(x, y, val) {
	y += 4;
	val = Math.ceil(val / 6)
	while (--val >= 0) {
		xygl(x, y, "ltr");
		x += 6
	}
}
Abc.prototype.out_lped = function(x, y, val, defl) {
	if (!defl.nost)
		xygl(x, y, "ped");
	if (!defl.noen)
		xygl(x + val + 6, y, "pedoff")
}
function out_8va(x, y, val, defl) {
	if (val < 18) {
		val = 18
		x -= 4
	}
	if (!defl.nost) {
		out_XYAB('<text x="X" y="Y" \
style="font:italic bold 12px text,serif">8\
<tspan dy="-4" style="font-size:10px">va</tspan></text>\n',
			x - 8, y);
		x += 12;
		val -= 12
	}
	y += 6;
	out_XYAB('<path class="stroke" stroke-dasharray="6,6" d="mX YhF"/>\n',
		x, y, val)
	if (!defl.noen)
		out_XYAB('<path class="stroke" d="mX Yv6"/>\n', x + val, y)
}
function out_8vb(x, y, val, defl) {
	if (val < 18) {
		val = 18
		x -= 4
	}
	if (!defl.nost) {
		out_XYAB('<text x="X" y="Y" \
style="font:italic bold 12px text,serif">8\
<tspan dy=".5" style="font-size:10px">vb</tspan></text>\n',
			x - 8, y);
		x += 10
		val -= 10
	}
//	y -= 2;
	out_XYAB('<path class="stroke" stroke-dasharray="6,6" d="mX YhF"/>\n',
		x, y, val)
	if (!defl.noen)
		out_XYAB('<path class="stroke" d="mX Yv-6"/>\n', x + val, y)
}
function out_15ma(x, y, val, defl) {
	if (val < 25) {
		val = 25
		x -= 6
	}
	if (!defl.nost) {
		out_XYAB('<text x="X" y="Y" \
style="font:italic bold 12px text,serif">15\
<tspan dy="-4" style="font-size:10px">ma</tspan></text>\n',
			x - 10, y);
		x += 20;
		val -= 20
	}
	y += 6;
	out_XYAB('<path class="stroke" stroke-dasharray="6,6" d="mX YhF"/>\n',
		x, y, val)
	if (!defl.noen)
		out_XYAB('<path class="stroke" d="mX Yv6"/>\n', x + val, y)
}
function out_15mb(x, y, val, defl) {
	if (val < 24) {
		val = 24
		x -= 5
	}
	if (!defl.nost) {
		out_XYAB('<text x="X" y="Y" \
style="font:italic bold 12px text,serif">15\
<tspan dy=".5" style="font-size:10px">mb</tspan></text>\n',
			x - 10, y);
		x += 18
		val -= 18
	}
//	y -= 2;
	out_XYAB('<path class="stroke" stroke-dasharray="6,6" d="mX YhF"/>\n',
		x, y, val)
	if (!defl.noen)
		out_XYAB('<path class="stroke" d="mX Yv-6"/>\n', x + val, y)
}
var deco_val_tb = {
	arp:	out_arp,
	cresc:	out_cresc,
	dim:	out_dim,
	ltr:	out_ltr,
	lped:	function(x, y, val, defl) {
			self.out_lped(x, y, val, defl)
		},
	"8va":	out_8va,
	"8vb":	out_8vb,
	"15ma":	out_15ma,
	"15mb": out_15mb
}

function out_deco_val(x, y, name, val, defl) {
	if (deco_val_tb[name])
		deco_val_tb[name](x, y, val, defl)
	else
		error(1, null, "No function for decoration '$1'", name)
}

function out_glisq(x2, y2, de) {
    var	ar, a, len,
	de1 = de.start,
		x1 = de1.x,
		y1 = de1.y + staff_tb[de1.st].y,
		dx = x2 - x1,
		dy = self.sh(y1 - y2)

	if (!stv_g.g)
		dx /= stv_g.scale

	ar = Math.atan2(dy, dx)
	a = ar / Math.PI * 180
	len = (dx - (de1.s.dots ? 13 + de1.s.xmx : 8)
		- 8 - (de.s.notes[0].shac || 0))
			/ Math.cos(ar)

	g_open(x1, y1, a);
	x1 = de1.s.dots ? 13 + de1.s.xmx : 8;
	len = len / 6 | 0
	if (len < 1)
		len = 1
	while (--len >= 0) {
		xygl(x1, 0, "ltr");
		x1 += 6
	}
	g_close()
}

function out_gliss(x2, y2, de) {
    var	ar, a, len,
	de1 = de.start,
		x1 = de1.x,
		y1 = de1.y + staff_tb[de1.st].y,
		dx = x2 - x1,
		dy = self.sh(y1 - y2)

	if (!stv_g.g)
		dx /= stv_g.scale

	ar = Math.atan2(dy, dx)
	a = ar / Math.PI * 180
	len = (dx - (de1.s.dots ? 13 + de1.s.xmx : 8)
		- 8 - (de.s.notes[0].shac || 0))
			/ Math.cos(ar)

	g_open(x1, y1, a);
	xypath(de1.s.dots ? 13 + de1.s.xmx : 8, 0)
	output += 'h' + len.toFixed(1) + '" stroke-width="1"/>\n';
	g_close()
}

var deco_l_tb = {
	glisq: out_glisq,
	gliss: out_gliss
}

function out_deco_long(x, y, de) {
    var	s, p_v, m, nt, i,
	name = de.dd.glyph,
	de1 = de.start

	if (!deco_l_tb[name]) {
		error(1, null, "No function for decoration '$1'", name)
		return
	}

	// if no start or no end, get the y offset of the other end
	p_v = de.s.p_v				// voice
	if (de.defl.noen) {			// if no end
		s = p_v.s_next			// start of the next music line
		while (s && !s.dur)
			s = s.next
		if (s) {
			for (m = 0; m <= s.nhd; m++) {
				nt = s.notes[m]
				if (!nt.a_dd)
					continue
				for (i = 0; i < nt.a_dd.length; i++) {
					if (nt.a_dd[i].name == de.dd.name) {
						y = 3 * (nt.pit - 18)
							+ staff_tb[de.s.st].y
						break
					}
				}
			}
		}
		x += 8				// (there is no note width)
	} else if (de.defl.nost) {		// no start
		s = p_v.s_prev			// end of the previous music line
		while (s && !s.dur)
			s = s.prev
		if (s) {
			for (m = 0; m <= s.nhd; m++) {
				nt = s.notes[m]
				if (!nt.a_dd)
					continue
				for (i = 0; i < nt.a_dd.length; i++) {
					if (nt.a_dd[i].name == de1.dd.name) {
						de1.y = 3 * (nt.pit - 18)
						break
					}
				}
			}
		}
		de1.x -= 8			// (there is no note width)
	}
	deco_l_tb[name](x, y, de)
}

// add a tempo note in 'str' and return its number of characters
function tempo_note(str, s, dur, dy) {
    var	p,
	elts = identify_note(s, dur)

	switch (elts[0]) {		// head
	case C.OVAL:
		p = "\ueca2"
		break
	case C.EMPTY:
		p = "\ueca3"
		break
	default:
		switch (elts[2]) {	// flags
		case 2:
			p = "\ueca9"
			break
		case 1:
			p = "\ueca7"
			break
		default:
			p = "\ueca5"
			break
		}
		break
	}
	str.push('<tspan\nclass="' +
			font_class(cfmt.musicfont) +
		'" style="font-size:' +
		(gene.curfont.size * 1.3).toFixed(1) + 'px"' +
		dy + '>' +
		p + '</tspan>'
		+ (elts[1] ? '\u2009.' : ''))		// dot
	return elts[1] ? 2 : 1
} // tempo_note()

// build the tempo string
function tempo_build(s) {
    var	i, j, bx, p, wh, dy, h,
	w = 0,
	str = []

	if (s.tempo_str)	// already done
		return

	// the music font must be defined
	if (!cfmt.musicfont.used)
		get_font("music")

	set_font("tempo")
	h = gene.curfont.size
	if (s.tempo_str1) {
		str.push(s.tempo_str1)
		w += strwh(s.tempo_str1)[0]
	}
	if (s.tempo_notes) {
		dy = ' dy="-1"'			// notes a bit higher
		h *= 1.3
		for (i = 0; i < s.tempo_notes.length; i++) {
			j = tempo_note(str, s, s.tempo_notes[i], dy)
			w += j * gene.curfont.swfac
			dy = ''
		}
		str.push('<tspan dy="1">=</tspan>')
		w += cwidf('=')
		if (s.tempo_ca) {
			str.push(s.tempo_ca)
			w += strwh(s.tempo_ca)[0]
			j = s.tempo_ca.length + 1
		}
		if (s.tempo) {			// with a number of beats per minute
			str.push(s.tempo)
			w += strwh(s.tempo.toString())[0]
		} else {			// with a beat as a note
			j = tempo_note(str, s, s.new_beat, ' dy="-1"')
			w += j * gene.curfont.swfac
			dy = 'y'
		}
	}
	if (s.tempo_str2) {
		if (dy)
			str.push('<tspan\n\tdy="1">' +
					s.tempo_str2 + '</tspan>')
		else
			str.push(s.tempo_str2)
		w += strwh(s.tempo_str2)[0]
	}

	// build the string
	s.tempo_str = str.join(' ')
	w += cwidf(' ') * (str.length - 1)
	s.tempo_wh = [w, h]
} // tempo_build()

// output a tempo
function writempo(s, x, y) {
    var	bh

	set_font("tempo")
	if (gene.curfont.box) {
		gene.curfont.box = false
		bh = s.tempo_wh[1] + 2
	}

//fixme: xy_str() cannot be used because <tspan> in s.tempo_str
//fixme: then there cannot be font changes by "$n" in the Q: texts
	output += '<text class="' + font_class(gene.curfont) +
		'" x="'
	out_sxsy(x, '" y="', y + gene.curfont.size * .22)
	output += '">' + s.tempo_str + '</text>\n'

	if (bh) {
		gene.curfont.box = true
		output += '<rect class="stroke" x="'
		out_sxsy(x - 2, '" y="', y + bh - 1)
		output += '" width="' + (s.tempo_wh[0] + 4).toFixed(1) +
			'" height="' + bh.toFixed(1) +
			'"/>\n'
	}

	// don't display anymore
	s.invis = true
} // writempo()

// update the vertical offset
function vskip(h) {
	posy += h
}

// clear the styles
function clr_sty() {
	font_style = ''
	if (cfmt.fullsvg) {
		defined_glyph = {}
		for (var i = 0; i < abc2svg.font_tb.length; i++)
			abc2svg.font_tb[i].used = 0 //false
		ff.used = 0 //false		// clear the font-face
	} else {
		style =
			fulldefs = ''
	}
} // clr_sty()

// create the SVG image of the block
function svg_flush() {
	if (multicol || !user.img_out || posy == 0)
		return

    var	i, font,
	fmt = tsnext ? tsnext.fmt : cfmt,
	w = Math.ceil((fmt.trimsvg || fmt.singleline == 1)
		? (cfmt.leftmargin + img.wx * cfmt.scale + cfmt.rightmargin + 2)
		: img.width),
	head = '<svg xmlns="http://www.w3.org/2000/svg" version="1.1"\n\
	xmlns:xlink="http://www.w3.org/1999/xlink"\n\
	fill="currentColor" stroke-width=".7"',
	g = ''

	glout()

	if (cfmt.fgcolor)
		head += ' color="' + cfmt.fgcolor + '"'
	font = get_font("music")
	head += ' class="' + font_class(font) +
		' tune' + tunes.length + '"\n'	// tune index for play

	posy *= cfmt.scale
	if (user.imagesize != undefined)
		head += user.imagesize
	else
		head += ' width="' + w
			+ 'px" height="' + posy.toFixed(2) + 'px"'
	head += ' viewBox="0 0 ' + w + ' '
		+ posy.toFixed(2) + '">\n'
	head += fulldefs
	if (cfmt.bgcolor)
		head += '<rect width="100%" height="100%" fill="'
			+ cfmt.bgcolor + '"/>\n'

	if (style || font_style)
		head += '<style>' + font_style + style + '\n</style>\n'

	if (defs)
		head += '<defs>' + defs + '\n</defs>\n'

	// if %%pagescale != 1, do a global scale
	// (with a container: transform scale in <svg> does not work
	//	the same in all browsers)
	// the class is used to know that the container is global
	if (cfmt.scale != 1) {
		head += '<g class="g" transform="scale(' +
			cfmt.scale + ')">\n';
		g = '</g>\n'
	}

	if (psvg)			// if PostScript support
		psvg.ps_flush(true);	// + setg(0)

	// start a block if needed
	if (parse.state == 1 && user.page_format && !blkdiv)
		blkdiv = 1		// new tune
	if (blkdiv > 0) {
		user.img_out(blkdiv == 1 ?
			'<div class="nobrk">' :
			'<div class="nobrk newpage">')
		blkdiv = -1		// block started
	} else if (blkdiv < 0 && cfmt.splittune) {
		i = 1			// header and first music line
		blkdiv = 0
	}
	user.img_out(head + output + g + "</svg>");
	if (i)
		user.img_out("</div>")
	output = ""

	clr_sty()
	defs = '';
	posy = 0
	img.wx = 0			// space used between the margins
}

// mark the end of a <div> block
function blk_flush() {
	svg_flush()
	if (blkdiv < 0 && !parse.state) {
		user.img_out('</div>')
		blkdiv = 0
	}
}
Abc.prototype.blk_flush = blk_flush
