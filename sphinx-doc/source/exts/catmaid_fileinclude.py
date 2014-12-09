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
        'prepend': directives.unchanged_required,
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
            text = prepend + ' ' + text

        retnode = nodes.literal_block(text, text, source=filename)
        set_source_info(self, retnode)

        env.note_dependency(rel_filename)
        return [retnode]


def setup(app):
    app.add_directive('fileinclude', FileInputDirective)
