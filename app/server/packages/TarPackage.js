'use strict';

/**
 * @module publish-packages
 */

// Module dependencies
var path = require('path');
var fs = require('fs');
var util = require('util');
var async = require('async');
var xml2js = require('xml2js');
var openVeoAPI = require('@openveo/api');
var Package = process.requirePublish('app/server/packages/Package.js');
var errors = process.requirePublish('app/server/packages/errors.js');
var VideoModel = process.requirePublish('app/server/models/VideoModel.js');

// Accepted images files extensions in the package
var acceptedImagesExtensions = ['jpeg', 'jpg', 'gif', 'bmp'];

/**
 * Defines a custom error with an error code.
 *
 * @class TarPackageError
 * @constructor
 * @extends Error
 * @param {String} message The error message
 * @param {String} code The error code
 */
function TarPackageError(message, code) {
  this.name = 'TarPackageError';
  this.message = message || '';
  this.code = code;
}

/**
 * Defines a TarPackage class to manage publication of a tar file.
 *
 * A tar file may contain :
 *  - A video file
 *  - A list of image files
 *  - A .session file describing the package content
 *  - A synchro.xml file with the mapping image / video for a timecode.
 *
 * @example
 *     // tar package object example
 *     {
 *       "id": "13465465", // Id of the package
 *       "type": "vimeo", // Platform type
 *       "originalPackagePath": "/tmp/2015-03-09_16-53-10_rich-media.tar" // Package file
 *     }
 *
 * @example
 *     // ".session" file example contained in a tar package
 *     {
 *       "date": 1425916390, // Timestamp of the video record
 *       "rich-media": true, // true if package contains presentation images
 *       "filename": "video.mp4", // The name of the video file in the package
 *       "duration": 30 // Duration of the video in seconds
 *     }
 *
 * @example
 *     <!-- "synchro.xml" file example contained in a tar package -->
 *     <?xml version="1.0"?>
 *     <player>
 *       <synchro id="slide_00000.jpeg" timecode="0"/>
 *       <synchro id="slide_00001.jpeg" timecode="1200"/>
 *     </player>
 *
 * @class TarPackage
 * @constructor
 * @extends Package
 */
function TarPackage(mediaPackage, logger) {
  Package.call(this, mediaPackage, logger);

  // Validate package timecode file name
  if (!this.publishConf.timecodeFileName || (typeof this.publishConf.timecodeFileName !== 'string'))
    this.emit('error', new TarPackageError('timecodeFileName in publishConf.json must be a String'),
      errors.INVALID_CONFIGURATION);

  // Validate package metadata file name
  if (!this.publishConf.metadataFileName || (typeof this.publishConf.metadataFileName !== 'string'))
    this.emit('error', new TarPackageError('metadataFileName in publishConf.json must be a String'),
      errors.INVALID_CONFIGURATION);

}

module.exports = TarPackage;
util.inherits(TarPackage, Package);

// TarPackage states
TarPackage.PACKAGE_EXTRACTED_STATE = 'packageExtracted';
TarPackage.PACKAGE_VALIDATED_STATE = 'packageValidated';
TarPackage.PUBLIC_DIR_PREPARED_STATE = 'publicDirectoryPrepared';
TarPackage.TIMECODES_SAVED_STATE = 'timecodesSaved';
TarPackage.COPIED_IMAGES_STATE = 'copiedImages';
TarPackage.DIRECTORY_CLEANED_STATE = 'directoryCleaned';

// TarPackage transitions
TarPackage.EXTRACT_PACKAGE_TRANSITION = 'extractPackage';
TarPackage.VALIDATE_PACKAGE_TRANSITION = 'validatePackage';
TarPackage.PREPARE_PACKAGE_TRANSITION = 'preparePublicDirectory';
TarPackage.SAVE_TIMECODES_TRANSITION = 'saveTimecodes';
TarPackage.COPY_IMAGES_TRANSITION = 'copyImages';
TarPackage.CLEAN_DIRECTORY_TRANSITION = 'cleanDirectory';

// Define the order in which transitions will be executed for a TarPackage
TarPackage.stateTransitions = [
  Package.INIT_TRANSITION,
  Package.COPY_PACKAGE_TRANSITION,
  Package.REMOVE_ORIGINAL_PACKAGE_TRANSITION,
  TarPackage.EXTRACT_PACKAGE_TRANSITION,
  TarPackage.VALIDATE_PACKAGE_TRANSITION,
  TarPackage.PREPARE_PACKAGE_TRANSITION,
  Package.UPLOAD_MEDIA_TRANSITION,
  Package.CONFIGURE_MEDIA_TRANSITION,
  TarPackage.SAVE_TIMECODES_TRANSITION,
  TarPackage.COPY_IMAGES_TRANSITION,
  Package.CLEAN_FILE_TRANSITION,
  TarPackage.CLEAN_DIRECTORY_TRANSITION
];

// Define machine state authorized transitions depending on previous and
// next states
TarPackage.stateMachine = Package.stateMachine.concat([
  {
    name: TarPackage.EXTRACT_PACKAGE_TRANSITION,
    from: TarPackage.ORIGINAL_PACKAGE_REMOVED_STATE,
    to: TarPackage.PACKAGE_EXTRACTED_STATE
  },
  {
    name: TarPackage.VALIDATE_PACKAGE_TRANSITION,
    from: TarPackage.PACKAGE_EXTRACTED_STATE,
    to: TarPackage.PACKAGE_VALIDATED_STATE
  },
  {
    name: TarPackage.PREPARE_PACKAGE_TRANSITION,
    from: TarPackage.PACKAGE_VALIDATED_STATE,
    to: TarPackage.PUBLIC_DIR_PREPARED_STATE
  },
  {
    name: Package.UPLOAD_MEDIA_TRANSITION,
    from: TarPackage.PUBLIC_DIR_PREPARED_STATE,
    to: Package.MEDIA_UPLOADED_STATE
  },
  {
    name: TarPackage.SAVE_TIMECODES_TRANSITION,
    from: TarPackage.MEDIA_CONFIGURED_STATE,
    to: TarPackage.TIMECODES_SAVED_STATE
  },
  {
    name: TarPackage.COPY_IMAGES_TRANSITION,
    from: TarPackage.TIMECODES_SAVED_STATE,
    to: TarPackage.COPIED_IMAGES_STATE
  },
  {
    name: Package.CLEAN_FILE_TRANSITION,
    from: TarPackage.COPIED_IMAGES_STATE,
    to: Package.FILE_CLEANED_STATE
  },
  {
    name: TarPackage.CLEAN_DIRECTORY_TRANSITION,
    from: TarPackage.FILE_CLEANED_STATE,
    to: TarPackage.DIRECTORY_CLEANED_STATE
  }
]);

/**
 * Validates package content.
 *
 * A video package must contain, at least a valid package information
 * file and a video file.
 *
 * @example
 *     // mediaPackage example
 *     {
 *       "id" : 1422731934859, // Internal video id
 *       "type" : "vimeo", // The video platform to use
 *       "path" : "C:/Temp/", // The path of the hot folder
 *       "originalPackagePath" : "C:/Temp/video-package.tar", // The original package path in hot folder
 *     }
 *
 * @method validatePackage
 * @async
 * @private
 * @param {Function} callback The function to call when done
 *   - **Error** The error if an error occurred, null otherwise
 *   - **Object** The package information object
 */
function validatePackage(callback) {
  var extractDirectory = path.join(this.publishConf.videoTmpDir, String(this.mediaPackage.id));

  // Read package information file
  openVeoAPI.fileSystem.getJSONFileContent(path.join(extractDirectory, this.publishConf.metadataFileName),
    function(error, packageInformation) {

      // Failed reading file or parsing JSON
      if (error) {
        callback(new Error(error.message));
      } else if (packageInformation.filename) {

        // Got the name of the video file
        // Test if video file really exists in package
        fs.exists(path.join(extractDirectory, '/' + packageInformation.filename), function(exists) {

          if (exists)
            callback(null, packageInformation);
          else
            callback(new Error('Missing file ' + packageInformation.filename));

        });

      } else {

        // No video file name in metadata, package is not valid
        callback(new Error('No video file name found in metadata file'));

      }

    });

}

/**
 * Saves the XML timecode file into a JSON equivalent.
 * This will check if the file exists first.
 *
 * 1. Test if timecode xml file exists
 * 2. Transcode XML file to a JSON equivalent
 *    e.g.
 * 3. Format JSON
 *    e.g.
 *
 * @example
 *     // Transform XML timecodes into JSON
 *     // From :
 *     {
 *       "player": {
 *         "synchro":
 *         [
 *           {
 *             "id": ["slide_00000.jpeg"],
 *             "timecode": ["0"]
 *           }, {
 *             "id": ["slide_00001.jpeg"],
 *             "timecode": ["1200"]
 *           }
 *         ]
 *       }
 *     }
 *
 *     // To :
 *     [
 *       {
 *         "timecode": 0,
 *         "image": {
 *           "small": "slide_00000.jpeg",
 *           "large": "slide_00000.jpeg"
 *         }
 *       },
 *       {
 *         "timecode": 1200,
 *         "image": {
 *           "small": "slide_00001.jpeg",
 *           "large": "slide_00001.jpeg"
 *         }
 *       }
 *     ]
 *
 * @method saveTimecodes
 * @private
 * @async
 * @param {String} xmlTimecodeFilePath The timecode file to save
 * @param {String} destinationFilePath The JSON timecode file path
 * @param {Function} callback The function to call when done
 *   - **Error** The error if an error occurred, null otherwise
 */
function saveTimecodes(xmlTimecodeFilePath, destinationFilePath, callback) {

  async.series([
    function(callback) {

      // Check if XML file exists
      fs.exists(xmlTimecodeFilePath, function(exists) {

        if (exists)
          callback();
        else
          callback(new Error('Missing timecode file ' + xmlTimecodeFilePath));

      });
    },
    function(callback) {

      // Transcode XML to JSON
      fs.readFile(xmlTimecodeFilePath, function(error, data) {

        if (error)
          callback(error);
        else {
          xml2js.parseString(data, {
            mergeAttrs: true
          },
          function(error, timecodes) {

            var formattedTimecodes = [];

            // Transform timecode format to
            if (timecodes && timecodes.player && timecodes.player.synchro) {

              // Iterate through the list of timecodes
              // Change JSON organization to be more accessible
              timecodes.player.synchro.forEach(function(timecodeInfo) {

                if (timecodeInfo['timecode'] && timecodeInfo['timecode'].length) {

                  if (timecodeInfo['id'] && timecodeInfo['id'].length) {
                    formattedTimecodes.push({
                      timecode: parseInt(timecodeInfo['timecode'][0]),
                      image: timecodeInfo['id'][0]
                    });
                  }

                }
              });

            }

            callback(error, formattedTimecodes);
          });
        }

      });

    }
  ], function(error, results) {
    if (error) {
      callback(error);
    } else {
      fs.writeFile(destinationFilePath, JSON.stringify(results[1]),
        {
          encoding: 'utf8'
        },
        function(error) {
          callback(error);
        }
      );
    }
  });

}

/**
 * Gets the stack of transitions corresponding to the package.
 *
 * @return {Array} The stack of transitions
 * @method getTransitions
 */
TarPackage.prototype.getTransitions = function() {
  return TarPackage.stateTransitions;
};

/**
 * Gets the list of transitions states corresponding to the package.
 *
 * @return {Array} The list of states/transitions
 * @method getStateMachine
 */
TarPackage.prototype.getStateMachine = function() {
  return TarPackage.stateMachine;
};

/**
 * Extracts package into temporary directory.
 *
 * This is a transition.
 *
 * @method extractPackage
 * @private
 */
TarPackage.prototype.extractPackage = function() {
  var self = this;
  var extractDirectory = path.join(this.publishConf.videoTmpDir, '/' + this.mediaPackage.id);

  // Extract package
  this.videoModel.updateState(this.mediaPackage.id, VideoModel.EXTRACTING_STATE);

  // Copy destination
  var packagePath = path.join(this.publishConf.videoTmpDir, this.mediaPackage.id + '.tar');

  this.logger.debug('Extract package ' + packagePath + ' to ' + extractDirectory);
  openVeoAPI.fileSystem.extract(packagePath, extractDirectory, function(error) {

    // Extraction failed
    if (error) {
      self.setError(new TarPackageError(error.message, errors.EXTRACT_ERROR));
    }

    // Extraction done
    else
      self.fsm.transition();

  });
};

/**
 * Validates the package by analyzing its content.
 *
 * This is a transition.
 *
 * @method validatePackage
 * @private
 */
TarPackage.prototype.validatePackage = function() {
  var self = this;
  this.logger.debug('Validate package ' + this.mediaPackage.originalPackagePath);
  this.videoModel.updateState(this.mediaPackage.id, VideoModel.VALIDATING_STATE);

  // Validate package content
  validatePackage.call(this, function(error, metadata) {
    if (error)
      self.setError(new TarPackageError(error.message, errors.VALIDATION_ERROR));
    else {
      self.mediaPackage.metadata = metadata;
      self.videoModel.updateMetadata(self.mediaPackage.id, self.mediaPackage.metadata);

      if (self.mediaPackage.metadata.date)
        self.videoModel.updateDate(self.mediaPackage.id, self.mediaPackage.metadata.date);
      self.fsm.transition();
    }
  });
};

/**
 * Prepares public directory where the media associated files will be deployed.
 *
 * This is a transition.
 *
 * @method preparePublicDirectory
 * @private
 */
TarPackage.prototype.preparePublicDirectory = function() {
  var self = this;
  var publicDirectory = path.normalize(process.rootPublish + '/public/publish/videos/' + this.mediaPackage.id);
  this.videoModel.updateState(this.mediaPackage.id, VideoModel.PREPARING_STATE);

  this.logger.debug('Prepare package public directory ' + publicDirectory);

  openVeoAPI.fileSystem.mkdir(path.normalize(process.rootPublish + '/public/publish/videos/' + this.mediaPackage.id),
    function(error) {
      if (error && error.code !== 'EEXIST')
        self.setError(new TarPackageError(error.message, errors.CREATE_VIDEO_PUBLIC_DIR_ERROR));
      else
        self.fsm.transition();
    });
};

/**
 * Saves package timecodes into a JSON file.
 *
 * This is a transition.
 *
 * @method preparePublicDirectory
 * @private
 */
TarPackage.prototype.saveTimecodes = function() {
  var self = this;
  var extractDirectory = path.join(this.publishConf.videoTmpDir, String(this.mediaPackage.id));
  var videoFinalDir = path.normalize(process.rootPublish + '/public/publish/videos/' + this.mediaPackage.id);

  this.logger.debug('Save timecodes to ' + videoFinalDir);
  this.videoModel.updateState(this.mediaPackage.id, VideoModel.SAVING_TIMECODES_STATE);

  saveTimecodes(path.join(extractDirectory, this.publishConf.timecodeFileName), path.join(videoFinalDir,
    'synchro.json'), function(error) {
      if (error && self.mediaPackage.metadata['rich-media'])
        self.setError(new TarPackageError(error.message, errors.SAVE_TIMECODE_ERROR));
      else
        self.fsm.transition();
    });
};

/**
 * Copies presentation images from temporary directory to the public directory.
 *
 * This is a transition.
 *
 * @method copyImages
 * @private
 */
TarPackage.prototype.copyImages = function() {
  var self = this;
  var extractDirectory = path.join(this.publishConf.videoTmpDir, String(this.mediaPackage.id));
  var videoFinalDir = path.normalize(process.rootPublish + '/public/publish/videos/' + this.mediaPackage.id);

  this.logger.debug('Copy images to ' + videoFinalDir);

  fs.readdir(extractDirectory, function(error, files) {
    if (error)
      self.setError(new TarPackageError(error.message, errors.SCAN_FOR_IMAGES_ERROR));
    else {

      var filesToCopy = [];
      files.forEach(function(file) {

        // File extension is part of the accepted extensions
        if (acceptedImagesExtensions.indexOf(path.extname(file).slice(1)) >= 0)
          filesToCopy.push(file);

      });

      var filesLeftToCopy = filesToCopy.length;
      filesToCopy.forEach(function(file) {

        openVeoAPI.fileSystem.copy(path.join(extractDirectory, file), path.join(videoFinalDir, file), function(error) {

          if (error)
            self.logger.warn(error.message, {
              action: 'copyImages',
              mediaId: self.mediaPackage.id
            });

          filesLeftToCopy--;

          if (filesLeftToCopy === 0)
            self.fsm.transition();

        });

      });
    }
  });
};

/**
 * Removes extracted tar files from temporary directory.
 *
 * This is a transition.
 *
 * @method copyImages
 * @private
 */
TarPackage.prototype.cleanDirectory = function() {
  var self = this;
  var directoryToRemove = path.join(this.publishConf.videoTmpDir, '/' + this.mediaPackage.id);

  // Remove package temporary directory
  this.logger.debug('Remove temporary directory ' + directoryToRemove);
  openVeoAPI.fileSystem.rmdir(directoryToRemove, function(error) {
    if (error)
      self.setError(new TarPackageError(error.message, errors.CLEAN_DIRECTORY_ERROR));
    else
      self.fsm.transition();
  });
};

/**
 * Gets the media file path of the package.
 *
 * @return {String} System path of the media file
 * @method getMediaFilePath
 */
TarPackage.prototype.getMediaFilePath = function() {
  return path.join(this.publishConf.videoTmpDir,
    '/' + this.mediaPackage.id + '/' + this.mediaPackage.metadata.filename);
};