/*jslint indent: 2, maxlen: 80, continue: false, unparam: false, node: true */
/* -*- tab-width: 2 -*- */
/*global Promise: true */
'use strict';

var EX,
  // ==BEGIN== Sorted part of our dependencies
  isStr = require('is-string'),
  loMapValues = require('lodash.mapvalues'),
  mergeOpt = require('merge-options'),
  promisedFs = require('nofs'),
  promisify = require('pify'),
  relPath = require('absdir')(module, '.'),
  resolvePath = require('path').resolve,
  // ==ENDOF== Sorted part of our dependencies
  browserify = require('browserify');


function fail(why) { throw new Error(why); }
function ifArg(x, f) { return x && f(x); }
function jsonDeepCopy(orig) { return JSON.parse(JSON.stringify(orig)); }


EX = function esbrowserify(opt) {
  var brOpt, babOpt, pr, fx = {}, dbgLv = (+opt.verbosity || 0),
    minify = opt.minify,
    srcAbs = resolvePath(String(opt.srcAbs || ''));
  if (dbgLv >= 1) { console.info('Gonna esbrowserify: %s', srcAbs); }
  babOpt = {
    presets: EX.defaultBabelifyPresets.map(require.resolve),
  };
  brOpt = mergeOpt({
    sourceType: 'module',
    extensions: ['.mjs', '.jsm', '.js'],
    debug: true,
    plugins: [
      'esmify',
    ],
    transform: [].concat(opt.earlyTransform, [
      ['aliasify', Object.assign(EX.defaultAliasifyOpt, opt.aliasify)],
      ['babelify', babOpt],
      ['envify', Object.assign(EX.defaultEnvifyVars, opt.envify)],
      'brfs',
    ]).filter(Boolean),
    entries: [srcAbs],
    require: [].concat(opt.extraPkg).filter(Boolean),
  }, opt.brOpt);

  function installFxGetter(name, value) {
    return function installer(x) {
      if (value === undefined) { value = x; }
      fx['get' + name] = function get() { return value; };
      return x;
    };
  }

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
    fail('Unsupported target platform: ' + plat);
  }(opt.targetPlatform));

  pr = Promise.resolve();

  pr = pr.then(opt.onBeforeRefine);

  pr = pr.then(function actuallyBrowserifyForRealNow() {
    ifArg(opt.refineBrOpt, function refine(f) { brOpt = f(brOpt) || brOpt; });
    brOpt.transform = brOpt.transform.map(EX.resolveTransform);
    installFxGetter('EffectiveBrowserifyConfig')(brOpt);
    return EX.promisingBrowserify(brOpt, opt);
  });

  pr = pr.then(installFxGetter('UnstringifiedCode'));
  pr = pr.then(opt.onBeforeStringifyCode);
  pr = pr.then(String);
  pr = pr.then(installFxGetter('StringifiedCode'));
  pr = pr.then(opt.onAfterStringifyCode);

  ifArg(opt.saveAs, function maybeSave(saveAs) {
    saveAs = resolvePath(srcAbs, '..', saveAs);
    pr = pr.then(EX.saveBundleAs.bind(null, dbgLv, saveAs));
    pr = pr.then(opt.onSaved);
  });

  pr = pr.then(opt.onDone);
  pr.fx = fx;
  return pr;
};


EX.pkgName = require('./package.json').name;
EX.esbrDir = relPath('.');
EX.stubsDir = relPath('./fx/stubs');

function pathInsideDir(path, dir) {
  if (!path) { fail('pathInsideDir: no path!'); }
  if (!dir) { fail('pathInsideDir: no dir!'); }
  return (resolvePath(path) + '/').startsWith(dir + '/');
}


EX.defaultBabelifyPresets = [
  '@babel/preset-env',
];


EX.defaultMinifier = ['uglifyify', { global: true }];


EX.defaultEnvifyVars = (function () {
  var v = {}, usc = '_';
  v[usc] = 'purge';
  return v;
}());


EX.defaultAliasifyOpt = (function decideDefaultAliasifyOpt() {
  var ali = {}, rpl = {};
  return { aliases: ali, replacements: rpl, verbose: false };
}());


EX.resolveTransform = function reso(x) {
  if (isStr(x)) { return require.resolve(x); }
  if (Array.isArray(x) && (x.length >= 1)) {
    return [reso(x[0])].concat(x.slice(1));
  }
  return x;
};


EX.promisingBrowserify = promisify(function startBundling(brOpt, opt, next) {
  var brfy = browserify(jsonDeepCopy(brOpt)); /*
    Deep-copy because browserify seems (@2023-04-15) to modify the config
    inplace in a way that creates loops. */
  brfy.on('file', function warnSelfRequire(absPath, id) {
    // Allow require-ing our stubs, assuming they will be dealt with later:
    if (pathInsideDir(absPath, EX.stubsDir)) { return; }
    // Disallow require-ing anything else from esbr because that would
    // probably be an accident:
    if (pathInsideDir(absPath, EX.esbrDir)) {
      fail('Source is trying to require ' + absPath + ' as ' + id);
    }
    // Require for anything outside esbr: Not our problem.
  });
  loMapValues(opt.on || {}, function install(f, ev) { brfy.on(ev, f); });
  brfy.bundle(function unmute(err, data) {
    /* Browserify seems to silently discard any errors from this callback,
      so let's use setImmediate to break free: */
    setImmediate(function uncaught() { return next(err, data); });
  });
});


function logDone() { console.info('Done.'); }

EX.saveBundleAs = function saveBundleAs(dbgLv, destPath, code) {
  if (dbgLv >= 1) {
    console.info('Write %s bytes to: %s', code.length, destPath);
  }
  if (!code) { fail('Empty bundle!'); }
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
  var manif = rqr(upPath + '/package.json'),
    modName = (manif.name || 'unnamed');
  return EX({
    srcAbs: rqr.resolve(mainFile || upPath),
    targetPlatform: 'nodejs',
    saveAs: (upPath + '/node_modules/' + modName + '.static.js'),
    verbosity: 1,
    minify: false, // The few bytes saved usually aren't worth the obfuscation.
  });
};
























module.exports = EX;
