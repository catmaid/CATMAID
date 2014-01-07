/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */

(function ($) {
  /**
   * Creates a new combobox widget that supports autocompletion. It is based on
   * the autocomplete demo at http://jqueryui.com/autocomplete/#combobox and the
   * stack overflow answer at http://stackoverflow.com/a/15246954/1665417. It
   * also includes additions from
   * http://robertmarkbramprogrammer.blogspot.com/2010/09/event-handling-with-jquery-autocomplete.html
   */
  $.widget("ui.combobox", {
    _create: function () {
      var input,
          that = this,
          wasOpen = false,
          select = this.element,
          theWidth = select.width(),
          theTitle = select.attr("title"),
          selected = select.children(":selected"),
          defaultValue = selected.text() || "",
          wrapper = this.wrapper = $("<span>")
          .addClass("ui-combobox")
          .insertAfter(select);
      // Hide original combo box
      select.hide();

      function removeIfInvalid(element) {
        var value = $(element).val(),
            matcher = new RegExp("^" + $.ui.autocomplete.escapeRegex(value) + "$", "i"),
            valid = false;
        select.children("option").each(function () {
          if ($(this).text().match(matcher)) {
            this.selected = valid = true;
            return false;
          }
        });

        if (!valid) {
          // remove invalid value, as it didn't match anything
          $(element).val(defaultValue);
          select.val(defaultValue);
          input.data("ui-autocomplete").term = "";
        }
      }

      input = this.input = $("<input style=\"width:" + theWidth + "px;\">")
        .appendTo(wrapper)
        .val(defaultValue)
        .attr("title", '' + theTitle + '')
        .addClass("ui-state-default ui-combobox-input")
        .width(select.width())
        .autocomplete({
          delay: 0,
          minLength: 0,
          autoFocus: true,
          source: function (request, response) {
            var matcher = new RegExp($.ui.autocomplete.escapeRegex(request.term), "i");
            response(select.children("option").map(function () {
              var text = $(this).text();
              if (this.value && (!request.term || matcher.test(text)))
                return {
                  label: text.replace(
                  new RegExp(
                    "(?![^&;]+;)(?!<[^<>]*)(" +
                    $.ui.autocomplete.escapeRegex(request.term) +
                    ")(?![^<>]*>)(?![^&;]+;)", "gi"
                  ), "<strong>$1</strong>"),
                  value: text,
                  option: this
                };
            }));
          },
          select: function (event, ui) {
            ui.item.option.selected = true;
            that._trigger("selected", event, {
              item: ui.item.option
            });
          },
          change: function (event, ui) {
            if (!ui.item) {
              removeIfInvalid(this);
            }
          }
        })
        .addClass("ui-widget ui-widget-content ui-corner-left");

      input.data("ui-autocomplete")._renderItem = function (ul, item) {
        return $("<li>")
          .append("<a>" + item.label + "</a>")
          .appendTo(ul);
      };

      $("<a>")
        .attr("tabIndex", -1)
        .appendTo(wrapper)
        .button({
          icons: {
            primary: "ui-icon-triangle-1-s"
          },
          text: false
        })
        .removeClass("ui-corner-all")
        .addClass("ui-corner-right ui-combobox-toggle")
        .mousedown(function () {
          wasOpen = input.autocomplete("widget").is(":visible");
        })
        .click(function () {
          input.focus();

          // close if already visible
          if (wasOpen) {
            return;
          }

          // pass empty string as value to search for, displaying all results
          input.autocomplete("search", "");
        });
    },

    _destroy: function () {
      this.wrapper.remove();
      this.element.show();
    },

    set_value: function(value) {
      this.element.val(value);
      this.input.val($(this.element).find('option:selected').text());
    }
  });
})(jQuery);
