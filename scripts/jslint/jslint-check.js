/* This is adapted from:
  https://github.com/jquery/jquery/raw/master/build/jslint-check.js
*/

if (arguments.length !== 3) {
    print("Usage: jslint-check.js <jslint.js> <absolute-filename> <relative-filename>");
    quit();
}

load(arguments[0]);

var src = readFile(arguments[1],'UTF-8');
var relativeFilename = arguments[2];

if (!src) {
    print("Failed to load: "+arguments[1]);
    quit();
}

JSLINT(src);

// All of the following are known issues that we think are 'ok'
// (in contradiction with JSLint) more information here:
// http://docs.jquery.com/JQuery_Core_Style_Guidelines
var ok = {
};
//     "Expected an identifier and instead saw 'undefined' (a reserved word).": true,
//     "Use '===' to compare with 'null'.": true,
//     "Use '!==' to compare with 'null'.": true,
//     "Expected an assignment or function call and instead saw an expression.": true,
//     "Expected a 'break' statement before 'case'.": true,
//     "'e' is already defined.": true
// };

var e = JSLINT.errors, found = 0, w;

for (var i = 0; i < e.length; i++) {
    w = e[i];
    if (w && !ok[w.reason]) {
	found++;
	print(relativeFilename+":"+w.line+": "+w.reason);
	print(w.evidence+"\n");
    }
}

if (found > 0) {
    print(found + " error(s) found.");
} else {
    print("JSLint check passed.");
}
