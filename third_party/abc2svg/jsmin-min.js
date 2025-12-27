//jsmin.js-script to minify JS files
var EOF=undefined,theA,theB,theLookahead=EOF,theX=EOF,theY=EOF
function error(s){std.err.printf("JSMIN Error: "+s)
std.exit(1)}
function isAlphanum(c){return((c>='a'&&c<='z')||(c>='0'&&c<='9')||(c>='A'&&c<='Z')||c=='_'||c=='$'||c=='\\'||c>126)}
var fb=std.in.readAsString(),fp=-1
function get(){var c=theLookahead
theLookahead=EOF
if(c==EOF){c=fb[++fp]
if(!c)
return EOF}
if(c>=' '||c=='\n')
return c
if(c=='\r')
return'\n'
return' '}
function peek(){theLookahead=get()
return theLookahead}
function next(){var c=get()
if(c=='/'){switch(peek()){case'/':while(1){c=get()
if(c<='\n')
break}
break
case'*':get()
while(c!=' '){switch(get()){case'*':if(peek()=='/'){get()
c=' '}
break
case EOF:error("Unterminated comment.")
break}}
break}}
theY=theX
theX=c
return c}
var line=""
function put(c){if(c=='\n'){print(line)
line=""}else{line+=c}}
function action(d){switch(d){case 1:put(theA)
if((theY=='\n'||theY==' ')&&(theA=='+'||theA=='-'||theA=='*'||theA=='/')&&(theB=='+'||theB=='-'||theB=='*'||theB=='/')){put(theY)}
case 2:theA=theB
if(theA=='\''||theA=='"'||theA=='`'){while(1){put(theA)
theA=get()
if(theA==theB)
break
if(theA=='\\'){put(theA)
theA=get()}
if(theA==EOF)
error("Unterminated string literal.")}}
case 3:theB=next()
if(theB=='/'&&(theA=='('||theA==','||theA=='='||theA==':'||theA=='['||theA=='!'||theA=='&'||theA=='|'||theA=='?'||theA=='+'||theA=='-'||theA=='~'||theA=='*'||theA=='/'||theA=='{'||theA=='\n')){put(theA)
if(theA=='/'||theA=='*')
put(' ')
put(theB)
while(1){theA=get()
if(theA=='['){while(1){put(theA)
theA=get()
if(theA==']')
break
if(theA=='\\'){put(theA)
theA=get()}
if(theA==EOF)
error("Unterminated set in Regular Expression literal.")}}else if(theA=='\n'){break}else if(theA=='/'){switch(peek()){case'/':case'*':error("Unterminated set in Regular Expression literal.")}
break}else if(theA=='\\'){put(theA)
theA=get()}
if(theA==EOF)
error("Unterminated Regular Expression literal.")
put(theA)}
theB=next()}}}
function jsmin(){theA=get()
theB=get()
while(theA!=EOF){switch(theA){case' ':action(isAlphanum(theB)?1:2)
break
case'\n':switch(theB){case'{':case'[':case'(':case'+':case'-':case'!':case'~':action(1)
break
case' ':action(3)
break
default:action(isAlphanum(theB)?1:2)
break}
break
default:switch(theB){case' ':action(isAlphanum(theA)?1:3)
break
case'}':action(theA==';'?2:1)
break
case'\n':switch(theA){case'}':case']':case')':case'+':case'-':case'"':case'\'':case'`':action(1)
break
default:action(isAlphanum(theA)?1:3)
break}
break
default:action(1)
break}}}}
function comments(){var arg,args=scriptArgs
args.shift()
while(1){arg=args.shift()
if(!arg)
break
print("// "+arg)}}
comments()
jsmin()
if(line)
print(line)
