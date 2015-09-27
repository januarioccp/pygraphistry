'use strict';

var _ = require('underscore');



function ExpressionCodeGenerator(language, context) {
    if (language === undefined) {
        language = 'JavaScript';
    }
    this.language = language;
    if (context === undefined) {
        context = 'SingleValue';
    }
    // This enables identifier-parsing.
    this.handleMultipleColumns = context !== 'SingleValue';
}

/**
 * Ref. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Operator_Precedence
 * @param {String} operatorName
 * @param {String} [fixity] - prefix, suffix, infix
 * @returns {Number}
 */
ExpressionCodeGenerator.prototype.precedenceOf = function (operatorName, fixity) {
    switch (operatorName) {
        case '(':
        case ')':
            return 19;
        case '[':
        case ']':
        case '.':
            return 18;
        case '+':
        case '-':
            if (fixity === 'prefix') {
                return 15;
            }
            return 13;
        case '++':
        case '--':
            if (fixity === 'prefix') {
                return 15;
            }
            return 16;
        case '!':
        case '~':
            return 15;
        case '*':
        case '/':
        case '%':
        case '**':
            return 14;
        case '<<':
        case '>>':
        case '>>>':
            return 12;
        case '<':
        case '<=':
        case '>':
        case '>=':
        case 'in':
        case 'instanceof':
            return 11;
        case '==':
        case '!=':
        case '===':
        case '!==':
            return 10;
        case '&':
            return 9;
        case '^':
            return 8;
        case '|':
            return 7;
        case '&&':
            return 6;
        case '||':
            return 5;
        case '?:':
            return 4;
        case 'yield':
            return 2;
        case '...':
            return 1;
        case ',':
            return 0;
        default:
            // Any assignment:
            if (operatorName.endsWith('=')) {
                return 3;
            }
            return Infinity;
    }
};

/**
 * Insert parentheses to disambiguate expression composition in the text.
 */
ExpressionCodeGenerator.prototype.wrapSubExpressionPerPrecedences = function (subExprString, precedence, outerPrecedence) {
    if (subExprString === undefined || subExprString.length === 0) {
        return subExprString;
    }
    // Could be < but we're conservative about associativity for now.
    if (precedence <= outerPrecedence) {
        return '(' + subExprString + ')';
    }
    return subExprString;
};

/**
 * @param {String} operatorString
 * @returns {String}
 */
ExpressionCodeGenerator.prototype.translateOperator = function (operatorString) {
    switch (operatorString.toLowerCase()) {
        case 'and':
            return '&&';
        case 'or':
            return '||';
        case 'not':
            return '!';
        case 'is':
            return '===';
        default:
            return operatorString;
    }
};


ExpressionCodeGenerator.prototype.expressionForFunctionCall = function (inputFunctionName, args, outerPrecedence) {
    var safeFunctionName;
    var precedence = this.precedenceOf('.');
    var methodCall = function (firstArg, outputFunctionName, restArgs) {
        return this.wrapSubExpressionPerPrecedences(
            firstArg + '.' + outputFunctionName + '(' + restArgs ? restArgs.join(', ') : '' + ')',
            precedence, outerPrecedence);
    }.bind(this);
    switch (inputFunctionName.toUpperCase()) {
        case 'DATE':
            safeFunctionName = 'new Date';
            break;
        case 'CONCATENATE':
        case 'CONCAT':
            return this.wrapSubExpressionPerPrecedences(
                args.join(' + '), this.precedenceOf('+'), outerPrecedence);
        case 'LOWER':
            return methodCall(args[0], 'toLowerCase');
        case 'UPPER':
            return methodCall(args[0], 'toUpperCase');
        case 'LEN':
        case 'LENGTH':
            return this.wrapSubExpressionPerPrecedences(
                args[0] + '.length', precedence, outerPrecedence);
        case 'INT':
            return methodCall('Number', 'parseInt', args);
        case 'NUMBER':
            return 'Number(' + args[0] + ')';
        case 'STRING':
            return methodCall(args[0], 'toString', [10]);
        case 'FIRST':
        case 'LEFT':
            return methodCall(args[0], 'slice', [0, args[1]]);
        case 'LAST':
        case 'RIGHT':
            return methodCall(args[0], 'slice', ['-' + args[1]]);
        case 'MID':
            return methodCall(args[0], 'slice', [args[1], args[1] + args[2]]);
        case 'ISBLANK':
        case 'ISEMPTY':
            return this.wrapSubExpressionPerPrecedences(
                args[0] + ' === undefined || ' + args[0] + '.length === 0',
                this.precedenceOf('||'), outerPrecedence);
        case 'STARTSWITH':
            return methodCall(args[0], 'startsWith', [args[1]]);
        case 'ENDSWITH':
            return methodCall(args[0], 'endsWith', [args[1]]);
        case 'FIND':
            return methodCall(args[0], 'indexOf', [args[1]]);
        case 'CONTAINS':
            return this.wrapSubExpressionPerPrecedences(
                args[0] + '.indexOf(' + args[1] + ') !== -1',
                this.precedenceOf('!=='), outerPrecedence);
        case 'REPLACE':
            return methodCall(args[0], 'replace', args.slice(-(args.length - 1)));
        case 'SPLIT':
            return methodCall(args[0], 'split', args.slice(-(args.length - 1)));
        case 'SUBSTR':
        case 'SUBSTRING':
            return methodCall(args[0], 'substring', args.slice(-(args.length - 1)));
        case 'TRIM':
            return methodCall(args[0], 'trim');
        case 'LTRIM':
            return methodCall(args[0], 'trimLeft');
        case 'RTRIM':
            return methodCall(args[0], 'trimRight');
        case 'MAX':
            return methodCall('Math', 'max', args);
        case 'MIN':
            return methodCall('Math', 'min', args);
        case 'COALESCE':
            return this.wrapSubExpressionPerPrecedences(args.join(' || '), this.precedenceOf('||'), outerPrecedence);
        default:
            throw Error('Unrecognized function', inputFunctionName);
    }
    return safeFunctionName + '(' + args.join(', ') + ')';
};

ExpressionCodeGenerator.prototype.functionForAST = function (ast) {
    var source;
    var body = this.expressionStringForAST(ast);
    if (this.handleMultipleColumns) {
        source = '(function (context) { return ' + body + '; })';
    } else {
        source = '(function (value) { return ' + body + '; })';
    }
    return eval(source); // jshint ignore:line
};


ExpressionCodeGenerator.prototype.regexExpressionForLikeOperator = function (ast, depth, outerPrecedence) {
    var caseInsensitive = ast.operator === 'ILIKE';
    if (ast.right.type !== 'Literal') {
        throw Error('Computed text comparison patterns not yet implemented.');
    }
    /** @type {String} */
    var pattern = ast.right.value;
    var placeholderIndexes = [];
    var idx = 0;
    while ((idx = pattern.indexOf('%', idx)) !== -1) {
        placeholderIndexes.push(idx);
    }
    var regularExpression = '/';
    var lastPlaceholderIndex = -1;
    for (var i = 0; i < placeholderIndexes.length - 1; i++) {
        var placeholderIndex = placeholderIndexes[i];
        var patternSegment = pattern.substring(lastPlaceholderIndex + 1, placeholderIndex);
        patternSegment = patternSegment.replace('.', '[.]');
        regularExpression = regularExpression.concat(patternSegment);
        // %% quotes %, does not represent a placeholder.
        if (placeholderIndexes[i + 1] === placeholderIndex + 1) {
            // Replace quoted % with one:
            regularExpression += '%';
        } else {
            // Equivalent of % is .*:
            regularExpression += '.*';
        }
    }
    regularExpression += '/';
    if (caseInsensitive) {
        regularExpression += 'i';
    }
    var precedence = this.precedenceOf('.');
    var arg = this.expressionStringForAST(ast.left, depth + 1, precedence);
    var subExprString = arg + '.match(' + regularExpression + ')';
    return this.wrapSubExpressionPerPrecedences(subExprString, precedence, outerPrecedence);
};

if (!String.prototype.startsWith) {
    String.prototype.startsWith = function(searchString, position) {
        position = position || 0;
        return this.indexOf(searchString, position) === position;
    };
}

if (!String.prototype.endsWith) {
    String.prototype.endsWith = function(searchString, position) {
        var subjectString = this.toString();
        if (position === undefined || position > subjectString.length) {
            position = subjectString.length;
        }
        position -= searchString.length;
        var lastIndex = subjectString.lastIndexOf(searchString, position);
        return lastIndex !== -1 && lastIndex === position;
    };
}

function literalExpressionFor(value) {
    return JSON.stringify(value);
}

/**
 * Printed source form of the expression in JavaScript that executes the AST.
 * @param {Object} ast - From expression parser.
 * @param {Number} [depth] - Specifies depth, to use for pretty-printing/indents.
 * @param {Number} [outerPrecedence] - Surrounding expression precedence, determines whether result needs ().
 * @returns {String}
 */
ExpressionCodeGenerator.prototype.expressionStringForAST = function (ast, depth, outerPrecedence) {
    if (typeof ast === 'string') {
        return ast;
    }
    if (depth === undefined) {
        depth = 0;
    }
    var subExprString, operator, precedence, args;
    switch (ast.type) {
        case 'NotExpression':
            precedence = this.precedenceOf('!');
            arg = this.expressionStringForAST(ast.value, depth + 1, precedence);
            return this.wrapSubExpressionPerPrecedences('!' + arg, precedence, outerPrecedence);
        case 'BetweenPredicate':
            precedence = this.precedenceOf('&&');
            args = _.map([ast.value, ast.start, ast.stop], function (arg) {
                return this.expressionStringForAST(arg, depth + 1, this.precedenceOf('<='));
            }, this);
            subExprString = args[0] + ' >= ' + args[1] +
                ' && ' + args[0] + ' <= ' + args[2];
            return this.wrapSubExpressionPerPrecedences(subExprString, precedence, outerPrecedence);
        case 'RegexPredicate':
            precedence = this.precedenceOf('.');
            args = _.map([ast.left, ast.right], function (arg) {
                return this.expressionStringForAST(arg, depth + 1, this.precedenceOf('<='));
            }, this);
            subExprString = '(new RegExp(' + args[1] + ')).test(' + args[0] + ')';
            return this.wrapSubExpressionPerPrecedences(subExprString, precedence, outerPrecedence);
        case 'LikePredicate':
            if (ast.right.type !== 'Literal') {
                throw Error('Computed text comparison patterns not yet implemented.');
            }
            var pattern = ast.right.value;
            switch (ast.operator.toUpperCase()) {
                case 'LIKE':
                    precedence = this.precedenceOf('.');
                    arg = this.expressionStringForAST(ast.left, depth + 1, precedence);
                    var prefix, suffix;
                    var lastPatternIndex = pattern.length - 1;
                    if (pattern.startsWith('%') && pattern.endsWith('%')) {
                        var substring = pattern.slice(0, lastPatternIndex);
                        // ES6 could replace with String.includes():
                        precedence = this.precedenceOf('!==');
                        subExprString = arg + '.indexOf(' + literalExpressionFor(substring) + ') !== -1';
                    } else if (pattern.indexOf('%') !== pattern.lastIndexOf('%')) {
                        return this.regexExpressionForLikeOperator(args, depth, outerPrecedence);
                    } else if (pattern.startsWith('%')) {
                        suffix = pattern.slice(-lastPatternIndex);
                        subExprString = arg + '.endsWith(' + literalExpressionFor(suffix) + ')';
                    } else if (pattern.endsWith('%')) {
                        prefix = pattern.slice(0, lastPatternIndex);
                        subExprString = arg + '.startsWith(' + literalExpressionFor(prefix) + ')';
                    } else {
                        var index = pattern.indexOf('%');
                        if (index === -1) {
                            precedence = this.precedenceOf('===');
                            subExprString = arg + ' === ' + literalExpressionFor(pattern);
                        } else {
                            prefix = pattern.slice(0, index);
                            suffix = pattern.slice(-(lastPatternIndex - index));
                            precedence = this.precedenceOf('&&');
                            subExprString = arg + '.endsWith(' + literalExpressionFor(suffix) + ') && ' +
                                arg + '.startsWith(' + literalExpressionFor(prefix) + ')';
                        }
                    }
                    return this.wrapSubExpressionPerPrecedences(subExprString, precedence, outerPrecedence);
                case 'ILIKE':
                    return this.regexExpressionForLikeOperator(ast, depth, outerPrecedence);
                default:
                    throw Error('Operator not yet implemented: ' + ast.operator);
            }
            break;
        case 'LogicalExpression':
        case 'BinaryExpression':
            // Maybe InExpression would be a better logic branch:
            if (ast.operator.toLowerCase() === 'in') {
                args = _.map([ast.left, ast.right], function (arg) {
                    return this.expressionStringForAST(arg, depth + 1, precedence);
                }, this);
                subExprString = args[1] + '.indexOf(' + args[0] + ') !== -1';
                return this.wrapSubExpressionPerPrecedences(subExprString, this.precedenceOf('!=='), outerPrecedence);
            }
            operator = this.translateOperator(ast.operator);
            precedence = this.precedenceOf(operator);
            args = _.map([ast.left, ast.right], function (arg) {
                return this.expressionStringForAST(arg, depth + 1, precedence);
            }, this);
            subExprString = [args[0], operator, args[1]].join(' ');
            return this.wrapSubExpressionPerPrecedences(subExprString, precedence, outerPrecedence);
        case 'UnaryExpression':
            operator = this.translateOperator(ast.operator);
            precedence = this.precedenceOf(operator, ast.fixity);
            var arg = this.expressionStringForAST(ast.argument, depth + 1, precedence);
            switch (ast.fixity) {
                case 'prefix':
                    subExprString = operator + ' ' + arg;
                    break;
                case 'postfix':
                    subExprString = arg + ' ' + operator;
                    break;
            }
            return this.wrapSubExpressionPerPrecedences(subExprString, precedence, outerPrecedence);
        case 'CastExpression':
            var value = ast.value;
            var castValue = value;
            switch (ast.type_name) {
                case 'string':
                    castValue = value.toString();
                    break;
                case 'number':
                    castValue = Number(value);
                    break;
                case 'array':
                    if (value.length !== undefined) {
                        castValue = new Array(value.length);
                        for (var i=0; i<value.length; i++) {
                            castValue[i] = value[i];
                        }
                    } else {
                        castValue = [value];
                    }
                    break;
                default:
                    throw Error('Unrecognized type', ast.type_name);
            }
            return JSON.stringify(castValue);
        case 'Literal':
            return literalExpressionFor(ast.value);
        case 'ListExpression':
            args = _.map(ast.elements, function (arg) {
                return this.expressionStringForAST(arg, depth + 1, this.precedenceOf('('));
            }, this);
            return '[' + args.join(', ') + ']';
        case 'FunctionCall':
            args = _.map(ast.arguments, function (arg) {
                return this.expressionStringForAST(arg, depth + 1, this.precedenceOf('('));
            }, this);
            return this.expressionForFunctionCall(ast.callee.name, args, outerPrecedence);
        case 'Identifier':
            if (this.handleMultipleColumns) {
                var unsafeInputName = ast.name;
                // Delete all non-word characters, but keep colons and dots.
                var unsafeInputNameWord = unsafeInputName.replace(/[^\W:.]/, '');
                var unsafeInputParts = unsafeInputNameWord.split(/:/);
                var scope;
                if (unsafeInputParts.length === 0) {
                    return 'undefined';
                }
                if (unsafeInputParts.length > 1) {
                    switch (unsafeInputParts[0]) {
                        case 'point':
                            scope = 'point';
                            break;
                        case 'edge':
                            scope = 'edge';
                            break;
                        default:
                            scope = undefined;
                            break;
                    }
                }
                return unsafeInputParts[unsafeInputParts.length - 1];
            }
            return 'value';
        default:
            throw Error('Unrecognized type on AST node: ' + ast.type);
    }
};

module.exports = ExpressionCodeGenerator;