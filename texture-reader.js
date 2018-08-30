/* global jQuery, _, parseTextObject, interact */

(function( $ ) {
    "use strict";

    var $story,
        $verbs,
        book,
        page,
        actionCount,
        flags = [],
        debug,
        texture = window.texture || {},
        progressIndicatorStyle = false,
        showTitleWhenRestarting = true;

    // prevent overscroll on iOS
    document.ontouchmove = function( event ){
        event.preventDefault();
    };

    if( texture.console ) {
        debug = window.texture.console;
    }
    else {
        // if the debugging console isn't included, use a no-op object
        debug = {
            close: $.noop,
            divider: $.noop,
            lbr: $.noop,
            populateFlags: $.noop,
            print: $.noop,
            printFlagDifference: $.noop,
            toggle: $.noop,
            updateFlags: $.noop
        };
    }

    $.fn.appear = function( callback ) {
        var $self = this;
        this.fadeOut( 'fast', function () {
            if( _.isFunction( callback ) ) {
                callback.call( $self );
            }

            $self.fadeIn( 1000 );
        } );

        return this;
    };

    function addParagraph( paragraph, $noun ) {
        var $newParagraph = $( '<p>' ).text( _.trim( paragraph.text ) ),
            isEmpty = _.trim( paragraph.text ).length === 0;

        // convert newlines into paragraph breaks
        $newParagraph.html( $newParagraph.text().replace( /\s*\n\s*/g, '<p>' ) );

        // replace [] with a reference to the noun
        $newParagraph.html( reAddNoun( $newParagraph.html(), $noun ) );

        if( $newParagraph.find( '.noun' ).length > 0 ) {
            $noun.attr( 'id', '' ).removeClass( 'noun' );
        }

        switch( paragraph.placement ) {
            case 'after':
                if( !isEmpty ) {
                    $noun.closest( 'p' ).after( $newParagraph.appear() );
                }
                break;

            case 'end':
                if( !isEmpty ) {
                    $story.append( $newParagraph.appear() );
                }
                break;

            case 'replace':
                if( isEmpty ) {
                    $noun.closest( 'p' ).remove();
                }
                else {
                    $noun.closest( 'p' ).replaceWith( $newParagraph.appear() );
                }
                break;
        }

        resizeStory();
    }

    function buildPageLinkRow() {
        var thisPage,
            $pageList = $( '<div id="progress-indicator"></div>' ).appendTo( 'body' ),
            $pageLink;

        switch( progressIndicatorStyle ) {
            case 'full':
                for( var i = 0; i < book.pages.length; ++i ) {
                    thisPage = book.pages[ i ];
                    $pageLink = $( '<span id="page-link-' + thisPage.id + '" class="page-indicator unvisited"><span class="interaction-area"></span></span>' );
                    $pageLink.appendTo( $pageList );
                }
                break;

            case 'sequential':
                $( '<span class="page-indicator visited"><span class="interaction-area"></span></span>' ).appendTo( $pageList );
                break;
        }
    }

    /**
     * Put each verb in their individual rows. This can't be done in CSS
     * because the drag-and-drop thing changes the verb container's height
     * which makes lower rows "bounce".
     */
    function buildVerbRows() {
        var makeRow = function() {
                return $( '<div>' ).addClass( 'verb-row' ).appendTo( $verbs );
            },
            $verbContainers = $verbs.find( '.verb-container' ),
            verbCount = $verbContainers.length;

        $verbContainers.detach();
        $verbs.find( '.verb-row' ).remove();

        if( verbCount === 0 ) {
            return;
        }

        var $row = makeRow();

        $verbContainers.each( function() {
            var $verb = $( this );

            $verb.appendTo( $row );

            // Make a new row if
            // a) the verb's top coordinate is not 0 which means it didn't fit
            //    in the current row
            // b) there are 5 or 6 verbs and this row already had 3 verbs,
            //    which divides the verbs more evenly in two rows
            if( $verb.position().top !== 0 || ( ( verbCount === 5 || verbCount === 6 ) && $row.find( '.verb-container' ).length === 4 ) ) {
                $row = makeRow();
                $verb.appendTo( $row );
            }
        });
    }

    // center the current link in the page list
    function centerCurrentPageLink( $current ) {
        var $progressIndicator = $( '#progress-indicator' ),
            index = $current.index( '.page-indicator' );

        $progressIndicator.css({
            left: $( window ).width() / 2 - 50 * index - 25
        }, 500 );
    }

    function enableVerb( verb ) {
        var keyword = verb.name.replace( / /g, '-' );
        disableVerb( verb );

        var $verb = $( '<div></div>' )
            .attr( 'id', 'verb-' + verb.id )
            .addClass( 'draggable verb-container' )
            .appendTo( $verbs )
            .data( 'keyword', keyword )
            .data( 'cmd', verb.name )
            .append(
                $( '<div></div>' )
                    .addClass( 'verb' )
                    .text( verb.name )
            );

        var snapTargetFuncs = [],
            snappedElement;

        interact( '#verb-' + verb.id )
            .draggable({
                onmove: function( event ) {
                    var target = event.target,
                        // keep the dragged position in the data-x/data-y attributes
                        x = (parseFloat( target.getAttribute( 'data-x' ) ) || 0) + event.dx,
                        y = (parseFloat( target.getAttribute( 'data-y' ) ) || 0) + event.dy;

                    // translate the element
                    target.style.webkitTransform =
                        target.style.transform =
                            'translate(' + x + 'px, ' + y + 'px)';

                    // update the posiion attributes
                    target.setAttribute( 'data-x', x );
                    target.setAttribute( 'data-y', y );
                },
                onstart: function( e ) {
                    e.stopPropagation();

                    // put the verb under the cursor
                    e.target.setAttribute( 'data-x', e.x0 - $verb.offset().left - $verb.width() / 2 );
                    e.target.setAttribute( 'data-y', e.y0 - $verb.offset().top - $verb.find( '.verb' ).height() - 35 );
                    $verb.addClass( 'dragging' ).removeClass( 'inactive-draggable' );

                    $( '.active-droppable' ).removeClass( 'active-droppable' );

                    // hide intro hint when dragging starts
                    $( '#how-to-play' ).fadeOut( function() {
                        $( this ).remove();
                    });

                    if( !page.actions ) {
                        return;
                    }

                    snapTargetFuncs = [];

                    _.each( _.filter( page.actions, { verb: verb.id } ), function( action ) {
                        if( action.disabled ) {
                            return;
                        }

                        var $noun = $( '.noun#' + action.noun );

                        if( $noun.length === 0 ) {
                            return;
                        }

                        var nounX = $noun.offset().left,
                            nounY = $noun.offset().top,
                            width = $noun.width(),
                            height = $noun.height();

                        snapTargetFuncs.push( function( x, y ) {
                            if( x > nounX && x < nounX + width && y > nounY && y < nounY + height + 20 ) {
                                snappedElement = $noun.get(0);

                                return {
                                    x: nounX + width / 2,
                                    y: nounY + 15,
                                    range: Infinity
                                };
                            }
                        });

                        $noun.addClass( 'active-droppable accepts' );

                        interact( '.noun#' + action.noun )
                            .dropzone({
                                ondrop: function( e ) {
                                    var $this = $( e.target ),
                                        pageTurned = false,
                                        oldFlags = _.clone( flags );

                                    $( e.target ).removeClass( 'over' );

                                    debug.lbr();
                                    debug.print( 'Executing command "' + $( e.relatedTarget ).find( '.verb' ).text() + '"' );

                                    // choose the correct behavior
                                    _.each( action.behaviors, function( behavior, index ) {
                                        var setCond = _.uniq( behavior.condition.setFlags ),
                                            unsetCond = _.uniq( behavior.condition.unsetFlags ),
                                            debugText = "";

                                        if( index < action.behaviors.length - 1 ) {
                                            debug.print( 'Evaluating behavior "' + behavior.name + '"' );
                                        }
                                        else {
                                            debug.print( 'Following default behavior' );
                                        }

                                        if( setCond.length + unsetCond.length > 0 ) {
                                            if( behavior.condition.connective === 'and' ) {
                                                debugText += setCond.join( ' AND ' );

                                                if( unsetCond.length > 0 ) {
                                                    if( setCond.length > 0 ) {
                                                        debugText += ' AND ';
                                                    }

                                                    debugText += 'NOT ' + unsetCond.join( ' AND NOT ' );
                                                }

                                                debug.print( 'Testing condition (' + debugText + ') ...' );

                                                if( _.intersection( setCond, flags ).length !== setCond.length || _.intersection( unsetCond, flags ).length !== 0 ) {
                                                    debug.print( '... false.' );
                                                    return;
                                                }

                                                debug.print( '... true!' );
                                            }

                                            if( behavior.condition.connective === 'or' ) {
                                                debugText += setCond.join( ' OR ' );

                                                if( unsetCond.length > 0 ) {
                                                    if( setCond.length > 0 ) {
                                                        debugText += ' OR ';
                                                    }

                                                    debugText += 'NOT ' + unsetCond.join( ' OR NOT ' );
                                                }

                                                debug.print( 'Testing condition (' + debugText + ') ...' );

                                                if( _.intersection( setCond, flags ).length === 0 && _.intersection( unsetCond, flags ).length === unsetCond.length ) {
                                                    debug.print( '... false.' );
                                                    return;
                                                }

                                                debug.print( '... true!' );
                                            }
                                        }
                                        // don't match if there are no conditions set
                                        // except if it's the default behavior
                                        else if( index < action.behaviors.length - 1 ) {
                                            debug.text( 'Behavior has no conditions, skipping.' );
                                            return;
                                        }

                                        if( behavior.newParagraph ) {
                                            addParagraph( behavior.newParagraph, $this );
                                        }

                                        if( typeof behavior.changeNoun === 'string' ) {
                                            $this.replaceWith(
                                                $( '<span>' ).appear( function() {
                                                    this.html( reAddNoun(
                                                        $( '<div>' ).text( behavior.changeNoun ).html(),    // sanitize
                                                        $this
                                                    ) ).addClass( 'actionresult' );
                                                    resizeStory();
                                                })
                                            );
                                        }

                                        if( behavior.turnTo ) {
                                            var turnToPage;

                                            if( typeof behavior.turnTo === 'string' ) {
                                                turnToPage = behavior.turnTo;
                                            }
                                            else if( behavior.turnTo.page ) {
                                                turnToPage = behavior.turnTo.page;
                                            }

                                            if( turnToPage !== undefined ) {
                                                endPage( turnToPage, behavior.turnTo.immediately );
                                                pageTurned = true;
                                            }
                                        }

                                        if( behavior.setFlags ) {
                                            flags = _.union( flags, behavior.setFlags );
                                        }

                                        if( behavior.unsetFlags ) {
                                            flags = _.difference( flags, behavior.unsetFlags );
                                        }

                                        // print debug messages and update flag status
                                        debug.printFlagDifference( oldFlags, flags );
                                        debug.updateFlags( flags );

                                        if( behavior.callback ) {
                                            behavior.callback();
                                        }

                                        // stop iteration when the first good condition is found
                                        return false;
                                    });

                                    if( !pageTurned ) {
                                        incrementActionCount();
                                        action.disabled = true;
                                    }

                                    // hide the verb that's being dragged
                                    $( e.relatedTarget ).css( 'visibility', 'hidden' );
                                    resizeVerbs();
                                },

                                ondragleave: function( e ) {
                                    var $draggable = $( e.relatedTarget );
                                    $( e.target ).removeClass( 'over' );
                                    $draggable.find( '.verb' ).text( $draggable.data( 'cmd' ) );
                                    resizeVerbs();
                                },

                                ondragenter: function( e ) {
                                    var $target = $( e.target ),
                                        text = action.name,
                                        verb = $( e.relatedTarget ).data( 'cmd' ),
                                        noun = $target.text();

                                    if( !text ) {
                                        text = verb + ' ' + noun;
                                    }

                                    text = text.split( '%VERB%' ).join( verb ).split( '%NOUN%' ).join( noun );

                                    $target.addClass( 'over' );
                                    $( e.relatedTarget ).find( '.verb' ).text( text );
                                    resizeVerbs();
                                },

                                checker: function( dragEvent, event, dropped, dropzone, dropElement ) {
                                    // disable dropzones that aren't active
                                    if( !$( dropElement ).hasClass( 'accepts' ) ) {
                                        return false;
                                    }

                                    // enable dropzone only when the verb snaps to it
                                    return dragEvent.snap.locked && dropElement === snappedElement;
                                }
                            })
                            .dropzone({ enabled: true });
                    });
                },
                onend: function( event ) {
                    var target = event.target;

                    $verb.removeClass( 'dragging' ).addClass( 'inactive-draggable transitioning' );
                    $( '.accepts' ).removeClass( 'accepts' );

                    target.style.webkitTransform =
                        target.style.transform =
                            'translate(0px, 0px)';

                    // transitioning class makes sure the action icons don't show while animating
                    setTimeout( function() {
                        $verb
                            .removeClass( 'transitioning' )
                            .css( 'visibility', 'visible' )
                            .hide()
                            .fadeIn()
                            .find( '.verb' ).text( verb.name );

                        target.setAttribute( 'data-x', 0 );
                        target.setAttribute( 'data-y', 0 );

                        resizeVerbs();
                    }, 300 );
                },
                snap: {
                    targets: [
                        // give this function the x and y page coords
                        // and snap to the object returned
                        function( x, y ) {
                            var snap;

                            for( var i = 0; i < snapTargetFuncs.length; ++i ) {
                                snap = snapTargetFuncs[ i ]( x, y );

                                if( snap ) {
                                    return snap;
                                }
                            }
                        }
                    ]
                }
            })
            .on( 'tap', function( event ) {
                event.preventDefault();
                $( event.target ).click();
            });
    }

    function disableVerb( verb ) {
        $verbs.find( 'div' ).filter( function() {
            var $this = $( this );

            if( $this.data( 'keyword' ) === verb ) {
                $this.remove();
            }
        });
    }

    function disableAllVerbs() {
        $verbs.find( 'div' ).remove();
    }


    /**
     * Finish the current page and show a link to the next one.
     *
     * @param pageId {string|number} The id of the page to turn to
     * @param immediately {boolean=false} If true, don't show the turn page link
     */
    function endPage( pageId, immediately ) {
        var oldFlags = _.clone( flags );

        $verbs.find( 'div' ).fadeOut();

        disableAllVerbs();

        // set and unset flags
        flags = _.union( flags, page.events.exit.setFlags );
        flags = _.difference( flags, page.events.exit.unsetFlags );

        debug.printFlagDifference( oldFlags, flags );
        debug.updateFlags( flags );

        var resetActions = function() {
            // reset disabled links in case the player returns to the page
            _.each( page.actions, function ( action ) {
                action.disabled = false;
            } );
        };

        // remove current page class from page links
        $( '.page-indicator.current' ).removeClass( 'current' ).addClass( 'visited' );

        // update the progress indicator and show a link to the next page
        var $turnPage = $( '<a href="#" class="page-indicator"><span class="interaction-area"></span></a>' ),
            $progressIndicator = $( '#progress-indicator' );

        if( immediately ) {
            resetActions();
            $turnPage.addClass( 'current' );
            turnPage( pageId );
        }
        else {
            $turnPage
                .addClass( 'turn-page' )
                .append( '<span class="blip"></span>' )
                .one( 'click', function ( e ) {
                    resetActions();
                    turnPage( pageId );

                    if( progressIndicatorStyle === 'sequential' ) {
                        $turnPage.removeClass( 'turn-page' ).addClass( 'current' );
                    }
                    else {
                        $turnPage.fadeOut( 'fast', function () {
                            $turnPage.remove();
                        });
                    }

                    e.preventDefault();
                });

            // as a quick-and-dirty solution to not show the blip on image pages
            if( page.category === 'image' ) {
                $turnPage.css( 'visibility', 'hidden' );
            }
        }

        switch( progressIndicatorStyle ) {
            case 'full':
                var $oldLink;

                if( typeof pageId === 'number' ) {
                    $oldLink = $progressIndicator.eq( pageId );
                }
                else {
                    $oldLink = $( '#page-link-' + pageId );
                }

                if( !immediately ) {
                    centerCurrentPageLink( $oldLink );
                    $turnPage.insertAfter( $oldLink ).show();
                    $progressIndicator.addClass( 'active' );
                    $oldLink.hide();
                }
                break;

            case 'sequential':
                $turnPage.insertAfter( $progressIndicator.find( '.page-indicator:last' ) );
                centerCurrentPageLink( $turnPage );

                if( !immediately ) {
                    $progressIndicator.addClass( 'active' );
                }
                break;

            default:
                if( !immediately ) {
                    $turnPage.appendTo( '#action-container' )
                        .attr( 'id', 'next-page' )
                        .hide()
                        .fadeIn()
                        .append( '<span class="arrow">&#10143;</span>' )
                        .find( '.blip' ).remove();
                }
                break;
        }

        resizeStory();

        debug.lbr();
        debug.print( 'Closing page "' + page.name + '"' );
    }


    /**
     * End the story and show the restart link
     */
    function endStory() {
        var $turnPage = $( '<div id="restart-story"><a href=""><span class="icon">➥</span> Restart</a></div>' );

        $verbs.find( 'div' ).fadeOut();

        disableAllVerbs();

        $( '#progress-indicator' ).remove();

        // show the "turn page" link
        $turnPage
            .appendTo( '#action-container' )
            .fadeIn()
            .find( 'a' ).on( 'click', function(e) {
            e.preventDefault();
            restart( 0, showTitleWhenRestarting );
            $story.empty();
            $turnPage.remove();
        });

        resizeStory();
    }


    /**
     * Add one to the action count and check if the page turn timer is full.
     */
    function incrementActionCount() {
        actionCount++;

        if( page.events.exit.timer && actionCount === page.events.exit.timer.count ) {
            endPage( page.events.exit.timer.target );
        }
    }


    /**
     * Replaces text in brackets with a reference to the current noun.
     */
    function reAddNoun( text, $noun ) {
        var nounMatch = text.match( /\[(.+?)\]/ ),
            $html;

        if( nounMatch ) {
            $html = $( '<span>' ).html( text.replace( nounMatch[0], '<span id="' + $noun.attr( 'id' ) + '" class="noun">' + nounMatch[1] + '</span>' ) );

            return $html;
        }

        return text;
    }


    /**
     * Resize text in story and verbs so that they fit their containers.
     */
    function resizeStory() {
        // wrap it in a timeout to make sure DOM is up to date
        setTimeout( function() {
            var fontSize,
                verbsTop = $( '#action-container' ).offset().top;

            $story.css( 'font-size', '' );
            fontSize = parseInt( $story.css( 'font-size' ) );

            while( $story.offset().top + $story.outerHeight( true ) > verbsTop ) {
                $story.css( 'font-size', --fontSize );

                if( fontSize < 8 ) {
                    break;
                }
            }
        }, 0 );
    }

    function resizeVerbs() {
        setTimeout( function() {
            var fontSize,
                targetHeight;

            $( '.verb' ).each( function() {
                var $this = $( this );

                $this.css( 'font-size', '' );
                fontSize = parseInt( $this.css( 'font-size' ) );
                targetHeight = fontSize;

                while( $this.height() > targetHeight ) {
                    $this.css( 'font-size', --fontSize );

                    if( fontSize < 8 ) {
                        break;
                    }
                }
            } );
        }, 0 );
    }

    function resizePageImage() {
        var $img = $( '#illustration-image' ),
            $previousSibling,
            top = 30;

        if( $img.length === 0 ) {
            return;
        }

        $previousSibling = $img.prev();

        if( $previousSibling.length ) {
            top += $previousSibling.offset().top + $previousSibling.height();
        }

        $img.css( 'top', top );
    }


    /**
     * (Re)start the story.
     *
     * @param from Id or index of the start page
     * @param showTitle Show the title page, or start directly from the first page?
     */
    function restart( from, showTitle ) {
        flags = [];

        var turnToFirstPage = function() {
            setTimeout( function() {
                buildPageLinkRow();
                turnPage( from || book.startpage || 0 );
            }, 1 );
        };

        if( showTitle && book.cover && book.cover.enabled ) {
            showTitlePage( turnToFirstPage );
        }
        else {
            turnToFirstPage();
        }
    }


    /**
     * Sanitize input by encoding HTML tags.
     */
    function sanitizeHtml( input ) {
        return input.split( '<' ).join( '&lt;' ).split( '>' ).join( '&gt;' );
    }


    /**
     * Scan the story file for any possible flags that can be set during the story
     * and display them in the debugging console.
     */
    function scanFlags() {
        var allFlags = [],
            collect = function( newFlags ) {
                if( _.isArray( newFlags ) ) {
                    allFlags = _.union( allFlags, newFlags );
                }
            };

        _.each( book.pages, function( page ) {
            if( page.events.enter ) {
                collect( page.events.enter.setFlags );
                collect( page.events.enter.unsetFlags );
            }

            if( page.events.exit ) {
                collect( page.events.exit.setFlags );
                collect( page.events.exit.unsetFlags );
            }

            _.each( page.actions, function( action ) {
                _.each( action.behaviors, function( behavior ) {
                    collect( behavior.setFlags );
                    collect( behavior.unsetFlags );
                });
            });
        });

        debug.populateFlags( allFlags, function() {
            var $this = $( this );

            if( $this.is( ':checked' ) ) {
                flags.push( $this.data( 'name' ) );
                flags = _.uniq( flags );
            }
            else {
                _.pull( flags, $this.data( 'name' ) );
            }
        });
    }


    /**
     * Set classes for story theme.
     */
    function setTheme( theme ) {
        if( typeof theme !== 'object' ) {
            return;
        }

        if( theme.font ) {
            $( 'body' ).addClass( 'font-' + theme.font );
        }

        if( theme.textColor ) {
            $( 'body' ).addClass( 'text-color-' + theme.textColor );
        }

        if( theme.bgColor ) {
            $( 'body' ).addClass( 'background-color-' + theme.bgColor );
        }
    }


    /**
     * Show the cover image.
     *
     * @param imageSrc Image URL or data blorb
     * @param callback
     */
    function showCover( imageSrc, callback ) {
        var imgElem = new Image(),
            fadetimer,
            fadeout = function() {
                $covercontainer.fadeOut( 'slow', callback );

                clearTimeout( fadetimer );
            },
            $covercontainer = $( '<div id="coverimage"></div>' )
                .appendTo( 'body' )
                .on( 'click', fadeout ),
            $coverimg = $( '<div></div>' )
                .appendTo( $covercontainer )
                .css( 'background-image', 'url("' + imageSrc + '")' );

        imgElem.onload = function() {
            // set container max dimensions based on the image dimensions
            $coverimg.css({
                'max-width': imgElem.width,
                'max-height': imgElem.height
            });

            $covercontainer.fadeIn( 'slow' );

            fadetimer = setTimeout( fadeout, 10000 );
        };

        // if the image URL doesn't load, skip the cover image
        imgElem.onerror = callback;

        imgElem.src = imageSrc;
    }

    texture.showCover = showCover;


    /**
     * Shows the title page of the story.
     */
    function showTitlePage( callback ) {
        // icon based on https://thenounproject.com/icon54app/ (CC-BY icon 54)
        var dragiconSvg = '<path d="M16.5,23.5h-2.343c-1.202,0-2.333-0.468-3.183-1.318l-7.121-7.122c-0.585-0.585-0.585-1.536,0-2.121    c0.912-0.911,2.379-1.015,3.409-0.242L9,14V5.5c0-1.103,0.897-2,2-2s2,0.897,2,2v3.269C13.294,8.598,13.636,8.5,14,8.5    c0.871,0,1.614,0.56,1.888,1.338C16.206,9.625,16.589,9.5,17,9.5c0.871,0,1.614,0.56,1.888,1.338    C19.206,10.625,19.589,10.5,20,10.5c1.103,0,2,0.897,2,2V18C22,21.033,19.532,23.5,16.5,23.5z M5.7,13.178    c-0.416,0-0.83,0.159-1.14,0.468c-0.195,0.195-0.195,0.512,0,0.707l7.121,7.122c0.661,0.661,1.54,1.025,2.476,1.025H16.5    c2.481,0,4.5-2.019,4.5-4.5v-5.5c0-0.551-0.448-1-1-1s-1,0.449-1,1V13c0,0.276-0.224,0.5-0.5,0.5S18,13.276,18,13v-1.5    c0-0.551-0.448-1-1-1s-1,0.449-1,1V13c0,0.276-0.224,0.5-0.5,0.5S15,13.276,15,13v-2.5c0-0.551-0.448-1-1-1s-1,0.449-1,1V13    c0,0.276-0.224,0.5-0.5,0.5S12,13.276,12,13V5.5c0-0.551-0.448-1-1-1s-1,0.449-1,1V15c0,0.189-0.107,0.362-0.276,0.447    S9.351,15.514,9.2,15.4l-2.537-1.903C6.378,13.283,6.038,13.178,5.7,13.178z"></path><path style="opacity:1;fill:#ffffff" d="m 26.42723,22.406488 c -0.500485,-0.109484 -1.028483,-0.363097 -1.431357,-0.68752 -0.152659,-0.122934 -1.912774,-1.860932 -3.911366,-3.862219 l -3.633803,-3.638704 2.48e-4,-0.186957 c 3.82e-4,-0.288896 0.175029,-0.493773 0.578296,-0.678395 0.423264,-0.193777 0.904518,-0.202451 1.308861,-0.02359 0.08833,0.03907 0.774285,0.530986 1.524342,1.093139 0.750056,0.562154 1.405848,1.038107 1.457315,1.057675 0.210399,0.07999 0.479606,-0.002 0.602917,-0.183621 0.06445,-0.09492 0.06889,-0.355122 0.08671,-5.076577 l 0.01878,-4.9765255 0.115836,-0.2065728 c 0.336841,-0.600695 1.113567,-0.6928294 1.571127,-0.1863654 0.28591,0.3164684 0.263943,-0.022288 0.284868,4.3929382 0.01422,3.0010975 0.0298,3.9816535 0.0642,4.0416295 0.06444,0.112342 0.207619,0.197286 0.374468,0.222162 0.182464,0.02721 0.373742,-0.06691 0.490159,-0.241177 0.08475,-0.126859 0.08526,-0.135815 0.08546,-1.502347 1.13e-4,-0.819765 0.0157,-1.430483 0.03857,-1.512843 0.06595,-0.237435 0.262577,-0.4840698 0.484923,-0.608241 0.171152,-0.095582 0.244563,-0.1139317 0.450704,-0.1126592 0.135438,8.338e-4 0.306635,0.027553 0.380438,0.059372 0.187705,0.080926 0.399997,0.2765315 0.497133,0.4580592 0.07961,0.148772 0.08291,0.201599 0.101074,1.61858 0.01768,1.378615 0.0232,1.472272 0.0939,1.591996 0.197028,0.333658 0.658383,0.341543 0.872716,0.01492 0.05764,-0.08783 0.0687,-0.228181 0.08505,-1.079289 0.01752,-0.911609 0.02434,-0.988574 0.09999,-1.128563 0.24775,-0.458406 0.791739,-0.663944 1.243208,-0.469727 0.20312,0.08738 0.465829,0.33705 0.543961,0.516963 0.02889,0.06653 0.0518,0.451125 0.06469,1.086261 0.01864,0.918084 0.02512,0.990285 0.09775,1.089202 0.240488,0.327522 0.70632,0.293084 0.889291,-0.06574 0.04944,-0.09695 0.06639,-0.226273 0.06859,-0.523151 0.0016,-0.216902 0.02276,-0.448182 0.04701,-0.513956 0.319382,-0.866266 1.542995,-0.873246 1.847377,-0.01054 0.08335,0.236233 0.08322,6.066729 -1.5e-4,6.544771 -0.308164,1.767141 -1.571591,3.148821 -3.313229,3.623337 l -0.367841,0.100222 -1.784038,0.0087 c -1.428136,0.007 -1.83274,-0.0019 -2.028169,-0.04467 z" transform="translate(-13,0)"></path>',
            dragiconHoldArch = '<path d="M7.954,7.692c-0.175,0-0.346-0.093-0.437-0.257C7.174,6.818,7,6.167,7,5.5c0-2.206,1.794-4,4-4s4,1.794,4,4    c0,0.329-0.049,0.662-0.154,1.048c-0.071,0.266-0.343,0.429-0.614,0.351c-0.266-0.073-0.423-0.348-0.351-0.614    C13.962,5.987,14,5.738,14,5.5c0-1.654-1.346-3-3-3s-3,1.346-3,3c0,0.495,0.132,0.983,0.391,1.449    c0.135,0.241,0.048,0.546-0.193,0.68C8.12,7.672,8.037,7.692,7.954,7.692z"></path>',
            $dragicon = $( '<svg class="drag-icon finger-up" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="50px" x="0px" y="0px" viewBox="0 0 24 24" xml:space="preserve">' +
                dragiconSvg +
                '</svg>' ),
            $dragiconHold = $( '<svg class="drag-icon finger-down" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="50px" x="0px" y="0px" viewBox="0 0 24 24" xml:space="preserve">' +
                dragiconSvg +
                dragiconHoldArch +
                '</svg>' );

        page = {
            id: 'titlepage',
            actions: [{
                id: 'start-story',
                verb: 'play-verb',
                noun: 'story-type',
                behaviors: [{
                    condition: {
                        setFlags: [],
                        unsetFlags: []
                    },
                    callback: function() {
                        $( '#titlepage' ).fadeOut();
                        callback();
                    }
                }]
            }],
            events: {
                enter: {},
                exit: {}
            }
        };

        var subtitle = ( book.cover && book.cover.subtitle ) ? book.cover.subtitle : ( 'A [story] by ' + ( book.author || 'Anonymous' ) ),
            verbName = ( book.cover && book.cover.verb ) ? book.cover.verb : 'play';

        enableVerb({
            id: 'play-verb',
            name: verbName
        });

        var hintShowing = false,
            clicks = 0,
            textualHint = function() {
                if( $( '#how-to-play' ).length > 0 ) {
                    return;
                }

                var $verb = $( '.verb-container' ).not( '.verb-clone' ),
                    $howToPlay = $( '<div id="how-to-play">' +
                        'Drag <span id="hint-verb-name"></span> ' +
                        'and drop it on top of ' +
                        '<span id="hint-noun-name" class="accepts"></span> ' +
                        'to start</div>'
                    )
                        .appendTo( 'body' ).hide();

                $( '#hint-verb-name' ).text( verbName );
                $( '#hint-noun-name' ).text( $( '#story-type' ).text() );

                $howToPlay
                    .offset({
                        top: $verb.offset().top - $howToPlay.height() + 15,
                        left: $verb.offset().left + $verb.width() + 20
                    })
                    .fadeIn( 'slow' );
            };

        /*
         * Drag hint: teach the player how to interact with the story
         */
        $( '.verb-container' ).on( 'click', function() {
            var $verb = $( this ),
                $noun = $( '#story-type' );

            clicks++;

            // don't show the drag hint when already dragging
            if( $verb.hasClass( 'dragging') || $verb.hasClass( 'transitioning' ) ) {
                return;
            }

            // don't show when still animating the previous one
            if( hintShowing ) {
                return;
            }

            hintShowing = true;

            // create a "ghost" of the verb
            $verb.clone()
                .css({
                    opacity: 0,
                    position: 'fixed',
                    'font-size': $verb.css( 'font-size' )
                })
                .addClass( 'verb-clone dragging' )
                .appendTo( 'body' )
                .offset({
                    top: $verb.offset().top - $verb.height(),
                    left: $verb.offset().left - 65
                })
                .delay( 750 )
                .animate({
                    top: $noun.offset().top - $verb.height() - 10,
                    left: $noun.offset().left + 25 - ( $verb.width() / 2 ),
                    opacity: 0.5
                }, 1000 )
                .delay( 500 )
                .fadeOut( function() {
                    $( this ).remove();
                });

            // show a finger icon dragging the verb
            $dragicon
                .hide()
                .appendTo( 'body' )
                .css({
                    top: $verb.offset().top + 5,
                    left: $verb.offset().left + 20,
                    opacity: 0.8
                })
                .fadeIn()
                .delay( 200 )
                .animate(
                    {
                        top: $verb.offset().top + 10,
                        opacity: 0.3
                    },
                    50,
                    function() {
                        $dragiconHold
                            .appendTo( 'body' )
                            .css({
                                top: $dragicon.offset().top,
                                left: $dragicon.offset().left
                            })
                            .delay( 100 )
                            .animate({
                                top: $noun.offset().top + $noun.height() - 20,
                                left: $noun.offset().left + 10
                            }, 1000 )
                            .delay( 500 )
                            .animate({
                                top: $noun.offset().top + $noun.height() - 25
                            }, 50, function() {
                                $dragicon
                                    .appendTo( 'body' )
                                    .css({
                                        top: $dragiconHold.offset().top,
                                        left: $dragiconHold.offset().left,
                                    }).fadeOut( function() {
                                        $noun.removeClass( 'accepts' );
                                        $dragicon.remove();
                                    }
                                );

                                hintShowing = false;
                                $dragiconHold.remove();
                            } );

                        $dragicon.remove();
                    }
                );

            // textual hint on second click
            if( clicks > 1 ) {
                textualHint();
            }

            $noun.addClass( 'accepts' );
        });

        // Insert data and show cover
        $( '#titlepage-title' ).text( sanitizeHtml( book.name ) );
        $( '#titlepage-subtitle' )
            .html(
                sanitizeHtml( subtitle ).replace( /\[(.*?)\]/, '<span id="story-type" class="noun">$1</span>' )
            );

        buildVerbRows();
        resizeVerbs();

        $( '#titlepage' ).fadeIn();
    }


    /**
     * Show an error message and throw a JS error.
     *
     * @param msg {string}
     */
    function showError( msg ) {
        $( '<div></div>', {
            class: 'error-message',
            text: 'Error: ' + msg
        }).appendTo( 'body' );

        throw new Error( msg );
    }


    /**
     * Create an illustration image container.
     */
    function pageImage() {
        var $container = $( '<div id="image-page">' ),
            $titles = $( '<div id="titles">' );

        if( page.title || page.subtitle ) {
            $container.append( $titles );
        }

        if( page.title ) {
            $titles.append(
                $( '<h2 id="title-text">' ).text( page.title )
            );
        }

        if( page.subtitle ) {
            $titles.append(
                $( '<h3 id="subtitle-text">' ).text( page.subtitle )
            );
        }

        if( page.nextPage ) {
            $container.on( 'click', function() {
                $( '#next-page' ).click();
            }).addClass( 'link-style' );
        }

        if( page.imageUrl ) {
            $container.append(
                $( '<div id="illustration-image">' )
                    .css( {
                        'background-image': 'url("' + page.imageUrl + '")',
                    } )
            );
        }

        if( page.imageCaption ) {
            $container.append(
                $( '<p id="illustration-caption">' ).text( page.imageCaption )
            );
        }

        return $container;
    }


    /**
     * Opens a page of the book.
     *
     * @param pageId {string|number} Either the index of a page or its UUID
     */
    function turnPage( pageId ) {
        var oldFlags = _.clone( flags );

        if( typeof pageId === 'number' ) {
            page = book.pages[ pageId ];
        }
        else {
            page = _.find( book.pages, { id: pageId } );
        }

        if( page === undefined ) {
            showError( "Can't open non-existing page " + pageId );
            return;
        }

        debug.divider();
        debug.print( 'Opening page "' + page.name + '"' );

        // reset page turn timer
        actionCount = 0;

        // fade out the current text and fade in the new one
        $story.fadeOut( function() {
            resizeStory();

            if( page.category === 'image' ) {
                $story.empty().append( pageImage( page ) );
                setTimeout( resizePageImage, 1 );
            }
            else {
                $story.html( '<p>' + parseTextObject( page.text, true ) );
            }

            $story.fadeIn();
        });

        // remove previous verbs and add new ones
        disableAllVerbs();

        // set the current page indicator
        $( '.page-indicator#page-link-' + page.id ).addClass( 'current' ).removeClass( 'unvisited' ).show();
        $( '#progress-indicator' ).removeClass( 'active' ).css({ left: 0 });

        if( page.category === 'image' && page.nextPage ) {
            endPage( page.nextPage );
        }
        // if there are no verbs and there's no exit timer, end the story now
        else if( page.verbs.length === 0 && page.events.exit.timer.count !== 0 ) {
            endStory();
        }
        else {
            _.each( page.verbs, function( verb ) {
                enableVerb( verb );
            } );

            resizeVerbs();
            buildVerbRows();

            // set and unset flags
            flags = _.union( flags, page.events.enter.setFlags );
            flags = _.difference( flags, page.events.enter.unsetFlags );

            debug.printFlagDifference( oldFlags, flags );
            debug.updateFlags( flags );
        }

        // check if the turn timer is 0, in which case end the page immediately
        if( page.events.exit.timer.count === 0 ) {
            endPage( page.events.exit.timer.target );
        }
    }

    // load story data from a remote url
    texture.load = function( url, options ) {
        $.getJSON( url, function( data ) {
            texture.start( data, options );
        });
    };

    // start the story
    texture.start = function( data, options ) {
        var opt = _.extend(
            {
                from: 0,
                showTitlePage: true
            },
            options
        );

        console.log(opt);

        $story = $( '#story' );
        $verbs = $( '#verbs' );
        book = data;
        flags = [];
        showTitleWhenRestarting = !!opt.showTitlePage;

        // experimental feature, disabled by default
        progressIndicatorStyle = false;

        // Populate the flag array. This is only needed for the debugging console
        // so that we can show all possible flags there.
        scanFlags();

        $( window ).on( 'resize', function() {
            buildVerbRows();
            resizeStory();
            resizePageImage();
        } );

        setTheme( book.theme );

        var startGame = function() {
            restart( opt.from, opt.showTitlePage );
        };

        if( opt.coverUrl ) {
            showCover( opt.coverUrl, startGame );
        }
        else {
            startGame();
        }
    };


    // turn the console on and off
    texture.toggleConsole = function() {
        debug.toggle();
        resizeStory();
    };

    texture.setTheme = setTheme;

    window.texture = texture;
})( jQuery );