/* -*- tab-width: 2 -*- */
'use strict';

const pathLib = require('path');

const mergeOpt = require('merge-options');

const esbr = require('../esbr.js');

const EX = function simpleFromManifest(rqr, userOpt) {
  let upPath = '';
  let manifPathAbs;
  while (!manifPathAbs) {
    try {
      manifPathAbs = rqr.resolve((upPath || './') + 'package.json');
    } catch (caught) {
      if (caught.code !== 'MODULE_NOT_FOUND') { throw caught; }
      if (upPath.length > 64) { throw caught; }
      upPath += '../';
    }
  }
  const manifData = rqr(manifPathAbs);
  const manifDir = pathLib.dirname(manifPathAbs);

  const esbrOpt = {
    minify: false, // The few bytes saved usually aren't worth the obfuscation.
    targetPlatform: 'nodejs',
    verbosity: 1,
  };
  const opt = mergeOpt(esbrOpt, {
    modName: (manifData.name || 'unnamed'),
    saveDir: 'dist/',
    saveSuf: '.static.js',
  }, manifData.esbrowserify, userOpt);
  Object.keys(esbrOpt).forEach(function upd(k) { esbrOpt[k] = opt[k]; });
  esbrOpt.srcAbs = rqr.resolve(opt.mainFile || upPath);
  esbrOpt.saveAs = pathLib.join(manifDir,
    opt.saveDir + opt.modName + opt.saveSuf);
  return esbr(esbrOpt);
};








module.exports = EX;
