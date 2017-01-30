/**
 * @fileoverview Tests for no-undefined rule.
 * @author Michael Ficarra
 */

"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const rule = require("../../../lib/rules/no-undefined"),
    RuleTester = require("../../../lib/testers/rule-tester");

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

const errors = [{ message: "Unexpected use of undefined.", type: "Identifier" }];

const ruleTester = new RuleTester({ parserOptions: { ecmaVersion: 6 } });

ruleTester.run("no-undefined", rule, {
    valid: [
        "void 0",
        "void!0",
        "void-0",
        "void+0",
        "null",
        "undefine",
        "ndefined",
        "a.undefined",
        "this.undefined",
        "global['undefined']",

        // https://github.com/eslint/eslint/issues/7964
        "({ undefined: bar })",
        "({ undefined: bar } = foo)",
        "({ undefined() {} })",
        "class Foo { undefined() {} }",
        "(class { undefined() {} })"
    ],
    invalid: [
        { code: "undefined", errors },
        { code: "undefined.a", errors },
        { code: "a[undefined]", errors },
        { code: "undefined[0]", errors },
        { code: "f(undefined)", errors },
        { code: "function f(undefined) {}", errors },
        { code: "function f() { var undefined; }", errors },
        { code: "var undefined;", errors },
        { code: "try {} catch(undefined) {}", errors },
        { code: "function undefined() {}", errors },
        { code: "(function undefined(){}())", errors },
        { code: "var foo = function undefined() {}", errors },
        { code: "foo = function undefined() {}", errors },
        { code: "undefined = true", errors },
        { code: "var undefined = true", errors },
        { code: "({ undefined })", errors },
        { code: "({ [undefined]: foo })", errors },
        { code: "({ bar: undefined })", errors },
        { code: "({ bar: undefined } = foo)", errors },
        { code: "var { undefined } = foo", errors },
        { code: "var { bar: undefined } = foo", errors },
        {
            code: "({ undefined: function undefined() {} })",
            errors: [Object.assign({}, errors[0], { column: 24 })]
        },
        { code: "({ foo: function undefined() {} })", errors },
        { code: "class Foo { [undefined]() {} }", errors },
        { code: "(class { [undefined]() {} })", errors }
    ]
});
