#! /usr/bin/env node

var U = require("../tools/node");
var path = require("path");
var fs = require("fs");
var assert = require("assert");
var sys = require("util");

var tests_dir = path.dirname(module.filename);

run_compress_tests();

/* -----[ utils ]----- */

function tmpl() {
    return U.string_template.apply(this, arguments);
}

function log() {
    var txt = tmpl.apply(this, arguments);
    sys.puts(txt);
}

function log_directory(dir) {
    log("*** Entering [{dir}]", { dir: dir });
}

function log_start_file(file) {
    log("--- {file}", { file: file });
}

function log_test(name) {
    log("    Running test [{name}]", { name: name });
}

function find_test_files(dir) {
    var files = fs.readdirSync(dir).filter(function(name){
        return /\.js$/i.test(name);
    });
    return files;
}

function test_directory(dir) {
    return path.resolve(tests_dir, dir);
}

function run_compress_tests() {
    var dir = test_directory("compress");
    log_directory("compress");
    var files = find_test_files(dir);
    function test_file(file) {
        log_start_file(file);
        function test_case(test) {
            log_test(test.name);
            var cmp = new U.Compressor(test.options || {}, true);
            var expect = make_code(test.expect, false);
            var output = make_code(test.input.squeeze(cmp), false);
            if (expect != output) {
                log("!!! failed\n---INPUT---\n{input}\n---OUTPUT---\n{output}\n---EXPECTED---\n{expected}\n\n", {
                    input: make_code(test.input),
                    output: output,
                    expected: expect
                });
            }
        }
        var tests = parse_test(path.resolve(dir, file));
        for (var i in tests) if (tests.hasOwnProperty(i)) {
            test_case(tests[i]);
        }
    }
    files.forEach(function(file){
        test_file(file);
    });
}

function parse_test(file) {
    var script = fs.readFileSync(file, "utf8");
    var ast = U.parse(script);
    var tests = {};
    var tw = new U.TreeWalker(function(node, descend){
        if (node instanceof U.AST_LabeledStatement
            && tw.parent() instanceof U.AST_Toplevel) {
            var name = node.label.name;
            tests[name] = get_one_test(name, node.body);
            return true;
        }
        if (!(node instanceof U.AST_Toplevel)) croak(node);
    });
    ast.walk(tw);
    return tests;

    function croak(node) {
        throw new Error(tmpl("Can't understand test file {file} [{line},{col}]\n{code}", {
            file: file,
            line: node.start.line,
            col: node.start.col,
            code: make_code(node, false)
        }));
    }

    function get_one_test(name, block) {
        var test = { name: name, options: {} };
        var tw = new U.TreeWalker(function(node, descend){
            if (node instanceof U.AST_Assign) {
                if (!(node.left instanceof U.AST_SymbolRef)) {
                    croak(node);
                }
                var name = node.left.name;
                test[name] = evaluate(node.right);
                return true;
            }
            if (node instanceof U.AST_LabeledStatement) {
                assert.ok(
                    node.label.name == "input" || node.label.name == "expect",
                    tmpl("Unsupported label {name} [{line},{col}]", {
                        name: node.label.name,
                        line: node.label.start.line,
                        col: node.label.start.col
                    })
                );
                var stat = node.body;
                if (stat instanceof U.AST_BlockStatement && stat.body.length == 1)
                    stat = stat.body[0];
                test[node.label.name] = stat;
                return true;
            }
        });
        block.walk(tw);
        return test;
    };
}

function make_code(ast, beautify) {
    if (arguments.length == 1) beautify = true;
    var stream = U.OutputStream({ beautify: beautify });
    ast.print(stream);
    return stream.get();
}

function evaluate(code) {
    if (code instanceof U.AST_Node)
        code = make_code(code);
    return new Function("return(" + code + ")")();
}
