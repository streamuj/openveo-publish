'use strict';

/**
 * @module packages
 */

/**
 * Defines the package factory.
 *
 * @class factory
 * @static
 */

var openVeoApi = require('@openveo/api');
var VideoProvider = process.requirePublish('app/server/providers/VideoProvider.js');
var fileSystem = openVeoApi.fileSystem;

/**
 * Gets an instance of a Package depending on package file type (factory).
 *
 * @method get
 * @static
 * @param {String} type The type of the package platform to instanciate
 * @param {Object} mediaPackage Information about the media
 * @return {Package} An instance of a Package sub class
 */
module.exports.get = function(type, mediaPackage) {
  if (type) {
    var coreApi = process.api.getCoreApi();
    var videoProvider = new VideoProvider(coreApi.getDatabase());

    switch (type) {
      case fileSystem.FILE_TYPES.TAR:
        var TarPackage = process.requirePublish('app/server/packages/TarPackage.js');
        return new TarPackage(mediaPackage, videoProvider);

      case fileSystem.FILE_TYPES.MP4:
        var VideoPackage = process.requirePublish('app/server/packages/VideoPackage.js');
        return new VideoPackage(mediaPackage, videoProvider);

      default:
        throw new Error('Package type is not valid (' + mediaPackage.packageType + ')');
    }
  }
};
