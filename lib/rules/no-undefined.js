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
         * Returns true if an Identifier with name of "undefined" is not allowed
         * in this location.
         * @param {ASTNode} node The Identifer node to check.
         * @returns {boolean} True if undefined is not allowed here, false otherwise.
         */
        function isInvalidUndefinedIdentifier(node) {
            switch (node.parent.type) {
                case "MemberExpression":

                    // foo.undefined is valid, foo[undefined] is not
                    return node !== node.parent.property ||
                        node.parent.computed;

                case "Property":
                    return false;   // Handled in Property visitor

                case "MethodDefinition":
                    return node.parent.computed;   // MethodDefinition keys are object keys

                default:
                    return true;
            }
        }

        /**
         * Report an invalid "undefined" identifier node.
         * @param {ASTNode} node The node to report.
         * @returns {void}
         */
        function report(node) {
            context.report({
                node,
                message: "Unexpected use of undefined."
            });
        }

        return {

            Identifier(node) {
                if (node.name === "undefined" && isInvalidUndefinedIdentifier(node)) {
                    report(node);
                }
            },

            Property(node) {
                if (node.value && node.value.type === "Identifier" && node.value.name === "undefined") {
                    report(node.value);
                }
            }
        };

    }
};
