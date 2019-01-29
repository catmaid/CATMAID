/*!
 * Pointy.js
 * Pointer Events polyfill for jQuery
 * https://github.com/vistaprint/PointyJS
 *
 * Depends on jQuery, see http://jquery.org
 *
 * Developed by Vistaprint.com
 */

(function ($, window, document, undefined) {

    var support = {
        touch: "ontouchend" in document,
        pointer: !! (navigator.pointerEnabled || navigator.msPointerEnabled || window.PointerEvent)
    };

    $.extend($.support, support);

    function triggerCustomEvent(elem, eventType, originalEvent) {
        // support for IE7-IE8
        originalEvent = originalEvent || window.event;

        // Create a writable copy of the event object and normalize some properties
        var event = new jQuery.Event(originalEvent);
        event.type = eventType;

        // Copy over properties for ease of access
        var i, copy = $.event.props.concat($.event.pointerHooks.props);
        i = copy.length;
        while (i--) {
            var prop = copy[i];
            event[prop] = originalEvent[prop];
        }

        // Support: IE<9
        // Fix target property (#1925)
        if (!event.target) {
            event.target = originalEvent.srcElement || document;
        }

        // Support: Chrome 23+, Safari?
        // Target should not be a text node (#504, #13143)
        if (event.target.nodeType === 3) {
            event.target = event.target.parentNode;
        }

        // Support: IE<9
        // For mouse/key events, metaKey==false if it's undefined (#3368, #11328)
        event.metaKey = !! event.metaKey;

        // run the filter now
        event = $.event.pointerHooks.filter(event, originalEvent);

        // trigger the emulated pointer event
        // the filter can return an array (only if the original was a touchmove),
        // which means we need to trigger independent events
        if ($.isArray(event)) {
            $.each(event, function (i, ev) {
                $.event.dispatch.call(elem, ev);
            });
        } else {
            $.event.dispatch.call(elem, event);
        }

        // return the manipulated jQuery event
        return event;
    }

    function addEvent(elem, type, selector, func) {
        // when we have a selector, let jQuery do the delegation
        if (selector) {
            func._pointerEventWrapper = function (event) {
                return func.call(elem, event.originalEvent);
            };

            $(elem).on(type, selector, func._pointerEventWrapper);
        }

        // if we do not have a selector, we optimize by cutting jQuery out
        else {
            if (elem.addEventListener) {
                elem.addEventListener(type, func, false);
            } else if (elem.attachEvent) {

                // bind the function to correct "this" for IE8-
                func._pointerEventWrapper = function (e) {
                    return func.call(elem, e);
                };

                elem.attachEvent("on" + type, func._pointerEventWrapper);
            }
        }
    }

    function removeEvent(elem, type, selector, func) {
        // Make sure for IE8- we unbind the wrapper
        if (func._pointerEventWrapper) {
            func = func._pointerEventWrapper;
        }

        if (selector) {
            $(elem).off(type, selector, func);
        } else {
            $.removeEvent(elem, type, func);
        }
    }

    // get the standardized "buttons" property as per the Pointer Events spec from a mouse event
    function getStandardizedButtonsProperty(event) {
        // in the DOM LEVEL 3 spec there is a new standard for the "buttons" property
        // sadly, no browser currently supports this and only sends us the single "button" property
        if (event.buttons) {
            return event.buttons;
        }

        // standardize "which" property for use
        var which = event.which;
        if (!which && event.button !== undefined) {
            which = (event.button & 1 ? 1 : (event.button & 2 ? 3 : (event.button & 4 ? 2 : 0)));
        }

        // no button down (can happen on mousemove)
        if (which === 0) {
            return 0;
        }
        // left button
        else if (which === 1) {
            return 1;
        }
        // middle mouse
        else if (which === 2) {
            return 4;
        }
        // right mouse
        else if (which === 3) {
            return 2;
        }

        // unknown?
        return 0;
    }

    function returnFalse() { return false; }
    function returnTrue() { return true; }

    var POINTER_TYPE_UNAVAILABLE = "unavailable";
    var POINTER_TYPE_TOUCH = "touch";
    var POINTER_TYPE_PEN = "pen";
    var POINTER_TYPE_MOUSE = "mouse";

    // indicator to mark whether touch events are in progress
    // when null, it means we have never received a touch event
    // when number, user is currently touching something
    // when false, user just released their finger (reset on mousedown if needed)
    var _touching = null;

    // bitmask to identify which buttons are currently down
    var _buttons = 0;

    // storage of the last seen touches provided by the native touch events spec
    var _lastTouches = [];

    // ------ NOTE: THIS IS UNUSED, WE DO NOT ASSIGN BUTTON ------
    // pointer events defines the "button" property as:
    // mouse move (no buttons down)                         -1
    // left mouse, touch contact and normal pen contact     0
    // middle mouse                                         1
    // right mouse, pen with barrel button pressed          2
    // x1 (back button on mouse)                            3
    // x2 (forward button on mouse)                         4
    // pen contact with eraser button pressed               5
    // ------ NOTE: THIS IS UNUSED, WE DO NOT ASSIGN BUTTON ------

    // pointer events defines the "buttons" property as:
    // mouse move (no buttons down)                         0
    // left mouse, touch contact, and normal pen contact    1
    // middle mouse                                         4
    // right mouse, pen contact with barrel button pressed  2
    // x1 (back) mouse                                      8
    // x2 (forward) mouse                                   16
    // pen contact with eraser button pressed               32

    // add our own pointer event hook/filter
    $.event.pointerHooks = {
        props: "pointerType pointerId pressure buttons clientX clientY relatedTarget fromElement offsetX offsetY pageX pageY screenX screenY width height toElement".split(" "),
        filter: function (event, original) {
            // Calculate pageX/Y if missing and clientX/Y available
            // this is just copied from jQuery's standard pageX/pageY fix
            if (!original.touches && event.pageX == null && original.clientX != null) {
                var eventDoc = event.target.ownerDocument || document;
                var doc = eventDoc.documentElement;
                var body = eventDoc.body;

                event.pageX = original.clientX + (doc && doc.scrollLeft || body && body.scrollLeft || 0) - (doc && doc.clientLeft || body && body.clientLeft || 0);
                event.pageY = original.clientY + (doc && doc.scrollTop || body && body.scrollTop || 0) - (doc && doc.clientTop || body && body.clientTop || 0);
            }

            // Add relatedTarget, if necessary
            // also copied from jQuery's standard event fix
            if (!event.relatedTarget && original.fromElement) {
                event.relatedTarget = original.fromElement === event.target ? original.toElement : original.fromElement;
            }

            // Add pointerType
            if (!event.pointerType || typeof event.pointerType === "number") {
                if (event.pointerType == 2) {
                    event.pointerType = POINTER_TYPE_TOUCH;
                } else if (event.pointerType == 3) {
                    event.pointerType = POINTER_TYPE_PEN;
                } else if (event.pointerType == 4) {
                    event.pointerType = POINTER_TYPE_MOUSE;
                } else if (/^touch/i.test(original.type)) {
                    event.pointerType = POINTER_TYPE_TOUCH;
                    event.buttons = original.type === "touchend" || original.type === "touchcancel" ? 0 : 1;
                } else if (/^mouse/i.test(original.type) || original.type === "click") {
                    event.pointerId = 1; // as per the pointer events spec, the mouse is always pointer id 1
                    event.pointerType = POINTER_TYPE_MOUSE;
                    event.buttons = original.type === "mouseup" ? 0 : getStandardizedButtonsProperty(original);
                } else {
                    event.pointerType = POINTER_TYPE_UNAVAILABLE;
                    event.buttons = 0;
                }
            }

            // if we have the bitmask for the depressed buttons from the mouse events polyfill, use it to mimic buttons for
            // browsers that do not support the HTML DOM LEVEL 3 events spec
            if (event.type !== "pointerdown" && event.pointerType === "mouse" && _touching === null && _buttons !== event.buttons) {
                event.buttons = _buttons;
            }

            // standardize the pressure attribute
            if (!event.pressure) {
                event.pressure = event.buttons > 0 ? 0.5 : 0;
            }

            // standardize the width and height, these represent the contact geometry
            if (event.width === undefined || event.height === undefined) {
                event.width = event.height = 0;
            }

            // prevent the following native "click" event from occurring, can be used to prevent
            // clicks on "pointerdown" or "pointerup" or from gestures like "press" and "presshold"
            event.preventClick = function () {
                event.isClickPrevented = returnTrue;
                $(event.target).one("click", returnFalse);
            };

            event.isClickPrevented = returnFalse;

            // touch events send an array of touches we need to convert to the pointer events format
            // which means we need to fire multiple events per touch
            if (original.touches && event.type !== "pointercancel") {
                var touches = original.touches;
                var events = [];
                var ev, i, j;

                // the problem with this is that on "touchend" it will remove the
                // touch which has ended from the touches list, this means we do
                // not want to fire "pointerup" for touches that are still there,
                // we instead want to send a "pointerup" with the removed touch's identifier
                if (event.type === "pointerup") {
                    // convert TouchList to a standard array
                    _lastTouches = Array.prototype.slice.call(_lastTouches);

                    // find the touch that was removed
                    for (i = 0; i < original.touches.length; i++) {
                        for (j = 0; j < _lastTouches.length; j++) {
                            if (_lastTouches[j].identifier === original.touches[i].identifier) {
                                _lastTouches.splice(j, 1);
                            }
                        }
                    }

                    // if we narrowed down the ended touch to one, then we found it
                    if (_lastTouches.length === 1) {
                        event.pointerId = _lastTouches[0].identifier;
                        _lastTouches = original.touches;
                        return event;
                    }
                }
                // on "pointerdown" we need to only trigger a new "pointerdown" for the new touches (fingers),
                // and not the touches that were already active. Therefore we filter out all of the touches
                // based on their identifier that we already knew were active before
                else if (event.type === "pointerdown") {
                    // convert TouchList to a standard array
                    touches = Array.prototype.slice.call(original.touches);

                    // find the new touch that was just added
                    for (i = 0; i < touches.length; i++) {
                        // last touches will be a list with one less touch
                        for (j = 0; j < _lastTouches.length; j++) {
                            if (touches[i].identifier === _lastTouches[j].identifier) {
                                touches.splice(i, 1);
                            }
                        }
                    }
                }

                // this will be used on pointermove and pointerdown
                for (i = 0; i < original.touches.length; i++) {
                    var touch = original.touches[i];
                    ev = $.extend({}, event);
                    // copy over information from the touch to the event
                    ev.clientX = touch.clientX;
                    ev.clientY = touch.clientY;
                    ev.pageX = touch.pageX;
                    ev.pageY = touch.pageY;
                    ev.screenX = touch.screenX;
                    ev.screenY = touch.screenY;
                    // the touch id on emulated touch events from chrome is always 0 (zero)
                    ev.pointerId = touch.identifier;
                    events.push(ev);
                }

                // do as little processing as you can here, this is done on touchmove and
                // there can be a lot of those events firing quickly, we do not want the
                // polyfill slowing down the application
                _lastTouches = original.touches;
                return events;
            }

            return event;
        }
    };

    $.event.delegateSpecial = function (setup) {
        return function (handleObj) {
            var thisObject = this,
                data = jQuery._data(thisObject);

            if (!data.pointerEvents) {
                data.pointerEvents = {};
            }

            if (!data.pointerEvents[handleObj.type]) {
                data.pointerEvents[handleObj.type] = [];
            }

            if (!data.pointerEvents[handleObj.type].length) {
                setup.call(thisObject, handleObj);
            }

            data.pointerEvents[handleObj.type].push(handleObj);
        };
    };

    var indexOfArray = function (arr, obj) {
        if (arr.indexOf) {
            return arr.indexOf(obj);
        }

        for (var i=0; i<arr.length; i++) {
            if (arr[i] === obj) {
                return i;
            }
        }

        return -1;
    };

    $.event.delegateSpecial.remove = function (teardown) {
        return function (handleObj) {
            var handlers,
                thisObject = this,
                data = jQuery._data(thisObject);

            if (!data.pointerEvents) {
                data.pointerEvents = {};
            }

            handlers = data.pointerEvents[handleObj.type];

            handlers.splice(indexOfArray(handlers, handleObj), 1);

            if (!handlers.length) {
                teardown.call(thisObject, handleObj);
            }
        };
    };

    // allow jQuery's native $.event.fix to find our pointer hooks
    $.extend($.event.fixHooks, {
        pointerdown: $.event.pointerHooks,
        pointerup: $.event.pointerHooks,
        pointermove: $.event.pointerHooks,
        pointerover: $.event.pointerHooks,
        pointerout: $.event.pointerHooks,
        pointercancel: $.event.pointerHooks
    });

    // if browser does not natively handle pointer events,
    // create special custom events to mimic them
    if (!support.pointer) {
        // stores the scroll-y offest on "touchstart" and is compared
        // on touchend to see if we should trigger a click event
        var _startScrollOffset;

        // utility to return the scroll-y position
        var scrollY = function () {
            return Math.floor(window.scrollY || $(window).scrollTop());
        };

        $.event.special.pointerdown = {
            touch: function (event) {
                // set the pointer as currently down to prevent chorded "pointerdown" events
                _touching = event.timeStamp;

                // trigger a new "pointerdown" event
                triggerCustomEvent(this, "pointerdown", event);

                // set the scroll offset which is compared on TouchEnd
                _startScrollOffset = scrollY();

                // no matter what, you cannot simply always call preventDefault() on "touchstart"
                // this disables scrolling when touching the binded element, which is not appropriate.
            },
            mouse: function (event) {
                // if we just had a "touchstart", ignore this "mousedown" event, to prevent double firing of "pointerdown"
                if (typeof _touching === "number") {
                    return;
                }

                // we reset the touch to null, to indicate that we're listening to mouse events currently
                _touching = null;

                // update the _buttons bitmask
                var button = getStandardizedButtonsProperty(event);
                var wasAButtonDownAlready = _buttons !== 0;
                _buttons |= button;

                // do not trigger another "pointerdown" event if a button is currently down,
                // this prevents chorded "pointerdown" events which is defined in the Pointer Events spec
                if (wasAButtonDownAlready && _buttons !== button) {
                    // per the Pointer Events spec, when the active buttons change it fires only a "pointermove" event
                    triggerCustomEvent(this, "pointermove", event);
                    return;
                }

                triggerCustomEvent(this, "pointerdown", event);
            },
            add: $.event.delegateSpecial(function (handleObj) {
                // bind to touch events, some devices (chromebook) can send both touch and mouse events
                if (support.touch) {
                    addEvent(this, "touchstart", handleObj.selector, $.event.special.pointerdown.touch);
                }

                // bind to mouse events
                addEvent(this, "mousedown", handleObj.selector, $.event.special.pointerdown.mouse);

                // ensure we also bind to "pointerup" to properly clear signals and fire click event on "touchend"
                handleObj.pointerup = $.noop;
                $(this).on("pointerup", handleObj.selector, handleObj.pointerup);
            }),
            remove: $.event.delegateSpecial.remove(function (handleObj) {
                // unbind touch events
                if (support.touch) {
                    removeEvent(this, "touchstart", handleObj.selector, $.event.special.pointerdown.touch);
                }

                // unbind mouse events
                removeEvent(this, "mousedown", handleObj.selector, $.event.special.pointerdown.mouse);

                // unbind the special "pointerup" we added for cleanup
                if (handleObj.pointerup) {
                    $(this).off("pointerup", handleObj.selector, handleObj.pointerup);
                }
            })
        };

        $.event.special.pointerup = {
            touch: function (event) {
                // prevent default to prevent the emulated "mouseup" event from being triggered
                event.preventDefault();

                // safety check, if _touching is null then we just had a mouse event and shouldn't
                // listen to touch events right now
                if (_touching === null) {
                    return;
                }

                // timeStamp of when the last "touchstart" event was triggered,
                // used to prevent double fire issues on iOS 7+ devices when needed
                var lastTouchStarted = _touching;

                // trigger the emulated "pointerup" event, getting back the event
                var jEvent = triggerCustomEvent(this, "pointerup", event);

                // ensure we have a target before we attempt to deal with a "click" event
                if (!event.target) {
                    _touching = false; // release the "pointerdown" lock
                    return;
                }

                // while you may think if we are preventing the next "click" event (see jEvent.isClickPrevented)
                // we could simply not trigger one below, that turns out to be a bad assumption. Due to the
                // complex issue of dealing with various devices, often a click event is triggered regardless of
                // calling preventDefault on "touchend" so we have to still go on and determine if a "click"
                // event was triggered, if so, render it noop, if not, we don't have to trigger one then.

                // we confirm that the user did not scroll, as touch events are very related to scrolling on
                // touch devices, it's possible we may mis-fire a click event on an <a> anchor tag causing
                // navigation even though this was a scroll attempt. We let the browser's built in scrolling
                // threshold prevent accidental scrolling so we only need to check if they scrolled at all.
                if (_startScrollOffset !== scrollY()) {
                    _touching = false; // release the "pointerdown" lock
                    return;
                }

                // on "touchend", calling prevent default prevents the "mouseup" and "click" event
                // however on native "mouseup" events preventing default does not cancel the "click" event
                // as per the pointer event spec on "pointerup" preventing default should not cancel the "click" event
                //
                // so we really want to have a "click" event all the time. If a function binded to this emulated
                // "poiunterup" calls prevent default it would result in preventing the "click" event, which would
                // cause inconsistent behavior. To prevent the possibility of two click events though, we call
                // prevent default all the time (see above) and then trigger a "click" event here.
                //
                // Additionally, we are currently looking at the "touchend" event, mobile devices usually add a 300ms
                // delay before triggering click to check for double tap events (zooming action on most devices).
                // In certain situations the mobile device will still fire a "click" event even if preventDefault is
                // called on "touchend", so we wait the 300ms and look for a click, then only fire a click if none
                // was fired by the browser
                var clickTimer = setTimeout(function () {
                    if (_touching === lastTouchStarted) {
                        _touching = false; // release the "pointerdown" lock
                    }

                    // at this point, if no click event was triggered, and we don't want to to trigger a "click"
                    // event, we can simply not trigger one to begin with.
                    if (jEvent.isClickPrevented()) {
                        $(event.target).off("click", returnFalse);
                        return;
                    }

                    if (event.target.click) {
                        event.target.click();
                    } else {
                        // iOS 5 and older Android browsers do not define native .click events on all elements
                        $(event.target).click();
                    }
                }, 300);

                $(event.target).one("click", function () {
                    if (_touching === lastTouchStarted) {
                        _touching = false;
                    }

                    if (clickTimer) {
                        clearTimeout(clickTimer);
                    }
                });
            },
            mouse: function (event) {
                // if originally we had a "touchstart" or we ended with a "touchend" event, ignore this "mouseup"
                if (_touching !== null) {
                    return;
                }

                // on mouseup, the event.button will be the button that was just released
                _buttons ^= getStandardizedButtonsProperty(event);

                // we only trigger a "pointerup" event if no buttons are down, prevent chorded PointerDown events
                if (_buttons === 0) {
                    triggerCustomEvent(this, "pointerup", event);
                } else {
                    // per the Pointer Events spec, when the active buttons change it fires only a PointerMove event
                    triggerCustomEvent(this, "pointermove", event);
                }

                // Mouse Events spec shows that after a "mouseup" it fires a "mousemove", which will trigger
                // the "pointermove" needed to follow the Pointer Events spec which describes the same thing
            },
            add: $.event.delegateSpecial(function (handleObj) {
                // bind to touch events, some devices (chromebook) can send both touch and mouse events
                if (support.touch) {
                    addEvent(this, "touchend", handleObj.selector, $.event.special.pointerup.touch);
                }

                // bind mouse events
                addEvent(this, "mouseup", handleObj.selector, $.event.special.pointerup.mouse);
            }),
            remove: $.event.delegateSpecial.remove(function (handleObj) {
                // unbind touch events
                if (support.touch) {
                    removeEvent(this, "touchend", handleObj.selector, $.event.special.pointerup.touch);
                }

                // unbind mouse events
                removeEvent(this, "mouseup", handleObj.selector, $.event.special.pointerup.mouse);
            })
        };

        $.event.special.pointermove = {
            touch: function (event) {
                triggerCustomEvent(this, "pointermove", event);
            },
            mouse: function (event) {
                // _touching will be a number if they currently have their finger (touch only) down
                // because we cannot call preventDefault on the "touchmove" without preventing
                // scrolling on most things, we do this check to ensure we don't double fire
                // move events.
                if (typeof _touching === "number") {
                    return;
                }

                triggerCustomEvent(this, "pointermove", event);
            },
            add: $.event.delegateSpecial(function (handleObj) {
                // bind to touch events, some devices (chromebook) can send both touch and mouse events
                if (support.touch) {
                    addEvent(this, "touchmove", handleObj.selector, $.event.special.pointermove.touch);
                }

                // bind mouse events
                addEvent(this, "mousemove", handleObj.selector, $.event.special.pointermove.mouse);
            }),
            remove: $.event.delegateSpecial.remove(function (handleObj) {
                // unbind touch events
                if (support.touch) {
                    removeEvent(this, "touchmove", handleObj.selector, $.event.special.pointermove.touch);
                }

                // unbind mouse events
                removeEvent(this, "mousemove", handleObj.selector, $.event.special.pointermove.mouse);
            })
        };

        jQuery.each({
            pointerover: {
                mouse: "mouseover"
            },
            pointerout: {
                mouse: "mouseout"
            },
            pointercancel: {
                touch: "touchcancel"
            }
        }, function (pointerEventType, natives) {
            function onTouch(event) {
                // pointercancel, reset everything
                if (event.type === "touchcancel") {
                    _touching = null;
                    _buttons = 0;
                }

                triggerCustomEvent(this, pointerEventType, event);
            }

            function onMouse(event) {
                triggerCustomEvent(this, pointerEventType, event);
            }

            $.event.special[pointerEventType] = {
                setup: function () {
                    if (support.touch && natives.touch) {
                        addEvent(this, natives.touch, null, onTouch);
                    }
                    if (natives.mouse) {
                        addEvent(this, natives.mouse, null, onMouse);
                    }
                },
                teardown: function () {
                    if (support.touch && natives.touch) {
                        removeEvent(this, natives.touch, null, onTouch);
                    }
                    if (natives.mouse) {
                        removeEvent(this, natives.mouse, null, onMouse);
                    }
                }
            };
        });
    }

    // for IE10 specific, we proxy though events so we do not need to deal
    // with the various names or renaming of events.
    else if (navigator.msPointerEnabled && !navigator.pointerEnabled) {
        $.extend($.event.special, {
            pointerdown: {
                delegateType: "MSPointerDown",
                bindType: "MSPointerDown"
            },
            pointerup: {
                delegateType: "MSPointerUp",
                bindType: "MSPointerUp"
            },
            pointermove: {
                delegateType: "MSPointerMove",
                bindType: "MSPointerMove"
            },
            pointerover: {
                delegateType: "MSPointerOver",
                bindType: "MSPointerOver"
            },
            pointerout: {
                delegateType: "MSPointerOut",
                bindType: "MSPointerOut"
            },
            pointercancel: {
                delegateType: "MSPointerCancel",
                bindType: "MSPointerCancel"
            }
        });

        $.extend($.event.fixHooks, {
            MSPointerDown: $.event.pointerHooks,
            MSPointerUp: $.event.pointerHooks,
            MSPointerMove: $.event.pointerHooks,
            MSPointerOver: $.event.pointerHooks,
            MSPointerOut: $.event.pointerHooks,
            MSPointerCancel: $.event.pointerHooks
        });
    }

    // add support for pointerenter and pointerlave
    // pointerenter and pointerleave were added in IE11, they do not exist in IE10
    if (!support.pointer || (navigator.msPointerEnabled && !navigator.pointerEnabled)) {
        // Create a wrapper similar to jQuery's mouseenter/leave events
        // using pointer events (pointerover/out) and event-time checks
        jQuery.each({
            pointerenter: navigator.msPointerEnabled ? "MSPointerOver" : "mouseover",
            pointerleave: navigator.msPointerEnabled ? "MSPointerOut" : "mouseout"
        }, function (orig, fix) {
            jQuery.event.special[orig] = {
                delegateType: fix,
                bindType: fix,
                handle: function (event) {
                    var ret,
                        target = this,
                        related = event.relatedTarget,
                        handleObj = event.handleObj;

                    // For mousenter/leave call the handler if related is outside the target.
                    // NB: No relatedTarget if the mouse left/entered the browser window
                    if (!related || (related !== target && !jQuery.contains(target, related))) {
                        event.type = handleObj.origType;
                        ret = handleObj.handler.apply(this, arguments);
                        event.type = fix;
                    }
                    return ret;
                }
            };
        });
    }

})(jQuery, window, document);
