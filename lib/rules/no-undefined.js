/**
 * @fileoverview Rule to flag references to the undefined variable.
 * @author Michael Ficarra
 */
"use strict";

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

module.exports = {
    meta: {
        docs: {
            description: "disallow the use of `undefined` as an identifier",
            category: "Variables",
            recommended: false
        },

        schema: []
    },

    create(context) {

        /**
         * Returns true if an Identifier with name of "undefined" is in an
         * acceptable location.
         * @param {ASTNode} node The Identifer node to check.
         * @returns {boolean} True if undefined is allowed here, false otherwise.
         */
        function isValidUndefinedIdentifier(node) {
            switch (node.parent.type) {
                case "MemberExpression":

                    // foo.undefined is valid, foo[undefined] is not
                    return node === node.parent.property && !node.parent.computed;

                case "Property":

                    // Only non-computed keys are valid here
                    return node === node.parent.key &&
                        !node.parent.computed;

                default:
                    return false;
            }
        }

        return {

            Identifier(node) {
                if (node.name === "undefined" && !isValidUndefinedIdentifier(node)) {
                    context.report({
                        node,
                        message: "Unexpected use of undefined."
                    });
                }
            }
        };

    }
};
