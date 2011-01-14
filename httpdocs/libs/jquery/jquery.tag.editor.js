/*
@inital author: Karl-Johan Sjögren / http://blog.crazybeavers.se/
@contributor: Joost Elfering / http://yopefonic.wordpress.com/
@url: http://blog.crazybeavers.se/wp-content/demos/jquery.tag.editor/
@license: Creative Commons License - ShareAlike http://creativecommons.org/licenses/by-sa/3.0/
@version: 1.4.1
@changelog
1.4.1
Karl-Johan Sjögren
-Removed all references to $ to make sure that it is compatible even when using other libraries that bind to $
-Reorganized the code and cleaned it up to pass the JSLint-test to make sure that it works when minified
-Switched minifier to YUI Compressor since Packer broke the script (even though it passes JSLint)
1.4
Karl-Johan Sjögren
-Normalized the string chars in the script to '
-Added a minified version of the script to the package using http://base2.googlecode.com/svn/trunk/src/apps/packer/packer.html
Joost Elfering
-Major change in extension of the object
-Moved getTags to tagEditorGetTags for naming convention
-Changed tagEditor so that it can be called without arguments
-Changed call for getTags to $(object).tagEditorGetTags()
-Changed addTag to return a true or false value as a success indicator
-Added resetTags method to clear the input and set the default given tags as start
-Added tagEditorResetTags as API for resetTags: $(object).tagEditorResetTags()
-Added tagEditorAddTag as API for addTag: $(object).tagEditorAddTag('string')
-Added continuousOutputBuild option to allow continuous building for dynamic forms
-Added tagsBeforeField option to switch places between tags added and the input field
-Added imageTag option to add and image to the list for styling purposes
-Added imageTagUrl option to define custom image for styling purposes
1.3
-Any string already in the textbox when enabling the tag editor is now parsed as tags
-Added initialParse to stop the initial parsing
-Added confirmRemovalText as an option to better support different localizations
-Added the getTags method.
-Fixed completeOnBlur that wasn't working
1.2
-Fixed bug with completeOnSeparator for Firefox
-Fixed so that pressing return on an empty editor would submit the form
1.1
-Initial public release
-Added the completeOnSeparator and completeOnBlur options
*/
(function(jQuery) {
    jQuery.fn.tagEditor = function(options) {
        var defaults = {
            separator: ',',
            items: [],
            className: 'tagEditor',
            confirmRemoval: false,
            confirmRemovalText: 'Do you really want to remove the tag?',
            completeOnSeparator: false,
            completeOnBlur: false,
            tagsBeforeField: false,
            initialParse: true,
            imageTag: false,
            imageTagUrl: '',
            continuousOutputBuild: false
        };

        options = jQuery.extend(defaults, options);

        var listBase, textBase = this, hiddenText;
        var itemBase = [];

        return this.each(function() {
            function addTag(tag) {
                tag = jQuery.trim(tag);
                for (var i = 0; i < itemBase.length; i++) {
                    if (itemBase[i].toLowerCase() == tag.toLowerCase()) {
                        return false;
                    }
                }

                var item = jQuery(document.createElement('li'));
                item.text(tag);
                item.attr('title', 'Remove tag');
                if (options.imageTag) {
                    item.append('<img src="' + options.imageTagUrl + '">');
                }

                item.click(function() {
                    if (options.confirmRemoval) {
                        if (!confirm(options.confirmRemovalText)) {
                            return;
                        }
                    }

                    item.remove();
                    parse();
                });

                listBase.append(item);
                return true;
            }

            function resetTags() {
                itemBase = [];
                listBase.html('');
                textBase.val('');
                hiddenText.val('');
                for (var i = 0; i < options.items.length; i++) {
                    addTag(jQuery.trim(options.items[i]));
                }
                parse();
            }

            function buildArray() {
                itemBase = [];
                var items = jQuery('li', listBase);

                for (var i = 0; i < items.length; i++) {
                    itemBase.push(jQuery.trim(jQuery(items[i]).text()));
                }

                if (options.continuousOutputBuild) {
                    hiddenText.val(itemBase.join(options.separator));
                }
            }

            function parse() {
                var items = textBase.val().split(options.separator);

                for (var i = 0; i < items.length; i++) {
                    var trimmedItem = jQuery.trim(items[i]);
                    if (trimmedItem.length > 0) {
                        addTag(trimmedItem);
                    }
                }

                textBase.val('');
                buildArray();
            }

            function handleKeys(ev) {
                var keyCode = (ev.which) ? ev.which : ev.keyCode;

                if (options.completeOnSeparator) {
                    if (String.fromCharCode(keyCode) == options.separator) {
                        parse();
                        return false;
                    }
                }

                switch (keyCode) {
                    case 13:
                        if (jQuery.trim(textBase.val()) != '') {
                            parse();
                            return false;
                        }
                        return true;
                    default:
                        return true;
                }
            }

            jQuery.fn.extend({
                tagEditorGetTags: function() {
                    return itemBase.join(options.separator);
                },
                tagEditorResetTags: function() {
                    resetTags();
                },
                tagEditorAddTag: function(tag) {
                    return addTag(tag);
                }
            });

            hiddenText = jQuery(document.createElement('input'));
            hiddenText.attr('type', 'hidden');
            if (options.continuousOutputBuild) {
                hiddenText.attr('name', textBase.attr('name'));
                textBase.attr('name', textBase.attr('name') + '_old');
            }
            textBase.after(hiddenText);

            listBase = jQuery(document.createElement('ul'));
            listBase.attr('class', options.className);
            if (options.tagsBeforeField) {
                jQuery(this).before(listBase);
            } else {
                jQuery(this).after(listBase);
            }

            for (var i = 0; i < options.items.length; i++) {
                addTag(jQuery.trim(options.items[i]));
            }

            if (options.initialParse) {
                parse();
            }

            if (options.completeOnBlur) {
                jQuery(this).blur(parse);
            }

            buildArray();
            jQuery(this).keypress(handleKeys);

            var form = jQuery(this).parents('form');

            if (!options.continuousOutputBuild) {
                form.submit(function() {
                    parse();
                    hiddenText.val(itemBase.join(options.separator));
                    hiddenText.attr('id', textBase.attr('id'));
                    hiddenText.attr("name", textBase.attr('name'));
                    textBase.attr('id', textBase.attr('id') + '_old');
                    textBase.attr('name', textBase.attr('name') + '_old');

                });
            }
        });
    };
})(jQuery);