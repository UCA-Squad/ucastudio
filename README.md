# UcaStudio

Fork from https://github.com/slampunk/ghettostudio

A web-based recording studio for Opencast.

UcaStudio uses the recording capabilities built into modern browsers to record audio, video and desktop streams.
The recording is done in part in the user's browser: a blob is pushed every x seconds to the server in order to be saved and without overloading the memory or storage of the user. The stream is saved via ffmpeg. Network access is required.
When connecting to the tool, a flow test is performed to direct the user to the appropriate resolution based on the result of the flow test.
The user can then choose the resolution he wishes to use.
When sharing the camera, a test of the different available resolutions is performed in order to only propose the resolutions that the webcam is capable of using.
The user can choose whether or not to transfer his record to the opencast platform.
At the end, the user can recover an archive of their media with the metadata entered beforehand. It can also generate media with the two merged sources.

## Configuration
You can configure all inside config.json

## Build Instructions

To build Studio yourself, execute these commands:

```sh
% git clone https://github.com/UCA-Squad/ucastudio.git
% cd ucastudio
% npm install
% node server.js
```

To operate the speed test, push the file "checkSpeedNtwk" on server with apache or nginx
(cf. https://www.npmjs.com/package/network-js/v/2.0.0)

## Supported Browsers

The following table depicts the current state of browser support.

| OS      | Browser    | Capture Camera | Capture Screen | Capture Audio | Record
| --------| ---------- | -------------- | -------------- | -------------- | ------
| Win   | Chrome 65  | ✔   | ✔ | ✔ | ✔   |
| Win   | Firefox 60 | ✔   | ✔ | ✔ | ✔   |
| Linux   | Chrome 64  | ✔   | ✔ | ✔ | ✔   |
| Linux   | Firefox 60 | ✔   | ✔ | ✔ | ✔   |
| macOS   | Chrome 65  | ✔   | ✔ | ✔ | ✔   |
| macOS   | Firefox 70 | ✔   | ✔ | ✔ | ✔   |


Browsers/systems not listed in this table are not currently tested by us, so they might or might not work.