# Introduction

Configuration files are all in user's directory under **~/.openveo/publish**

- **~/.openveo/publish/publishConf.json**
- **~/.openveo/publish/videoPlatformConf.json**
- **~/.openveo/publish/loggerConf.json**
- **~/.openveo/publish/watcherConf.json**

**Nb :** You must restart OpenVeo servers after modifications.

# Configure the plugin

Open **~/.openveo/publish/publishConf.json**

```json
{
  "videoTmpDir" : "/tmp/videos", // Temporary directory to stock uploading videos (video is removed after the upload)
  "maxConcurrentPublish" : 3, // Maximum number of videos to upload simultaneously
  "timecodeFileName" : "synchro.xml", // Name of the file containing images synchronization in tar package
  "metadataFileName" : ".session" // Name of the video metadata file in a tar package
}
```

# Configure video platform credentials

Uploading to Vimeo requires oauth credentials.

Open **~/.openveo/publish/videoPlatformConf.json**

```json
{
  "vimeo" : { // Vimeo platform configuration
    "clientId" : "vimeo client id (available on vimeo application page https://developer.vimeo.com/apps)",
    "clientSecret" : "vimeo client secret (available on vimeo application page https://developer.vimeo.com/apps)",
    "accessToken" : "vimeo access token (available on vimeo application page https://developer.vimeo.com/apps)"
  }
}
```

# Configure the logger

Open **~/.openveo/publish/loggerConf.json**

```json
{
  "watcher": { // Watcher logger
    "fileName" : "/var/log/openveo-watcher.log", // Path to log file
    "level" : "info", // Log level
    "maxFileSize" : 1048576, // Maximum log file size (in Bytes)
    "maxFiles" : 2 // Maximum number of files archived
  },
  "publish" : { // Publish logger
    "fileName" : "var/log/openveo-publish.log", // Path to log file
    "level" : "info", // Log level
    "maxFileSize" : 1048576, // Maximum log file size (in Bytes)
    "maxFiles" : 2 // Maximum number of files archived
  }
}
```

# Configure the [watcher](/watcher)

Open **~/.openveo/publish/watcherConf.json**

```json
{
  "hotFolders" : [ // List of folders to watch
    {
      "type" : "vimeo", // Video platform to upload to for this hot folder (only vimeo is supported)
      "path" : "/user/box/hot1" // Path to the hot folder
    },
    {
      "type" : "vimeo", // Video platform to upload to for this hot folder (only vimeo is supported)
      "path" : "/user/box/hot2" // Path to the hot folder
    },
    {
      "type" : "vimeo", // Video platform to upload to for this hot folder (only vimeo is supported)
      "path" : "/user/box/hot3" // Path to the hot folder
    }
    ...
  ]
}
```

**Nb :** If **type** is missing for a hot folder, videos won't be automatically uploaded to Vimeo. Videos can be uploaded to Vimeo from the catalogue of videos in the back end.