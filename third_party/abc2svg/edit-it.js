//JS - abc2svg edit - text in Italian
function loadtxt() {
	texts = {
		bad_nb: 'Numero di linea errato',
		fn: 'Nome file: ',
		load: 'Carica il file da includere ',
	}
	var text_kv = {
		a: 'A proposito',
		b: 'File ABC:',
		cmpt: 'Brano',
		cmps: 'Selezione',
		cmpl: 'Loop',
		cmpc: 'Continua',
//		df: 'Caratteristiche di abc2svg',
//		dp: 'Parametri di abc2svg',
		er: 'Errori',
		f: 'File',
		fl: 'Carica file',
		fs: 'Dimensione del font',
		gv: 'Volume',
		h: 'Aiuto',
		ha: 'Aiuto',
		lg: 'Lingua',
		pr: 'Preferenze',
		saveas: 'Salva il file',
		sful: 'URL del Soundfont',
		sp: 'Velocità'
	}

	for (var k in text_kv)
		document.getElementById(k).innerHTML = text_kv[k];
	document.getElementById('ctxMenu').title = 'Suonare';

	document.getElementById("hlp").outerHTML = '<ul id="hlp">\n\
<li>Opzioni:\n\
    <ul>\n\
	<li>scrivere direttamente codice ABC nell\'area di testo, oppure</li>\n\
	<li>incollare codice ABC nell\'area di testo, oppure</li>\n\
	<li>caricare un file ABC locale (menu \'ABC | Carica file\'), oppure</li>\n\
	<li>trascinare un file locale da file manager\n\
		o del testo selezionato nell\'area di testo.</li>\n\
    </ul></li>\n\
	<li>Puoi modificare il codice ABC nell\'area di testo;<br/>\n\
	dopo 2 secondi la musica viene visualizzata o aggiornata.</li>\n\
	<li>L\'opzione \'Stampa\' del browser stampa la musica.</li>\n\
<li>Puoi selezionare parte di un brano sia nell\'area di testo\
	(fai click e seleziona), o nell\'area dello spartito.<br/>\n\
	In questo caso, un click su un elemento musicale inizia la selezione,\
	mentre un click col tasto destro la termina.<br/>\
	Inoltre, se il browser può suonare la musica, un click col tasto destro\
	al di fuori della musica mostra il menu Suonare.</li>\
</ul>'
}
