
<!--#echo json="package.json" key="name" underline="=" -->
esbrowserify-pmb
================
<!--/#echo -->

<!--#echo json="package.json" key="description" -->
Easily browserify ES modules. Think esmod-pmb/nodemjs but for browserify.
<!--/#echo -->



API
---

This module exports one function:

### esbrowserify(opt)

Where `opt` is an options object which supports these mostly optional keys:

* `srcAbs` (string, required): Absolute path to your entrypoint.
* `saveAs` (string): If truthy, path where to save the bundle code.
  May be relative to `srcAbs`.
* `verbosity` (number): Log level. 0 = silent (default),
  1 = report a few lifecycle events.
* `minify`: Whether to minify the bundle.
  `undefined` or `true` (default): Use default minifier.
  `false`: Don't minify.
  any other truthy value: Append the value to the browserify `plugins` option.
* `envify` (object): Custom variables for [`envify`](https://npm.im/envify).


Returns a Promise for the bundle code as a string.





Usage
-----

see [the tests](test/).


<!--#toc stop="scan" -->



Known issues
------------

* `ReferenceError: regeneratorRuntime is not defined`:
  [solved](https://github.com/mk-pmb/esbrowserify-pmb-js/issues/1)
* Needs more/better tests and docs.







&nbsp;


License
-------
<!--#echo json="package.json" key=".license" -->
ISC
<!--/#echo -->
