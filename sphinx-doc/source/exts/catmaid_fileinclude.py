# -*- coding: utf-8 -*-

import codecs

from docutils import nodes
from docutils.parsers.rst import Directive, directives

from sphinx.util.nodes import set_source_info


class FileInputDirective(Directive):
    has_content = False
    required_arguments = 1
    optional_arguments = 0
    final_argument_whitespace = True
    option_spec = {
        'removelinebreaks': directives.flag,
        'prepend': directives.unchanged,
        'indent': directives.flag,
        'split': int,
        'splitend': directives.unchanged,
    }

    def run(self):
        document = self.state.document
        if not document.settings.file_insertion_enabled:
            return [document.reporter.warning('File insertion disabled',
                                              line=self.lineno)]
        env = document.settings.env
        rel_filename, filename = env.relfn2path(self.arguments[0])

        encoding = self.options.get('encoding', env.config.source_encoding)
        codec_info = codecs.lookup(encoding)
        f = None
        try:
            f = codecs.StreamReaderWriter(open(filename, 'rb'),
                    codec_info[2], codec_info[3], 'strict')
            lines = f.readlines()
        except (IOError, OSError):
            return [document.reporter.warning(
                'Include file %r not found or reading it failed' % filename,
                line=self.lineno)]
        except UnicodeError:
            return [document.reporter.warning(
                'Encoding %r used for reading included file %r seems to '
                'be wrong, try giving an :encoding: option' %
                (encoding, filename))]
        finally:
            if f is not None:
                f.close()

        text = ''.join(lines)

        if 'removelinebreaks' in self.options:
            text = text.replace('\n', ' ').replace('\r', ' ')

        prepend = self.options.get('prepend')
        if prepend is not None:
            prepend = prepend + ' '
            text = prepend + text

        split = self.options.get('split')
        if split is not None:
            splitend = self.options.get('splitend', '')

            linelength = split - len(splitend)

            # Add a line break if the text will be split into multiple lines
            if len(text) > split:
                splitend += '\n'

            output, start, end = '', 0, linelength
            while True:
                # Find last space in range and extract text before it
                end = min(text.rfind(' ', start, end) + 1, len(text))
                line = text[start:end]
                # Prepend spaces in the length of 'prepend' for all but the
                # first line.
                if start > 0:
                    line = ' ' * len(prepend) + line

                output += line
                start = end
                end += linelength - len(prepend)

                if start == len(text):
                    text = output.rstrip()
                    break
                else:
                    # Don't insert split end on last line
                    output += splitend


        retnode = nodes.literal_block(text, text, source=filename)
        set_source_info(self, retnode)

        env.note_dependency(rel_filename)
        return [retnode]


def setup(app):
    app.add_directive('fileinclude', FileInputDirective)
