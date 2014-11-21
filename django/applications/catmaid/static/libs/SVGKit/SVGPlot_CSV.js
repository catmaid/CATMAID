/***

SVGPlot_CSV.js 0.1

See <http://svgkit.sourceforge.net/> for documentation, downloads, license, etc.

(c) 2006 Jason Gallicchio.
Licensed under the open source (GNU compatible) MIT License

    This is a JavaScript library for reading and writing 
    Comma Seperated Variable strings.

    TODO: Handle space-seperated data properly -- many tables are given in this format
    TODO: Converstions to and from JSON, XML, HTML table
    TODO: Make an HTML table out of the read-in CSV table in the test page
***/

SVGPlot.CSV = {

    parse : function(data) {
        /***
            A recursive function that parses a string or
            lists of (possibly lists of lists of...) strings
            
            Parse the string and return either an integer, float, Date, or string
            
            Currently doesn't handle money:  '$23.30' is treated like a string
            Strip leading and trailing whitespace before applying tests?
            Note:  'NaN' and 'INF' get parsed as floats, as are percents and fractions
        ***/
        
        if (typeof(data) == 'object' && data.constructor == Array)
            return map(SVGPlot.CSV.parse, data)
            
        // Check if it's an integer, then a float
        if (/^\s*[+-]?\d+\s*$/.test(data))
            return parseInt(data)
        if (/^\s*[+-]?(\d*\.\d+|\d+\.\d*)([eE][+-]?\d+)?\s*$|^\s*([+-]INF|NaN)\s*$/.test(data))
            return parseFloat(data)
        
        // Check if it's a percent, and if so, return a float
        if (/^\s*[+-]?(\d*\.\d+|\d+\.\d*)%\s*$/.test(data))
            return parseFloat(data)/100.0
            
        // Check if it's a faction, and if so, return a float
        if (/^\s*[+-]?\d+\/\d+\s*$/.test(data))
            return eval(data)
        
        // Check if it's a date that JavaScript recognizes
        var ms = Date.parse(data)
        if ( !isNaN(ms) )
            return new Date(ms)
        // Check if it's a date that JavaScript doesn't recognize
        var iso = isoTimestamp(data)
        if (iso != null && iso.constructor == Date)
            return iso
        
        // Otherwise it's a string
        return data
    },


    readCSV : function(string, delimiter /*=','*/) {
        /***
        Input:
        CSV is defined to map a 2D array of arbitrary strings 
        called "fields" into one long string that can be stored in a file.
        
        Each record is one line, but a quoted field can contain a newline, 
            also the newlines may be just lf='\x0A' or both crlf pair '\x0D' '\x0A'
        Fields are separated with commas.
        Leading and trailing space-characters adjacent to comma field separators are ignored.
        Fields with embedded commas, quotes, or line breaks must be delimited with double-quote characters.
        Double quotes inside the field must be replaced by two double quotes: " -> ""
        Fields with leading or trailing spaces must be delimited with double-quote characters.
        Fields may always be delimited with double quotes. (Even if they are numeric)
        The first record in a CSV file may be a header record containing column (field) names
        
        Output:
        The output is a list of lists of strings:  [ ['1','2','3'], ['4','5','6'] ]
        These strings can be later interpreted as numbers and dates later with the parser
        Empty lines will be returned as an empty list, except the last empty line, which is ignored
        Empty data (two commas in a row) will be returned as an empty string ''
        
        Reference:
        http://en.wikipedia.org/wiki/Comma-separated_values
        http://www.creativyst.com/Doc/Articles/CSV/CSV01.htm
        http://tools.ietf.org/html/rfc4180
        
        Example CSV from Wikipedia:
        1997,Ford,E350,"ac, abs, moon",3000.00
        1999,Chevy,"Venture ""Extended Edition""",,4900.00
        1996,Jeep,Grand Cherokee,"MUST SELL!
        air, moon roof, loaded",4799.00
        ***/
        
        delimiter = SVGKit.firstNonNull(delimiter, ',\t|')
        
        var table = []
        var current_row = []
        var current_field = ''
        var trailing_spaces = ''
        //var inside_quotes = false  // Mode flag: true while inside quoted field
        
        var WAIT = 0    // Waiting for data to start (after a comma or new line)
        var QUOTES = 1
        var FIELD = 2
        var state = WAIT 
        
        var i = 0;
        
        var newline = function() {
            // Test for a blank line:
            if (current_row.length == 0 && current_field == '')
                table.push([])
            else {
                current_row.push(current_field)
                table.push(current_row)
                current_field = ''
                current_row = []
            }
            trailing_spaces = '' 
            // If we're in windows, we have to gobble up the next character
            if (i+1 < string.length && string[i] == '\x0D' &&  string[i+1] == '\x0A')
                i += 1
            state = WAIT
        }
        
        for (i=0; i<string.length; i++) {
            if (state == WAIT) {
                // Quote
                if (string[i] == '"')
                    state = QUOTES
                else if (delimiter.indexOf(string[i]) != -1)
                    current_row.push('')  // Still in WAIT state
                else if (string[i] == '\x0A' || string[i] == '\x0D')
                    newline()
                else if (string[i] != ' ') {
                    state = FIELD
                    current_field += string[i]
                }
            }
            else if (state == QUOTES) {
                if (string[i] == '"' && i+1 < string.length &&  string[i+1] == '"') 
                    current_field += '"'
                else if (string[i] == '"')
                    state = FIELD
                else // This includes spaces, commans, and new line characters
                    current_field += string[i]
            }
            else if (state == FIELD) {
                if (string[i] == '"')   // Is this an error to get quotes after you've stared a field?
                    state = QUOTES
                else if (string[i] == ' ')
                    trailing_spaces += ' '
                else if (string[i] == '\x0A' || string[i] == '\x0D')
                    newline()
                else if (delimiter.indexOf(string[i]) != -1) {
                    current_row.push(current_field)
                    current_field = ''
                    trailing_spaces = ''
                    state = WAIT
                }
                else {
                    current_field += trailing_spaces
                    current_field += string[i]
                    trailing_spaces = ''
                }
            }
        }
        
        // We're through reading the file, but there still may be stuff to do
        // If the last thing we saw wasn't a newline, pretend we saw one
        if (string[i-1] != '\x0D' &&  string[i-1] != '\x0A')
            newline()
        
        // Strip out empty lines at the end
        while (table.length > 0 && table[table.length-1].length == 0)
            table.pop()
        
        return table
    },
    
    parseCSV : function(string, delimiter /*=','*/) {
        var table = SVGPlot.CSV.readCSV(string, delimiter)
        var parsed = SVGPlot.CSV.parse(table)
        return parsed
    },
    
    writeCSV : function(table, delimiter /*=','*/) {
        /***
            Return a string that is the CSV encoding of the table.
            Strings are ALWAYS surrounded by quotes and numbers aren't.
            
            This isn't necesary for CSV becuse it's a string to string format,
            but it seemed the nice thing to do and aviods needing to find the special
            cases where this is necessary.
        ***/
        delimiter = SVGKit.firstNonNull(delimiter, ',')
        var result = ''
        
        var do_field = function(field) {
            if (typeof(field) == "string") {
                //var require_quotes = field.indexOf('"') != -1 || field.indexOf(delimiter) != -1
                
                // replace each double quote character with two
                var escaped_quotes = field.replace(/"/g, '""')
                result += '"' + escaped_quotes + '"'
            }
            else if (typeof(field) == "number")
                result += field
            else if (typeof(field) == "object" && field.constructor == Date)
                result += toISOTimestamp(field)
            else
                result += ''  // Error?
        }
        
        var do_row = function(row) {
            var first = true
            for (var j=0; j<row.length; j++) {
                if (!first) 
                    result += delimiter
                do_field(row[j])
                first = false
            }
        }
        
        for (var i=0; i<table.length; i++) {
            do_row(table[i])
            result += '\n'
        }
        
        return result
    }
}

/*
var parseTest = function() {
    
    var list = [
        ['1234', '-4321'],
        ['1.2', '3.', '.4', '+5.6', '+7.', '+.8', '-9.9', '-1.', '-.2', '+3.4e2', '-5.E2', '.6e-4'],
        ['7.8%'],
        [],
        ['8/3/79', 'March 3, 2006', '01/01/2001'],
        ['2001-01-01', '2001-01-01 12:02:01'],
        ['2001-01-01 12:02:01Z', '2001-01-01T12:02:01Z', '2001-01-01T12:02:01-0500' ],
        ['Jason', 'INF', 'NaN']
    ]
    
    var parsed = SVGPlot.CSV.parse(list)
    log(repr(parsed))
}
parseTest()


var testCSV = function() {
    var string = '1,2,3'
    var string = '1,2,3\n'
    var string = '1,2,3\n\n\n'
    var string = '1,2,3\n\n\n,,,'
    var string = '1,2,3\n,2,,'
    var string = '  1,2   ,3   \n1  ,    2   ,   3'
    
    var string = 'John,Doe,120 jefferson st.,Riverside, NJ, 08075\n\
Jack,McGinnis,220 hobo Av.,Phila, PA,09119'
    var string = '1997,Ford,E350,"ac, abs, moon",3000.00\n\
1999,Chevy,"Venture ""Extended Edition""",,4900.00\n\
1996,Jeep,Grand Cherokee,"MUST SELL!\n\
air, moon roof, loaded",4799.00'

    var table = SVGPlot.CSV.readCSV(string)
    log(repr(table))
    var parsed = SVGPlot.CSV.parse(table)
    log(repr(parsed))
    log(SVGPlot.CSV.writeCSV(parsed))
}
testCSV()
*/