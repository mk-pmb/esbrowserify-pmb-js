/*jslint indent: 2, maxlen: 80, continue: false, unparam: false, node: true */
/* -*- tab-width: 2 -*- */
'use strict';

var EX, isStr = require('is-string'), promisify = require('pify'),
  resolvePath = require('path').resolve,
  browserify = require('browserify'),
  promisedFs = require('nofs');

function ifArg(x, f) { return x && f(x); }


EX = function esbrowserify(opt) {
  var brOpt, babOpt, pr, dbgLv = (+opt.verbosity || 0),
    minify = opt.minify,
    srcAbs = resolvePath(String(opt.srcAbs || ''));
  if (dbgLv >= 1) { console.info('Gonna esbrowserify: %s', srcAbs); }
  babOpt = {
    presets: EX.defaultBabelifyPresets.map(require.resolve),
  };
  brOpt = {
    sourceType: 'module',
    extensions: ['.mjs', '.jsm', '.js'],
    debug: true,
    plugins: [
      'esmify',
    ],
    transform: [
      ['babelify', babOpt],
      ['envify', Object.assign(EX.defaultEnvifyVars, opt.envify)],
      'brfs',
    ],
    entries: [srcAbs],
  };

  if ((minify === undefined) || (minify === true)) {
    minify = EX.defaultMinifier;
  }
  if (minify) { brOpt.transform.push(minify); }

  (function targetPlatform(plat) {
    if (!plat) { return; }
    if (plat === 'browser') { return; }
    if (plat === 'nodejs') {
      brOpt.node = true;
      return;
    }
    throw new Error('Unsupported target platform: ' + plat);
  }(opt.targetPlatform));

  ifArg(opt.refineBrOpt, function refine(f) { brOpt = f(brOpt) || brOpt; });
  brOpt.transform = brOpt.transform.map(EX.resolveTransform);
  pr = EX.promisingBrowserify(brOpt).then(String);

  ifArg(opt.saveAs, function maybeSave(saveAs) {
    saveAs = resolvePath(srcAbs, '..', saveAs);
    pr = pr.then(EX.saveBundleAs.bind(null, dbgLv, saveAs));
  });

  return pr;
};


EX.defaultBabelifyPresets = [
  '@babel/preset-env',
];


EX.defaultMinifier = ['uglifyify', { global: true }];


EX.defaultEnvifyVars = (function () {
  var v = {}, usc = '_';
  v[usc] = 'purge';
  return v;
}());


EX.resolveTransform = function reso(x) {
  if (isStr(x)) { return require.resolve(x); }
  if (Array.isArray(x) && (x.length >= 1)) {
    return [reso(x[0])].concat(x.slice(1));
  }
  return x;
};


EX.promisingBrowserify = promisify(function startBundling(brOpt, next) {
  browserify(brOpt).bundle(function unmute(err, data) {
    // Browserify seems to silently discard any errors from this callback,
    // so let's use setImmediate to break free:
    setImmediate(function uncaught() { return next(err, data); });
  });
});


function logDone() { console.info('Done.'); }

EX.saveBundleAs = function saveBundleAs(dbgLv, destPath, code) {
  if (dbgLv >= 1) {
    console.info('Write %s bytes to: %s', code.length, destPath);
  }
  if (!code) { throw new Error('Empty bundle!'); }
  var pr = promisedFs.writeFile(destPath, code, { encoding: 'UTF-8' });
  if (dbgLv >= 1) { pr = pr.then(logDone); }
  return pr;
};


EX.simpleFromManifest = function simpleFromManifest(rqr, upPath, mainFile) {
  /*
    rqr: Mandatory. Your compile script's require() function.
    upPath: Optional. Path to the directory that holds your package.json.
    mainFile: Optional. Path to your entry (main) script.
  */
  if (!upPath) {
    upPath = '..';
    /* Because the recommended place to call this from is
       $REPO/build/compile_static_bundle.js */
  }
  var manif = rqr(upPath + '/package.json');
  return EX({
    srcAbs: rqr.resolve(mainFile || upPath),
    targetPlatform: 'nodejs',
    saveAs: './node_modules/' + (manif.name || 'unnamed') + '.static.js',
    verbosity: 1,
    minify: false, // The few bytes saved usually aren't worth the obfuscation.
  });
};
























module.exports = EX;
