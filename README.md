# eyelog

## Overview

The `TobiiProcess` class is a TypeScript class designed to interact with the Tobii Eye Tracker software through a child process. It allows you to control and communicate with the Tobii Eye Tracker by sending commands and receiving events related to eye tracking data. This class is built on top of Node.js's `child_process` module and is specifically designed for use on Windows platforms.

## Installation

To use the `TobiiProcess` class, you should ensure that you have Node.js installed on your system. Additionally, you need to have the Tobii Eye Tracker software installed.

## Importing the Class

Import the `TobiiProcess` class into your TypeScript or JavaScript file like this:

```javascript
import { TobiiProcess } from './node-eyelog/TobiiProcess';
```

## Class Constructor

### `TobiiProcess(exe?: string)`

- `exe` (optional): A string representing the path to the Tobii Eye Tracker executable. If not provided, it defaults to the path of the `EyeLog.exe` executable located in the `../bin` directory relative to the location of the script.

#### Description

The constructor of the `TobiiProcess` class creates an instance of the class and, if the platform is detected as "win32" (Windows), spawns a child process to run the Tobii Eye Tracker software. It also sets up event listeners to capture and process the output from the Tobii Eye Tracker process.

#### Example

```javascript
const tobiiProcess = new TobiiProcess();
```

## Class Methods

### `setBounds(bounds: Bound[])`

- `bounds`: An array of `Bound` objects representing the regions of interest for eye tracking.

#### Description

This method sends a command to the Tobii Eye Tracker process to set the regions of interest (ROI) for eye tracking. The `bounds` parameter should be an array of `Bound` objects, and these bounds are formatted as a string and sent to the Tobii process.

### `setTimeout(value: number)`

- `value`: A number representing the timeout value in milliseconds.

#### Description

This method sends a command to the Tobii Eye Tracker process to set the timeout value for tracking. The `value` parameter specifies the time, in milliseconds, that the Tobii Eye Tracker will wait for eye tracking data before timing out.

## Class Events

The `TobiiProcess` class extends the `EventEmitter` class and emits the following events:

### `enter`

- Parameters:
  - `index`: A number representing the index associated with the "enter" event.

#### Description

This event is emitted when the Tobii Eye Tracker detects a gaze entering a defined region of interest (ROI). The `index` parameter indicates which ROI was entered.

### `click`

- Parameters:
  - `index`: A number representing the index associated with the "click" event.
  - `count`: A number representing the count of clicks.

#### Description

This event is emitted when the Tobii Eye Tracker detects a "click" event. The `index` parameter indicates which ROI triggered the click event, and the `count` parameter indicates the number of clicks detected.

### `exit`

#### Description

This event is emitted when the Tobii Eye Tracker detects that the gaze has exited all defined regions of interest (ROIs).

## Example Usage

Here's an example of how to use the `TobiiProcess` class:

```javascript
import { TobiiProcess } from './TobiiProcess';

const tobiiProcess = new TobiiProcess();

// Define bounds for regions of interest (ROIs)
const bounds = [
  new Bound(0, 0, 100, 100),
  new Bound(200, 200, 300, 300),
];

// Set bounds for eye tracking
tobiiProcess.setBounds(bounds);

// Set a timeout for eye tracking data
tobiiProcess.setTimeout(500);

// Listen for Tobii Eye Tracker events
tobiiProcess.on('enter', (index) => {
  console.log(`Gaze entered ROI ${index}`);
});

tobiiProcess.on('click', (index, count) => {
  console.log(`Click detected in ROI ${index}. Click count: ${count}`);
});

tobiiProcess.on('exit', () => {
  console.log('Gaze exited all ROIs');
});
```

## Notes

- This class is designed to work on Windows platforms due to the use of the "win32" platform check.
- It assumes that the Tobii Eye Tracker software is properly installed and configured on the system.
- Make sure you have the required dependencies installed, including the `Bound` class and any necessary Tobii Eye Tracker SDK or libraries.

Please consult the official Tobii documentation and the documentation for any additional dependencies for further details and troubleshooting.