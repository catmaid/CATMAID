/**
 * Raphael.Export https://github.com/ElbertF/Raphael.Export
 *
 * Licensed under the MIT license:
 * http://www.opensource.org/licenses/mit-license.php
 *
 */

(function(R) {
	/**
	* Escapes string for XML interpolation
	* @param value string or number value to escape
	* @returns string escaped
	*/
	function escapeXML(s) {
		if ( typeof s === 'number' ) return s.toString();

		var replace = { '<': 'lt', '>': 'gt', '"': 'quot', '\'': 'apos' };

		for ( var entity in replace ) {
			s = s.replace(new RegExp(entity, 'g'), '&' + replace[entity] + ';');
		}

		return s;
	}

	/**
	* Generic map function
	* @param iterable the array or object to be mapped
	* @param callback the callback function(element, key)
	* @returns array
	*/
	function map(iterable, callback) {
		var mapped = [],
			undef = 'undefined',
			i;

		// use an index iteration if we're dealing with an array
		if( typeof iterable.unshift != 'undefined'){
			var l = iterable.length;
			for ( i = 0; i < l; i++ ) {
				if( typeof iterable[i] != undef ){
					var value = callback.call(this, iterable[i], i);
					if( value !== null ) mapped.push(value);
				}
			}
		} else {
			for ( i in iterable ) {
				if ( iterable.hasOwnProperty(i) ) {
					var value = callback.call(this, iterable[i], i);
					if ( value !== null ) mapped.push(value);
				}
			}
		}

		return mapped;
	}

	/**
	* Generic reduce function
	* @param iterable array or object to be reduced
	* @param callback the callback function(initial, element, i)
	* @param initial the initial value
	* @return the reduced value
	*/
	function reduce(iterable, callback, initial) {
		for ( var i in iterable ) {
			if ( iterable.hasOwnProperty(i) ) {
				initial = callback.call(this, initial, iterable[i], i);
			}
		}

		return initial;
	}

	/**
	* Utility method for creating a tag
	* @param name the tag name, e.g., 'text'
	* @param attrs the attribute string, e.g., name1="val1" name2="val2"
	* or attribute map, e.g., { name1 : 'val1', name2 : 'val2' }
	* @param content the content string inside the tag
	* @returns string of the tag
	*/
	function tag(name, attrs, matrix, content) {
		if ( typeof content === 'undefined' || content === null ) {
			content = '';
		}

		if ( typeof attrs === 'object' ) {
			attrs = map(attrs, function(element, name) {
				switch ( name ) {
					case 'transform':
						return;

					case 'fill':
						if ( element.match(/^hsb/) ) {
							var hsb = element.replace(/^hsb\(|\)$/g, '').split(',');

							if ( hsb.length === 3 ) {
								element = R.hsb2rgb(hsb[0], hsb[1], hsb[2]).toString();
							}
						}
				}

				return name + '="' + escapeXML(element) + '"';
			}).join(' ');
		}

		return '<' + name + ( matrix ? ' transform="matrix(' + matrix.toString().replace(/^matrix\(|\)$/g, '') + ')" ' : ' ' ) + attrs + '>' +  content + '</' + name + '>';
	}

	/**
	* @return object the style object
	*/
	function extractStyle(node) {
		return {
			font: {
				family: node.attrs.font.replace(/^.*?"(\w+)".*$/, '$1'),
				size:   typeof node.attrs['font-size'] === 'undefined' ? null : parseInt( node.attrs['font-size'] ),
				style: typeof node.attrs['font-style'] === 'undefined' ? null : node.attrs['font-style'],
				weight: typeof node.attrs['font-weight'] === 'undefined' ? null : node.attrs['font-weight']		
				}
			};
	}

	/**
	* @param style object from style()
	* @return string
	*/
	function styleToString(style) {
		// TODO figure out what is 'normal'
		// Tyler: it refers to the default inherited from CSS. Order of terms here:
		// 		  http://www.w3.org/TR/SVG/text.html#FontProperty
		var norm = 'normal',
			font = style.font;
		// return 'font: normal normal normal 10px/normal ' + style.font.family + ( style.font.size === null ? '' : '; font-size: ' + style.font.size + 'px' );
		return [ 'font:',
		         (font.style || norm), // font-style (e.g. italic)
		         norm, // font-variant
		         (font.weight || norm), // font-weight (e.g. bold)
		         (font.size ? font.size + 'px' : '10px') + '/normal', // font-size/IGNORED line-height!
		         font.family ].join(' ');
	}

	/**
	* Computes tspan dy using font size. This formula was empircally determined
	* using a best-fit line. Works well in both VML and SVG browsers.
	* @param fontSize number
	* @return number
	*/
	function computeTSpanDy(fontSize, line, lines) {
		if ( fontSize === null ) fontSize = 10;

		//return fontSize * 4.5 / 13
		return fontSize * 4.5 / 13 * ( line - .2 - lines / 2 ) * 3.5;
	}

	var serializer = {
		'text': function(node) {
			var style = extractStyle(node),
				tags = new Array,
				textLines = node.attrs['text'].split('\n'),
				totalLines = textLines.length;
			
			map(textLines, function(text, line) {
                tags.push(tag(
					'text',
					reduce(
						node.attrs,
						function(initial, value, name) {
							if ( name !== 'text' && name !== 'w' && name !== 'h' ) {
								if ( name === 'font-size') value = parseInt(value) + 'px';

								initial[name] = escapeXML(value.toString());
							}

							return initial;
						},
						{ style: 'text-anchor: middle; ' + styleToString(style) + ';' }
						),
					node.matrix,
					tag('tspan', { dy: computeTSpanDy(style.font.size, line + 1, totalLines) }, null, text)
				));
			});

			return tags;
		},
		'path' : function(node) {
			var initial = ( node.matrix.a === 1 && node.matrix.d === 1 ) ? {} : { 'transform' : node.matrix.toString() };

			return tag(
				'path',
				reduce(
					node.attrs,
					function(initial, value, name) {
						if ( name === 'path' ) name = 'd';

						initial[name] = value.toString();

						return initial;
					},
					{}
				),
				node.matrix
				);
		}
		// Other serializers should go here
	};

	R.fn.toSVG = function() {
		var
			paper   = this,
			restore = { svg: R.svg, vml: R.vml },
			svg     = '<svg style="overflow: hidden; position: relative;" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + paper.width + '" version="1.1" height="' + paper.height + '">'
			;

		R.svg = true;
		R.vml = false;

		for ( var node = paper.bottom; node != null; node = node.next ) {
			if ( node.node.style.display === 'none' ) continue;

			var attrs = '';

			// Use serializer
			if ( typeof serializer[node.type] === 'function' ) {
				svg += serializer[node.type](node);

				continue;
			}

			switch ( node.type ) {
				case 'image':
					attrs += ' preserveAspectRatio="none"';
					break;
			}

			for ( i in node.attrs ) {
				var name = i;

				switch ( i ) {
					case 'src':
						name = 'xlink:href';

						break;
					case 'transform':
						name = '';

						break;
				}

				if ( name ) {
					attrs += ' ' + name + '="' + escapeXML(node.attrs[i].toString()) + '"';
				}
			}

			svg += '<' + node.type + ' transform="matrix(' + node.matrix.toString().replace(/^matrix\(|\)$/g, '') + ')"' + attrs + '></' + node.type + '>';
		}

		svg += '</svg>';

		R.svg = restore.svg;
		R.vml = restore.vml;

		return svg;
	};
})(window.Raphael);
