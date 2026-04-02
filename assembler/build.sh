#!/bin/sh

java REx -backtrack -javascript -tree -main grammar/WAT.ebnf
mv -f WAT.js WAT-main.js
java REx -backtrack -javascript -tree grammar/WAT.ebnf
java -jar rr.war grammar/WAT.ebnf > WAT.xhtml