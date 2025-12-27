//JS - abc2svg edit - text in English
function loadtxt() {
	texts = {
		bad_nb: 'Bad line number',
		fn: 'File name: ',
		load: 'Please, load the included file ',
	}
	var text_kv = {
		a: 'About',
		b: 'ABC files:',
		cmpt: 'Tune',
		cmps: 'Selection',
		cmpl: 'Loop',
		cmpc: 'Continue',
//		df: 'abc2svg features',
//		dp: 'abc2svg parameters',
		er: 'Errors',
		f: 'File',
		fl: 'Load file',
		fs: 'Font size',
		gv: 'Volume',
		h: 'Help',
		ha: 'Help',
		lg: 'Language',
		pr: 'Preferences',
		saveas: 'Save file',
		sful: 'Soundfont URL',
		sp: 'Speed'
	}

	for (var k in text_kv)
		document.getElementById(k).innerHTML = text_kv[k];
	document.getElementById('ctxMenu').title = 'Play';

	document.getElementById("hlp").outerHTML = '<ul id="hlp">\n\
<li>You may either:\n\
    <ul>\n\
	<li>directly write ABC code in the text area, or</li>\n\
	<li>paste ABC code in the text area, or</li>\n\
	<li>load a local ABC file (\'ABC | Load file\' button), or</li>\n\
	<li>drag &amp; drop a local file from your file manager\n\
		or a selected text to the text area.</li>\n\
    </ul></li>\n\
	<li>You may change at will the ABC code in the text area.<br/>\n\
	Rendering is done 2 seconds later.</li>\n\
	<li>The \'Print\' button of the browser outputs the rendering area.</li>\n\
<li>You may select a part of the tunes either from the source text area\
	(click and move), or from the rendered area.<br/>\n\
	In the latter case, a left click on a music element defines the\
	start of the selection. A right click defines its end.<br/>\
	Also, if your browser can play the music, a right click\
	outside the music displays the play menu.</li>\
</ul>'
}
