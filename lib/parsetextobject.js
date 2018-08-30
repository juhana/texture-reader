"use strict";

// use define() with RequireJS, otherwise place the function to global scope
(function( factory ) {
    if( typeof define === 'function' ) {
        define( [ "lodash" ], factory );
    }
    else {
        window.parseTextObject = factory( window._ );
    }
})( function( _ ) {
    /**
     * @param text
     * @param replaceSpecial if set to to true, will replace _ with spaces
     */
    return function( text, replaceSpecial ) {
        /**
         * Replaces underscores with spaces if requested.
         * @param input
         */
        var stringfilter = function( input ) {
            if( !replaceSpecial ) {
                return input;
            }

            return input.split( '_' ).join( ' ' );
        };

        var htmlify = function( text ) {
            return _.reduce( text, function( html, content ) {
                var str = '', contents;

                if( typeof content.text === 'string' ) {
                    contents = content.text;
                }
                else {
                    contents = htmlify( content.text );
                }

                if( !content.elem ) {
                    return html + stringfilter( contents );
                }
                else {
                    str = '<' + content.elem;

                    if( content.id ) {
                        str += ' id="' + content.id + '" class="noun"';
                    }

                    str += '>';

                    if( content.text ) {
                        str += stringfilter( contents );
                        str += '</' + content.elem + '>';
                    }

                    return html + str;
                }
            }, '' );
        };

        return htmlify( text );
    };
} );